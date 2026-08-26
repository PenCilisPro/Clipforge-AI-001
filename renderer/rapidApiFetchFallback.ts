// ClipForge AI — RapidAPI YouTube download fallback
//
// The processing pipeline uses fetch() for the RapidAPI downloader. This
// wrapper intercepts failed RapidAPI download requests and transparently
// falls back to a local yt-dlp installation, so the rest of the pipeline
// does not need to know which provider produced the source file.
//
// Requirements on the machine running the renderer pipeline:
//   - yt-dlp available on PATH, or YTDLP_PATH pointing to the executable
//   - ffmpeg available on PATH (recommended for best YouTube format support)

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const originalFetch = globalThis.fetch.bind(globalThis);

const RAPIDAPI_HOST =
  process.env.RAPIDAPI_HOST ||
  "youtube-media-downloader.p.rapidapi.com";

const YTDLP_PATH = process.env.YTDLP_PATH || "yt-dlp";

function isRapidApiDownloadRequest(input: RequestInfo | URL): boolean {
  try {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return url.includes(`${RAPIDAPI_HOST}/v2/video/download`);
  } catch {
    return false;
  }
}

function extractYoutubeUrl(input: RequestInfo | URL): string | null {
  try {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const parsed = new URL(url);
    return parsed.searchParams.get("url");
  } catch {
    return null;
  }
}

function isQuotaOrProviderFailure(response: Response): boolean {
  return response.status === 401 ||
    response.status === 402 ||
    response.status === 403 ||
    response.status === 408 ||
    response.status === 429 ||
    response.status >= 500;
}

async function downloadWithYtDlp(youtubeUrl: string): Promise<Response> {
  const workDir = await mkdtemp(path.join(tmpdir(), "clipforge-ytdlp-"));
  const outputPath = path.join(workDir, "source.mp4");

  try {
    console.warn(
      `[ClipForge] RapidAPI unavailable; falling back to yt-dlp for ${youtubeUrl}`,
    );

    await execFileAsync(
      YTDLP_PATH,
      [
        "--no-playlist",
        "--no-part",
        "--no-mtime",
        "--merge-output-format",
        "mp4",
        "-f",
        "bv*+ba/b",
        "-o",
        outputPath,
        youtubeUrl,
      ],
      {
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    const bytes = await readFile(outputPath);

    if (bytes.length === 0) {
      throw new Error("yt-dlp produced an empty video file.");
    }

    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "video/mp4",
        "content-length": String(bytes.length),
        "x-clipforge-downloader": "yt-dlp",
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `RapidAPI failed and yt-dlp fallback failed: ${detail}`,
    );
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

globalThis.fetch = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  if (!isRapidApiDownloadRequest(input)) {
    return originalFetch(input, init);
  }

  const response = await originalFetch(input, init);

  if (!isQuotaOrProviderFailure(response)) {
    return response;
  }

  const youtubeUrl = extractYoutubeUrl(input);
  if (!youtubeUrl) {
    return response;
  }

  return downloadWithYtDlp(youtubeUrl);
};

console.log(
  `[ClipForge] YouTube downloader fallback enabled (RapidAPI -> yt-dlp).`,
);
