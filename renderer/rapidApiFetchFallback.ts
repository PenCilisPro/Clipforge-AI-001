// ClipForge AI — RapidAPI YouTube download fallback
// Transparently falls back to local yt-dlp whenever RapidAPI cannot provide
// a usable download response. The renderer worker must have yt-dlp + ffmpeg.

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const originalFetch = globalThis.fetch.bind(globalThis);
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || "youtube-media-downloader.p.rapidapi.com";
const YTDLP_PATH = process.env.YTDLP_PATH || "yt-dlp";

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

function isRapidApiDownloadRequest(input: RequestInfo | URL): boolean {
  try {
    return requestUrl(input).includes(`${RAPIDAPI_HOST}/v2/video/download`);
  } catch {
    return false;
  }
}

function extractYoutubeUrl(input: RequestInfo | URL): string | null {
  try {
    const parsed = new URL(requestUrl(input));
    return parsed.searchParams.get("url");
  } catch {
    return null;
  }
}

async function responseLooksLikeFailure(response: Response): Promise<boolean> {
  if (!response.ok) return true;

  // Some RapidAPI providers return HTTP 200 with an error payload when a
  // quota/provider failure occurs. Only inspect small JSON/text responses;
  // never buffer a successful video body just to classify it.
  const contentType = response.headers.get("content-type") || "";
  const contentLength = Number(response.headers.get("content-length") || "0");
  if (contentType.includes("video/") || contentLength > 1_000_000) return false;

  try {
    const clone = response.clone();
    const text = (await clone.text()).toLowerCase();
    return /quota|rate.?limit|too many requests|limit exceeded|provider error|download failed|unavailable|not found|error/.test(text);
  } catch {
    return false;
  }
}

async function downloadWithYtDlp(youtubeUrl: string): Promise<Response> {
  const workDir = await mkdtemp(path.join(tmpdir(), "clipforge-ytdlp-"));
  const outputPath = path.join(workDir, "source.mp4");

  try {
    console.warn(`[ClipForge] RapidAPI unavailable; falling back to yt-dlp for ${youtubeUrl}`);

    await execFileAsync(YTDLP_PATH, [
      "--no-playlist",
      "--no-part",
      "--no-mtime",
      "--merge-output-format", "mp4",
      "-f", "bv*+ba/b",
      "-o", outputPath,
      youtubeUrl,
    ], { maxBuffer: 10 * 1024 * 1024 });

    const bytes = await readFile(outputPath);
    if (bytes.length === 0) throw new Error("yt-dlp produced an empty video file.");

    console.log(`[ClipForge] yt-dlp fallback succeeded (${bytes.length} bytes).`);
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
    throw new Error(`RapidAPI failed and yt-dlp fallback failed: ${detail}`);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  if (!isRapidApiDownloadRequest(input)) return originalFetch(input, init);

  const response = await originalFetch(input, init);
  if (!(await responseLooksLikeFailure(response))) return response;

  const youtubeUrl = extractYoutubeUrl(input);
  if (!youtubeUrl) return response;

  return downloadWithYtDlp(youtubeUrl);
};

console.log("[ClipForge] YouTube downloader fallback enabled (RapidAPI -> yt-dlp).");
