// Downloads the standalone yt-dlp Linux binary (self-contained, no Python
// needed on the host) into renderer/bin/yt-dlp during `npm install`.
//
// This is best-effort: if the download fails (offline build environment,
// GitHub unreachable, etc.) we log a warning and exit 0 rather than fail
// the whole build, since RapidAPI can still serve as a fallback downloader
// if RAPIDAPI_KEY is configured.

import { mkdir, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const binDir = path.join(__dirname, "..", "bin");
const outPath = path.join(binDir, "yt-dlp");

const RELEASE_URL =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";

async function main() {
  try {
    await mkdir(binDir, { recursive: true });

    console.log(`[install-yt-dlp] Downloading yt-dlp from ${RELEASE_URL}...`);

    const response = await fetch(RELEASE_URL, { redirect: "follow" });

    if (!response.ok) {
      console.warn(
        `[install-yt-dlp] Download failed (${response.status}). ` +
          "yt-dlp will not be available; the pipeline will rely on " +
          "RapidAPI (if configured) instead.",
      );
      return;
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(outPath, bytes);
    await chmod(outPath, 0o755);

    console.log(
      `[install-yt-dlp] Installed yt-dlp (${Math.round(
        bytes.length / 1024 / 1024,
      )}MB) at ${outPath}`,
    );
  } catch (error) {
    console.warn(
      "[install-yt-dlp] Unexpected error, continuing without yt-dlp:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

await main();
