// Shared Google Speech-to-Text client.
//
// Used by both renderer/pipeline.ts (transcribes an intermediate clip before
// the Remotion render job is created) and renderer/ffmpegWorker.ts
// (transcribes the finished render, for clips that reach it with no caption
// words already set - e.g. the browser-triggered path). Kept as one module
// so both stay in sync instead of drifting like the old per-file Whisper
// calls did.

import { readFileSync } from "node:fs";

export interface CaptionWordResult {
  text: string;
  start: number;
  end: number;
}

// Google's synchronous speech:recognize endpoint is limited to ~60s of audio.
// Longer clips need the async longrunningrecognize flow.
const SYNC_LIMIT_SEC = 55;
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 45;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseOffset(offset: any): number {
  if (typeof offset === "number") {
    return offset;
  }

  if (typeof offset === "string") {
    return parseFloat(offset.replace(/s$/, "")) || 0;
  }

  // v1 REST also allows {seconds, nanos} objects.
  const seconds = Number(offset?.seconds || 0);
  const nanos = Number(offset?.nanos || 0);

  return seconds + nanos / 1e9;
}

function parseResponse(
  data: any,
): { words: CaptionWordResult[]; text: string } {
  const results = Array.isArray(data?.results)
    ? data.results
    : [];

  const words: CaptionWordResult[] = [];
  const textParts: string[] = [];

  for (const result of results) {
    const alternative = result?.alternatives?.[0];

    if (!alternative) {
      continue;
    }

    if (alternative.transcript) {
      textParts.push(alternative.transcript);
    }

    for (const word of alternative.words ?? []) {
      words.push({
        text: String(word.word || "").trim(),
        start: Number(parseOffset(word.startTime).toFixed(2)),
        end: Number(parseOffset(word.endTime).toFixed(2)),
      });
    }
  }

  return { words, text: textParts.join(" ").trim() };
}

/**
 * Transcribes a mono 16kHz LINEAR16 WAV file with word-level timestamps.
 * Never throws - returns empty words/text on any failure so callers can
 * treat "no captions" as a safe, non-fatal outcome.
 */
export async function transcribeAudioFile(
  wavPath: string,
  durationSec: number,
  apiKey: string,
): Promise<{ words: CaptionWordResult[]; text: string }> {
  try {
    const audioContent = readFileSync(wavPath).toString(
      "base64",
    );

    const config = {
      encoding: "LINEAR16",
      sampleRateHertz: 16000,
      languageCode: "en-US",
      enableWordTimeOffsets: true,
      enableAutomaticPunctuation: true,
    };

    if (durationSec <= SYNC_LIMIT_SEC) {
      const response = await fetch(
        `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            config,
            audio: { content: audioContent },
          }),
        },
      );

      if (!response.ok) {
        console.warn(
          `[GoogleSTT] recognize returned ${response.status}: ${await response.text()}`,
        );

        return { words: [], text: "" };
      }

      return parseResponse(await response.json());
    }

    const startResponse = await fetch(
      `https://speech.googleapis.com/v1/speech:longrunningrecognize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config,
          audio: { content: audioContent },
        }),
      },
    );

    if (!startResponse.ok) {
      console.warn(
        `[GoogleSTT] longrunningrecognize returned ${startResponse.status}: ${await startResponse.text()}`,
      );

      return { words: [], text: "" };
    }

    const startData = (await startResponse.json()) as any;
    const operationName = startData.name;

    if (!operationName) {
      console.warn(
        "[GoogleSTT] long-running op had no operation name.",
      );

      return { words: [], text: "" };
    }

    for (
      let attempt = 0;
      attempt < POLL_MAX_ATTEMPTS;
      attempt++
    ) {
      await sleep(POLL_INTERVAL_MS);

      const pollResponse = await fetch(
        `https://speech.googleapis.com/v1/operations/${operationName}?key=${apiKey}`,
      );

      if (!pollResponse.ok) {
        continue;
      }

      const pollData = (await pollResponse.json()) as any;

      if (pollData.done) {
        if (pollData.error) {
          console.warn(
            "[GoogleSTT] long-running op failed:",
            JSON.stringify(pollData.error),
          );

          return { words: [], text: "" };
        }

        return parseResponse(pollData.response);
      }
    }

    console.warn(
      "[GoogleSTT] long-running op timed out waiting for completion.",
    );

    return { words: [], text: "" };
  } catch (error) {
    console.warn(
      "[GoogleSTT] failed:",
      error instanceof Error ? error.message : String(error),
    );

    return { words: [], text: "" };
  }
}
