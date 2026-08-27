import 'dotenv/config';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const bundledFfmpeg = require('ffmpeg-static') as string | null;
const bundledFfprobe = require('ffprobe-static') as { path?: string };

function prependBin(binaryPath: string | null | undefined): void {
  if (!binaryPath) return;
  const dir = path.dirname(binaryPath);
  const current = process.env.PATH || '';
  if (!current.split(path.delimiter).includes(dir)) {
    process.env.PATH = `${dir}${path.delimiter}${current}`;
  }
}

prependBin(bundledFfmpeg);
prependBin(bundledFfprobe?.path);

process.env.FFMPEG_PATH ||= bundledFfmpeg || '';
process.env.FFPROBE_PATH ||= bundledFfprobe?.path || '';

console.log(`[ClipForge] Pipeline FFmpeg: ${process.env.FFMPEG_PATH || 'system PATH'}`);
console.log(`[ClipForge] Pipeline ffprobe: ${process.env.FFPROBE_PATH || 'system PATH'}`);

await import('./pipeline.ts');
