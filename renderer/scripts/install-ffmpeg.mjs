// Downloads a current static ffmpeg/ffprobe build (Linux amd64) into
// renderer/bin/ during `npm install`, replacing the ~2018-era binary
// bundled by @ffmpeg-installer/ffmpeg.
//
// Why this exists: that 2018 build parses filter graphs fine for small
// jobs, but silently dies mid-encode (no ffmpeg-emitted error, just stops)
// on the large chained-drawtext filter graphs this worker builds for
// word-by-word captions (100+ chained filters on a single clip). Verified
// against a real ffmpeg build (6.1.1) that the *same* filter graph shape
// renders cleanly — the crash is specific to the old binary, not the
// filter graph design.
//
// This is best-effort, same as install-yt-dlp.mjs: if the download or
// extraction fails (offline build environment, tar/xz missing, upstream
// unreachable), we warn and leave the old @ffmpeg-installer/ffmpeg binary
// as the fallback (ffmpegWorker.ts already prefers renderer/bin/ffmpeg
// when present) rather than failing the whole build.

import { execFile } from "node:child_process";
import { mkdir, writeFile, chmod, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const binDir = path.join(__dirname, "..", "bin");

const RELEASE_URL =
  "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz";

async function main() {
  const tmpDir = await mkdtempTemp();

  try {
    await mkdir(binDir, { recursive: true });

    console.log(`[install-ffmpeg] Downloading ffmpeg from ${RELEASE_URL}...`);

    const response = await fetch(RELEASE_URL, { redirect: "follow" });

    if (!response.ok) {
      console.warn(
        `[install-ffmpeg] Download failed (${response.status}). ` +
          "Falling back to the bundled @ffmpeg-installer/ffmpeg binary " +
          "(older build; may fail on very large caption filter graphs).",
      );
      return;
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    const archivePath = path.join(tmpDir, "ffmpeg.tar.xz");
    await writeFile(archivePath, bytes);

    console.log(
      `[install-ffmpeg] Downloaded ${Math.round(
        bytes.length / 1024 / 1024,
      )}MB, extracting...`,
    );

    // Requires system `tar` with xz support (near-universal on Debian-based
    // images, which is what Railway's Railpack Node builder uses). If it's
    // missing, this throws and we fall back below.
    await run("tar", ["-xJf", archivePath, "-C", tmpDir]);

    const { stdout } = await run("sh", [
      "-c",
      `find "${tmpDir}" -maxdepth 1 -type d -name 'ffmpeg-*-static'`,
    ]);

    const extractedDir = stdout.trim().split("\n")[0];

    if (!extractedDir) {
      throw new Error(
        "Could not locate extracted ffmpeg-*-static directory.",
      );
    }

    const { copyFile } = await import("node:fs/promises");

    await copyFile(
      path.join(extractedDir, "ffmpeg"),
      path.join(binDir, "ffmpeg"),
    );

    await copyFile(
      path.join(extractedDir, "ffprobe"),
      path.join(binDir, "ffprobe"),
    );

    await chmod(path.join(binDir, "ffmpeg"), 0o755);
    await chmod(path.join(binDir, "ffprobe"), 0o755);

    console.log(
      `[install-ffmpeg] Installed ffmpeg + ffprobe at ${binDir}`,
    );
  } catch (error) {
    console.warn(
      "[install-ffmpeg] Unexpected error, falling back to the bundled " +
        "@ffmpeg-installer/ffmpeg binary (older build; may fail on very " +
        "large caption filter graphs):",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function mkdtempTemp() {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(path.join(os.tmpdir(), "install-ffmpeg-"));
}

await main();
