// ClipForge AI — Processing Pipeline Worker
//
// Pipeline:
// 1. Claim QUEUED project
// 2. Download source video
// 3. Probe source
// 4. Analyze video with Claude
// 5. Create clip records
// 6. Prepare clip source + Whisper captions + B-roll + music
// 7. Create clip_versions as QUEUED
// 8. Create render_jobs as QUEUED
// 9. Wait for Remotion worker
// 10. Aggregate ONLY this run's render jobs
// 11. Complete project only when ALL render jobs are completed
//
// Run:
//   npm run pipeline

import { execFile } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { createClient } from "@supabase/supabase-js";

import type {
  BrollConfigItem,
  CaptionWordConfig,
  ClipConfiguration,
  MusicConfig,
} from "./src/types";
import { transcribeAudioFile } from "./googleStt";

const execFileAsync = promisify(execFile);

// ============================================================================
// ENVIRONMENT
// ============================================================================

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv(
  "SUPABASE_SERVICE_ROLE_KEY",
);
const OPENROUTER_API_KEY = requireEnv("OPENROUTER_API_KEY");
const GOOGLE_STT_API_KEY = requireEnv("GOOGLE_STT_API_KEY");
const RAPIDAPI_KEY = requireEnv("RAPIDAPI_KEY");
const PEXELS_API_KEY = requireEnv("PEXELS_API_KEY");
const JAMENDO_CLIENT_ID = requireEnv("JAMENDO_CLIENT_ID");

const RAPIDAPI_HOST =
  process.env.RAPIDAPI_HOST ||
  "youtube-media-downloader.p.rapidapi.com";

// Vision-capable model reached through OpenRouter's unified API. Overridable
// since OpenRouter model slugs change more often than most env config.
const OPENROUTER_VISION_MODEL =
  process.env.OPENROUTER_VISION_MODEL ||
  "google/gemini-2.5-flash";

// ============================================================================
// API HEADERS
// ============================================================================

const openRouterHeaders: Record<string, string> = {
  Authorization: `Bearer ${OPENROUTER_API_KEY}`,
  "Content-Type": "application/json",
  "HTTP-Referer": "https://clipforge.app",
  "X-Title": "ClipForge AI",
};

const rapidApiHeaders: Record<string, string> = {
  "x-rapidapi-key": RAPIDAPI_KEY,
  "x-rapidapi-host": RAPIDAPI_HOST,
};

const pexelsHeaders: Record<string, string> = {
  Authorization: PEXELS_API_KEY,
};

// ============================================================================
// SUPABASE
// ============================================================================

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
    },
  },
);

// ============================================================================
// CONSTANTS
// ============================================================================

const POLL_INTERVAL_MS = 5000;
const RENDER_POLL_INTERVAL_MS = 1500;

const PREPARATION_START = 40;
const PREPARATION_END = 60;

const RENDER_PHASE_START = 60;
const RENDER_PHASE_END = 100;

// ============================================================================
// TYPES
// ============================================================================

interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  source_type: "youtube" | "upload";
  source_url: string | null;
  status: string;
  pattern_set_id: string | null;

  clip_duration_preset:
    | "15-30"
    | "30-60"
    | "60-90"
    | "ai";

  max_clips: number;
  auto_broll: boolean;
  auto_music: boolean;
  caption_preset: string;
  ai_optimization: boolean;
}

interface VideoRow {
  id: string;
  project_id: string;
  storage_path: string | null;
  youtube_video_id: string | null;
}

interface Candidate {
  start: number;
  end: number;
  title: string;
  hook: string;
  topic: string;
  category: string;

  // Horizontal focal point for the 9:16 crop, 0 (left) - 1 (right), 0.5 = center.
  cropX: number;

  // Pattern matching removed - AI picks moments solely on its own judgment.
  // Fields kept only because the `clips` table still has these columns.
  patternId: string | null;
  patternName: string | null;
  patternScore: number;

  hookScore: number;
  engagementScore: number;
  emotionalScore: number;
  shareabilityScore: number;
  completenessScore: number;
  score: number;
}

interface RenderJobRow {
  id: string;
  clip_id: string;
  clip_version_id: string;
  status: string;
  progress: number;
  stage: string | null;
  error_message: string | null;
}

// ============================================================================
// UTILITY
// ============================================================================

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(100, Math.round(value)),
  );
}

function extractYoutubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/,
  );

  return match ? match[1] : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ============================================================================
// PROJECT STATUS
// ============================================================================

async function setStatus(
  projectId: string,
  status: string,
  progress: number,
  errorMessage: string | null = null,
): Promise<void> {
  const safeProgress = clampProgress(progress);

  console.log(
    `[${projectId}] ${status} (${safeProgress}%)`,
  );

  const { error } = await supabase
    .from("projects")
    .update({
      status,
      progress: safeProgress,
      error_message: errorMessage,
    })
    .eq("id", projectId);

  if (error) {
    console.error(
      `Failed to update project ${projectId}:`,
      error.message,
    );
  }
}

// ============================================================================
// RENDER JOBS
// ============================================================================

async function getRenderJobs(
  jobIds: string[],
): Promise<RenderJobRow[]> {
  if (jobIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("render_jobs")
    .select(
      `
        id,
        clip_id,
        clip_version_id,
        status,
        progress,
        stage,
        error_message
      `,
    )
    .in("id", jobIds);

  if (error) {
    throw new Error(
      `Failed to load render jobs: ${error.message}`,
    );
  }

  return (data ?? []) as RenderJobRow[];
}

function calculateRenderProgress(
  jobs: RenderJobRow[],
): number {
  if (jobs.length === 0) {
    return 0;
  }

  const total = jobs.reduce(
    (sum, job) => {
      if (job.status === "COMPLETED") {
        return sum + 100;
      }

      if (job.status === "FAILED") {
        return sum;
      }

      return sum + Number(job.progress || 0);
    },
    0,
  );

  return total / jobs.length;
}

function mapRenderProgressToProjectProgress(
  renderProgress: number,
): number {
  const normalized = clampProgress(renderProgress);

  const projectProgress =
    RENDER_PHASE_START +
    (normalized / 100) *
      (RENDER_PHASE_END - RENDER_PHASE_START);

  return clampProgress(projectProgress);
}

async function syncProjectRenderProgress(
  projectId: string,
  jobIds: string[],
): Promise<{
  jobs: RenderJobRow[];
  renderProgress: number;
  projectProgress: number;
  allCompleted: boolean;
  anyFailed: boolean;
}> {
  const jobs = await getRenderJobs(jobIds);

  if (jobs.length !== jobIds.length) {
    console.warn(
      `Expected ${jobIds.length} render jobs but found ${jobs.length}.`,
    );
  }

  if (jobs.length === 0) {
    return {
      jobs: [],
      renderProgress: 0,
      projectProgress: RENDER_PHASE_START,
      allCompleted: false,
      anyFailed: false,
    };
  }

  const renderProgress =
    calculateRenderProgress(jobs);

  const allCompleted =
    jobs.length === jobIds.length &&
    jobIds.length > 0 &&
    jobs.every(
      (job) => job.status === "COMPLETED",
    );

  const anyFailed = jobs.some(
    (job) => job.status === "FAILED",
  );

  const projectProgress = allCompleted
    ? 100
    : mapRenderProgressToProjectProgress(
        renderProgress,
      );

  console.log(
    `Render progress: ${renderProgress.toFixed(
      1,
    )}% -> project ${projectProgress}%`,
  );

  console.log(
    `Jobs: ${jobs
      .map(
        (job) =>
          `${job.id}:${job.status}:${job.progress}%`,
      )
      .join(", ")}`,
  );

  if (anyFailed) {
    const failedJob = jobs.find(
      (job) => job.status === "FAILED",
    );

    await setStatus(
      projectId,
      "FAILED",
      projectProgress,
      failedJob?.error_message ||
        "One or more Remotion render jobs failed.",
    );
  } else if (allCompleted) {
    await setStatus(
      projectId,
      "COMPLETED",
      100,
      null,
    );
  } else {
    await setStatus(
      projectId,
      "RENDERING",
      projectProgress,
      null,
    );
  }

  return {
    jobs,
    renderProgress,
    projectProgress,
    allCompleted,
    anyFailed,
  };
}

// ============================================================================
// YOUTUBE DOWNLOAD
// ============================================================================

async function downloadViaRapidApi(
  youtubeUrl: string,
  outPath: string,
): Promise<boolean> {
  console.log(
    `Attempting YouTube download via RapidAPI (${RAPIDAPI_HOST})...`,
  );

  try {
    const endpoint =
      `https://${RAPIDAPI_HOST}/v2/video/download` +
      `?url=${encodeURIComponent(youtubeUrl)}`;

    const response = await fetch(endpoint, {
      method: "GET",
      headers: rapidApiHeaders,
    });

    if (!response.ok) {
      console.warn(
        `RapidAPI returned ${response.status}`,
      );

      return false;
    }

    const contentType =
      response.headers.get("content-type") || "";

    let downloadUrl: string | null = null;

    if (contentType.includes("application/json")) {
      const data = (await response.json()) as any;

      downloadUrl =
        typeof data.downloadUrl === "string"
          ? data.downloadUrl
          : typeof data.download_url === "string"
            ? data.download_url
            : typeof data.link === "string"
              ? data.link
              : typeof data.url === "string"
                ? data.url
                : null;

      if (!downloadUrl && data.data) {
        downloadUrl =
          typeof data.data.downloadUrl === "string"
            ? data.data.downloadUrl
            : typeof data.data.download_url === "string"
              ? data.data.download_url
              : typeof data.data.url === "string"
                ? data.data.url
                : null;
      }

      // Some downloader APIs return nested formats.
      if (!downloadUrl && Array.isArray(data.data)) {
        const first = data.data[0];

        if (first) {
          downloadUrl =
            typeof first.downloadUrl === "string"
              ? first.downloadUrl
              : typeof first.download_url === "string"
                ? first.download_url
                : typeof first.url === "string"
                  ? first.url
                  : null;
        }
      }

      if (!downloadUrl && Array.isArray(data.formats)) {
        const format =
          data.formats.find(
            (item: any) =>
              typeof item.url === "string" &&
              (
                String(item.mimeType || "").includes(
                  "video",
                ) ||
                String(item.mime_type || "").includes(
                  "video",
                )
              ),
          ) ?? data.formats[0];

        if (format?.url) {
          downloadUrl = String(format.url);
        }
      }
    } else {
      const arrayBuffer =
        await response.arrayBuffer();

      writeFileSync(
        outPath,
        Buffer.from(arrayBuffer),
      );

      return statSync(outPath).size > 0;
    }

    if (!downloadUrl) {
      console.warn(
        "RapidAPI did not provide a usable download URL.",
      );

      return false;
    }

    console.log("Downloading media...");

    const mediaResponse =
      await fetch(downloadUrl);

    if (!mediaResponse.ok) {
      throw new Error(
        `Media download failed: ${mediaResponse.status}`,
      );
    }

    const arrayBuffer =
      await mediaResponse.arrayBuffer();

    writeFileSync(
      outPath,
      Buffer.from(arrayBuffer),
    );

    const stats = statSync(outPath);

    if (stats.size <= 0) {
      return false;
    }

    console.log(
      `Downloaded ${Math.round(
        stats.size / 1024 / 1024,
      )} MB`,
    );

    return true;
  } catch (error) {
    console.warn(
      "RapidAPI download failed:",
      error instanceof Error
        ? error.message
        : String(error),
    );

    return false;
  }
}

// ============================================================================
// SOURCE DOWNLOAD
// ============================================================================

async function downloadSource(
  project: ProjectRow,
  workDir: string,
): Promise<string> {
  const outPath = path.join(
    workDir,
    "source.mp4",
  );

  await setStatus(
    project.id,
    "DOWNLOADING",
    5,
  );

  if (project.source_type === "youtube") {
    if (!project.source_url) {
      throw new Error(
        "Project has no YouTube URL.",
      );
    }

    const videoId =
      extractYoutubeId(project.source_url);

    if (!videoId) {
      throw new Error(
        "Could not extract YouTube video ID.",
      );
    }

    console.log(
      `YouTube video ID: ${videoId}`,
    );

    const success =
      await downloadViaRapidApi(
        project.source_url,
        outPath,
      );

    if (!success) {
      throw new Error(
        "RapidAPI YouTube download failed.",
      );
    }

    const storagePath =
      `projects/${project.id}/source/source.mp4`;

    const {
      error: uploadError,
    } = await supabase.storage
      .from("sources")
      .upload(
        storagePath,
        readFileSync(outPath),
        {
          contentType: "video/mp4",
          upsert: true,
        },
      );

    if (uploadError) {
      console.warn(
        `Source upload failed: ${uploadError.message}`,
      );
    } else {
      const {
        error: videoUpdateError,
      } = await supabase
        .from("videos")
        .update({
          storage_path: storagePath,
          file_size:
            statSync(outPath).size,
        })
        .eq(
          "project_id",
          project.id,
        );

      if (videoUpdateError) {
        console.warn(
          `Video record update failed: ${videoUpdateError.message}`,
        );
      }
    }

    return outPath;
  }

  const {
    data: video,
    error: videoError,
  } = await supabase
    .from("videos")
    .select(
      "id, project_id, storage_path, youtube_video_id",
    )
    .eq(
      "project_id",
      project.id,
    )
    .maybeSingle();

  if (videoError) {
    throw new Error(
      `Failed to load uploaded video: ${videoError.message}`,
    );
  }

  const videoRow =
    video as VideoRow | null;

  if (!videoRow?.storage_path) {
    throw new Error(
      "Uploaded source not found in storage.",
    );
  }

  const {
    data: signed,
    error: signError,
  } =
    await supabase.storage
      .from("sources")
      .createSignedUrl(
        videoRow.storage_path,
        3600,
      );

  if (signError || !signed) {
    throw new Error(
      `Cannot sign source URL: ${
        signError?.message ||
        "unknown error"
      }`,
    );
  }

  const response =
    await fetch(signed.signedUrl);

  if (!response.ok) {
    throw new Error(
      `Source download failed: ${response.status}`,
    );
  }

  const bytes =
    Buffer.from(
      await response.arrayBuffer(),
    );

  writeFileSync(
    outPath,
    bytes,
  );

  return outPath;
}

// ============================================================================
// VIDEO PROBE
// ============================================================================

async function probeVideo(
  filePath: string,
): Promise<{
  duration: number;
  width: number;
  height: number;
}> {
  const { stdout } =
    await execFileAsync(
      "ffprobe",
      [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        filePath,
      ],
    );

  const info = JSON.parse(stdout) as {
    format?: {
      duration?: string;
    };
    streams?: Array<{
      codec_type: string;
      width?: number;
      height?: number;
    }>;
  };

  const videoStream =
    info.streams?.find(
      (stream) =>
        stream.codec_type === "video",
    );

  const duration = Number(
    info.format?.duration || 0,
  );

  if (
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    throw new Error(
      "Could not determine source video duration.",
    );
  }

  return {
    duration,
    width: videoStream?.width ?? 0,
    height: videoStream?.height ?? 0,
  };
}


// ============================================================================
// MULTIMODAL MOMENT DETECTION (frames + audio energy, no transcript)
// ============================================================================
//
// Picks clip-worthy moments AND a 9:16 crop focal point by actually looking
// at sampled frames and a rough loudness curve from the source video - not
// by asking an LLM to guess from the title (that was the old behavior).
// No pattern list, no user-supplied categories - AI decides on its own.

const MOMENT_FRAME_COUNT = 10;
const ENERGY_WINDOW_COUNT = 24;

interface EnergyWindow {
  startSec: number;
  meanDb: number;
}

async function extractSampleFrames(
  sourcePath: string,
  duration: number,
  workDir: string,
): Promise<{ timeSec: number; base64: string }[]> {
  const frames: { timeSec: number; base64: string }[] = [];

  for (let i = 0; i < MOMENT_FRAME_COUNT; i++) {
    // Skip the very first/last instants - often black frames or logos.
    const fraction = (i + 0.5) / MOMENT_FRAME_COUNT;
    const timeSec = Math.min(
      Math.max(0, duration * fraction),
      Math.max(0, duration - 0.2),
    );

    const framePath = path.join(
      workDir,
      `moment_frame_${i}.jpg`,
    );

    try {
      await execFileAsync("ffmpeg", [
        "-y",
        "-ss",
        String(timeSec),
        "-i",
        sourcePath,
        "-frames:v",
        "1",
        "-q:v",
        "4",
        "-vf",
        "scale=480:-2",
        framePath,
      ]);

      const base64 = readFileSync(framePath).toString(
        "base64",
      );

      frames.push({ timeSec, base64 });
    } catch (error) {
      console.warn(
        `Frame extraction failed at ${timeSec}s:`,
        error instanceof Error
          ? error.message
          : String(error),
      );
    }
  }

  return frames;
}

async function extractEnergyCurve(
  sourcePath: string,
  duration: number,
): Promise<EnergyWindow[]> {
  const windowCount = Math.min(
    ENERGY_WINDOW_COUNT,
    Math.max(1, Math.floor(duration / 3)),
  );

  const windowLength = duration / windowCount;
  const windows: EnergyWindow[] = [];

  for (let i = 0; i < windowCount; i++) {
    const startSec = i * windowLength;

    try {
      const { stderr } = await execFileAsync("ffmpeg", [
        "-y",
        "-ss",
        String(startSec),
        "-t",
        String(windowLength),
        "-i",
        sourcePath,
        "-af",
        "volumedetect",
        "-vn",
        "-f",
        "null",
        "-",
      ]);

      const match = stderr.match(
        /mean_volume:\s*(-?\d+(\.\d+)?)\s*dB/,
      );

      const meanDb = match
        ? parseFloat(match[1])
        : -100;

      windows.push({ startSec, meanDb });
    } catch (error) {
      // A window failing (e.g. silence-only) shouldn't abort the whole scan.
      windows.push({ startSec, meanDb: -100 });
    }
  }

  return windows;
}

async function findMomentsWithMultimodalAI(
  project: ProjectRow,
  title: string,
  duration: number,
  sourceVideoPath: string,
  workDir: string,
): Promise<Candidate[]> {
  const targetCount = Math.min(
    Math.max(project.max_clips || 6, 1),
    8,
  );

  const durationTarget =
    project.clip_duration_preset === "15-30"
      ? "20-30"
      : project.clip_duration_preset === "60-90"
        ? "60-90"
        : project.clip_duration_preset === "ai"
          ? "30-60"
          : "30-55";

  try {
    const [frames, energyWindows] = await Promise.all([
      extractSampleFrames(
        sourceVideoPath,
        duration,
        workDir,
      ),
      extractEnergyCurve(sourceVideoPath, duration),
    ]);

    if (frames.length === 0) {
      throw new Error(
        "No frames could be extracted from the source video.",
      );
    }

    const energyText = energyWindows
      .map(
        (w) =>
          `t=${w.startSec.toFixed(1)}s: ${w.meanDb.toFixed(1)} dB`,
      )
      .join("\n");

    const promptText = `You are ClipForge AI, an expert short-form video editor for TikTok, YouTube Shorts, and Instagram Reels.

You are given ${frames.length} frames sampled evenly across a ${Math.round(duration)}-second source video (timestamps below the corresponding image), plus a rough audio loudness curve (dB per time window - louder/more energetic moments often mean more engaging delivery, but use your own visual judgment too, not just volume).

Frame timestamps (seconds): ${frames.map((f) => f.timeSec.toFixed(1)).join(", ")}

Audio loudness curve:
${energyText}

Judge purely on what you see and the loudness pattern - you do NOT have a transcript, so do not invent spoken words or quotes.

Task: pick the best ${targetCount} moments (as time ranges) for vertical 9:16 clips, each ${durationTarget} seconds long, and for each pick a horizontal crop focal point for reframing widescreen footage to 9:16.

Return ONLY valid JSON, no commentary:
{
  "clips": [
    {
      "start": 12.0,
      "end": 45.0,
      "title": "Punchy short title",
      "hook": "What likely grabs attention in the first 3s, based on what's visible",
      "topic": "Main subject, inferred visually",
      "category": "Insight | Story | How-To | Reaction | Highlight",
      "cropX": 0.5,
      "hookScore": 90,
      "engagementScore": 90,
      "emotionalScore": 85,
      "shareabilityScore": 90,
      "completenessScore": 92
    }
  ]
}

Rules:
- start >= 0, end <= ${Math.round(duration)}, end > start.
- cropX is 0 (subject at left edge) to 1 (subject at right edge), 0.5 = centered. Base it on where the main subject/action sits in the frames within that time range.
- Spread picks across the video where possible, don't cluster them all in one place.
- Scores are 0-100 integers, your honest estimate.`;

    const imageContent = frames.map((frame) => ({
      type: "image_url",
      image_url: {
        url: `data:image/jpeg;base64,${frame.base64}`,
      },
    }));

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: openRouterHeaders,
        body: JSON.stringify({
          model: OPENROUTER_VISION_MODEL,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: promptText },
                ...imageContent,
              ],
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.warn(
        `OpenRouter returned ${response.status}: ${errorText}`,
      );

      return createFallbackCandidates(
        title,
        duration,
        targetCount,
      );
    }

    const json = (await response.json()) as any;

    const text =
      json.choices?.[0]?.message?.content || "";

    if (!text) {
      console.warn(
        "OpenRouter returned empty content.",
      );

      return createFallbackCandidates(
        title,
        duration,
        targetCount,
      );
    }

    const cleanedText = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(cleanedText);

    if (
      !Array.isArray(parsed.clips) ||
      parsed.clips.length === 0
    ) {
      return createFallbackCandidates(
        title,
        duration,
        targetCount,
      );
    }

    const candidates: Candidate[] = parsed.clips
      .filter((clip: any) => {
        const start = Number(clip.start);
        const end = Number(clip.end);

        return (
          Number.isFinite(start) &&
          Number.isFinite(end) &&
          end > start &&
          start >= 0 &&
          end <= duration
        );
      })
      .slice(0, targetCount)
      .map((clip: any) => {
        const start = Math.max(0, Number(clip.start));
        const end = Math.min(duration, Number(clip.end));

        const cropX = Math.min(
          1,
          Math.max(
            0,
            Number.isFinite(Number(clip.cropX))
              ? Number(clip.cropX)
              : 0.5,
          ),
        );

        const hookScore =
          Number(clip.hookScore) || 90;
        const engagementScore =
          Number(clip.engagementScore) || 90;
        const emotionalScore =
          Number(clip.emotionalScore) || 85;
        const shareabilityScore =
          Number(clip.shareabilityScore) || 90;
        const completenessScore =
          Number(clip.completenessScore) || 95;

        const score =
          hookScore * 0.35 +
          engagementScore * 0.35 +
          shareabilityScore * 0.3;

        return {
          start,
          end,
          title: String(
            clip.title ||
              `Viral Moment ${title.slice(0, 30)}`,
          ),
          hook: String(
            clip.hook || "Watch until the end.",
          ),
          topic: String(clip.topic || title),
          category: String(
            clip.category || "Insight",
          ),

          cropX,

          patternId: null,
          patternName: null,
          patternScore: 0,

          hookScore,
          engagementScore,
          emotionalScore,
          shareabilityScore,
          completenessScore,
          score,
        };
      });

    if (candidates.length > 0) {
      return candidates;
    }
  } catch (error) {
    console.warn(
      "Multimodal candidate generation failed:",
      error instanceof Error
        ? error.message
        : String(error),
    );
  }

  return createFallbackCandidates(
    title,
    duration,
    targetCount,
  );
}

// ============================================================================
// FALLBACK CANDIDATES
// ============================================================================

function createFallbackCandidates(
  title: string,
  duration: number,
  targetCount: number,
): Candidate[] {
  const fallback: Candidate[] = [];

  const clipLength =
    Math.min(
      30,
      Math.max(3, duration),
    );

  const step =
    Math.max(
      clipLength + 5,
      Math.floor(
        duration /
          Math.max(
            targetCount,
            1,
          ),
      ),
    );

  for (
    let index = 0;
    index < targetCount;
    index++
  ) {
    const start = Math.min(
      Math.max(
        0,
        duration - clipLength,
      ),
      index * step,
    );

    const end = Math.min(
      duration,
      start + clipLength,
    );

    if (end <= start) {
      continue;
    }

    fallback.push({
      start,
      end,

      title:
        `Key Highlight Part ${
          index + 1
        }`,

      hook:
        `Part ${
          index + 1
        }: The most important moment.`,

      topic: title,
      category: "Highlight",

      cropX: 0.5,

      patternId: null,
      patternName: null,

      patternScore: 80,
      hookScore: 92,
      engagementScore: 90,
      emotionalScore: 88,
      shareabilityScore: 91,
      completenessScore: 95,

      score: 91,
    });
  }

  return fallback;
}

// ============================================================================
// FFmpeg — INTERMEDIATE CLIP SOURCE
// ============================================================================

async function sliceClipVideo(
  sourcePath: string,
  start: number,
  end: number,
  outPath: string,
  cropX: number = 0.5,
): Promise<string> {
  const duration =
    Math.max(
      3,
      end - start,
    );

  // cropX (0-1) is the AI's pick for where the subject sits horizontally.
  // Clamped in the filter expression too, in case cropX is ever out of range.
  const safeCropX = Math.min(1, Math.max(0, cropX));

  const cropFilter =
    `scale=1080:1920:force_original_aspect_ratio=increase,` +
    `crop=1080:1920:x='min(max(0,(iw-1080)*${safeCropX}),iw-1080)':y='min(max(0,(ih-1920)*0.5),ih-1920)'`;

  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-ss",
      String(start),
      "-t",
      String(duration),
      "-i",
      sourcePath,

      "-vf",
      cropFilter,

      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",

      "-c:a",
      "aac",
      "-b:a",
      "192k",

      outPath,
    ],
  );

  return outPath;
}


// ============================================================================
// AUDIO EXTRACTION
// ============================================================================

async function extractClipAudio(
  clipVideoPath: string,
  outAudioPath: string,
): Promise<string> {
  // LINEAR16/WAV - the most broadly-supported sync encoding for Google STT,
  // avoids container/codec edge cases that MP3 or AAC can hit.
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-i",
      clipVideoPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      outAudioPath,
    ],
  );

  return outAudioPath;
}

// ============================================================================
// GOOGLE SPEECH-TO-TEXT (runs on the clipped audio only, not the source)
// ============================================================================
//
// Shared with ffmpegWorker.ts (renderer/googleStt.ts) so the automated
// worker path and the finished-render fallback path can't drift apart.

async function transcribeClippedAudio(
  clipAudioPath: string,
  clipDurationSec: number,
): Promise<{
  words: CaptionWordConfig[];
  text: string;
}> {
  const { words, text } = await transcribeAudioFile(
    clipAudioPath,
    clipDurationSec,
    GOOGLE_STT_API_KEY,
  );

  return {
    words: words.map((w) => ({
      text: w.text,
      start: w.start,
      end: w.end,
    })),
    text,
  };
}


// ============================================================================
// B-ROLL — PEXELS
// ============================================================================

async function findBroll(
  query: string,
): Promise<BrollConfigItem | null> {
  try {
    const endpoint =
      "https://api.pexels.com/videos/search" +
      `?query=${encodeURIComponent(query)}` +
      "&orientation=portrait" +
      "&per_page=1";

    const response =
      await fetch(
        endpoint,
        {
          method: "GET",
          headers: pexelsHeaders,
        },
      );

    if (!response.ok) {
      console.warn(
        `Pexels returned ${response.status}`,
      );

      return null;
    }

    const data =
      (await response.json()) as any;

    const video =
      data.videos?.[0];

    const file =
      video?.video_files?.find(
        (item: any) =>
          item.quality === "hd",
      ) ??
      video?.video_files?.[0];

    if (!file?.link) {
      return null;
    }

    return {
      videoUrl: file.link,
      startAt: 0,
      duration: 3,
      provider: "pexels",
      query,
    };
  } catch (error) {
    console.warn(
      "Pexels B-roll search failed:",
      error instanceof Error
        ? error.message
        : String(error),
    );

    return null;
  }
}

// ============================================================================
// MUSIC — JAMENDO
// ============================================================================

async function findMusic(
  topic: string,
): Promise<MusicConfig | null> {
  try {
    const params =
      new URLSearchParams();

    params.set(
      "client_id",
      JAMENDO_CLIENT_ID,
    );

    params.set(
      "format",
      "json",
    );

    params.set(
      "limit",
      "1",
    );

    params.set(
      "audioformat",
      "mp32",
    );

    params.set(
      "tags",
      "instrumental",
    );

    params.set(
      "search",
      topic,
    );

    const endpoint =
      `https://api.jamendo.com/v3.0/tracks/?${params.toString()}`;

    const response =
      await fetch(endpoint);

    if (!response.ok) {
      console.warn(
        `Jamendo returned ${response.status}`,
      );

      return null;
    }

    const data =
      (await response.json()) as any;

    const track =
      data.results?.[0];

    if (!track?.audio) {
      console.warn(
        "Jamendo returned no audio track.",
      );

      return null;
    }

    return {
      audioUrl: track.audio,
      volume: 0.12,
      fadeIn: 1,
      fadeOut: 1.5,
      trimStart: 0,
      title: track.name,
    };
  } catch (error) {
    console.warn(
      "Jamendo music search failed:",
      error instanceof Error
        ? error.message
        : String(error),
    );

    return null;
  }
}

// ============================================================================
// CREATE RENDER JOB
// ============================================================================

async function createRenderJob(
  clipId: string,
  clipVersionId: string,
): Promise<string> {
  const {
    data,
    error,
  } = await supabase
    .from("render_jobs")
    .insert({
      clip_id: clipId,
      clip_version_id: clipVersionId,
      status: "QUEUED",
      progress: 0,
      stage: "QUEUED",
      error_message: null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to create render job: ${
        error?.message ||
        "unknown error"
      }`,
    );
  }

  console.log(
    `Created render job ${data.id} for clip ${clipId}`,
  );

  return data.id;
}

// ============================================================================
// WAIT FOR REMOTION
// ============================================================================

async function waitForRemotionRenders(
  projectId: string,
  jobIds: string[],
): Promise<void> {
  console.log(
    `Waiting for ${jobIds.length} Remotion jobs for project ${projectId}...`,
  );

  await setStatus(
    projectId,
    "RENDERING",
    RENDER_PHASE_START,
    null,
  );

  for (;;) {
    const result =
      await syncProjectRenderProgress(
        projectId,
        jobIds,
      );

    if (result.anyFailed) {
      throw new Error(
        "One or more Remotion render jobs failed.",
      );
    }

    if (result.allCompleted) {
      console.log(
        `All ${result.jobs.length} Remotion jobs completed.`,
      );

      return;
    }

    await sleep(
      RENDER_POLL_INTERVAL_MS,
    );
  }
}

// ============================================================================
// PROCESS PROJECT
// ============================================================================

async function processProject(
  project: ProjectRow,
): Promise<void> {
  const workDir =
    mkdtempSync(
      path.join(
        tmpdir(),
        "clipforge-pipeline-",
      ),
    );

  try {
    console.log(
      "\n========================================",
    );

    console.log(
      `Processing Project: ${project.name}`,
    );

    console.log(
      `Project ID: ${project.id}`,
    );

    console.log(
      "========================================",
    );

    // ----------------------------------------------------------------------
    // 1. DOWNLOAD SOURCE
    // ----------------------------------------------------------------------

    const sourceVideoPath =
      await downloadSource(
        project,
        workDir,
      );

    const meta =
      await probeVideo(
        sourceVideoPath,
      );

    const {
      error: videoMetaError,
    } = await supabase
      .from("videos")
      .update({
        duration: meta.duration,
        width: meta.width,
        height: meta.height,
      })
      .eq(
        "project_id",
        project.id,
      );

    if (videoMetaError) {
      console.warn(
        `Failed to update video metadata: ${videoMetaError.message}`,
      );
    }

    console.log(
      `Source: ${meta.width}x${meta.height}, ${meta.duration.toFixed(
        2,
      )}s`,
    );

    // ----------------------------------------------------------------------
    // 2. AI ANALYSIS
    // ----------------------------------------------------------------------

    await setStatus(
      project.id,
      "ANALYZING",
      35,
      null,
    );

    // Pattern-set matching removed - the AI picks moments on its own from
    // sampled frames + audio energy, not from a user-curated category list.
    const candidates =
      await findMomentsWithMultimodalAI(
        project,
        project.name,
        meta.duration,
        sourceVideoPath,
        workDir,
      );

    console.log(
      `Found ${candidates.length} candidates.`,
    );

    if (candidates.length === 0) {
      throw new Error(
        "No clip candidates were generated.",
      );
    }

    // ----------------------------------------------------------------------
    // 3. PREPARE CLIPS
    // ----------------------------------------------------------------------

    await setStatus(
      project.id,
      "CLIPPING_AND_TRANSCRIBING",
      PREPARATION_START,
      null,
    );

    const totalCandidates =
      candidates.length;

    const createdRenderJobs: string[] =
      [];

    for (
      let index = 0;
      index < totalCandidates;
      index++
    ) {
      const candidate =
        candidates[index];

      const clipNumber =
        index + 1;

      console.log(
        `\nPreparing clip ${clipNumber}/${totalCandidates}: ${candidate.title}`,
      );

      // --------------------------------------------------------------------
      // A. CREATE CLIP
      // --------------------------------------------------------------------

      const {
        data: clip,
        error: clipError,
      } = await supabase
        .from("clips")
        .insert({
          project_id: project.id,

          title: candidate.title,
          hook: candidate.hook,
          topic: candidate.topic,
          category: candidate.category,

          start_time: candidate.start,
          end_time: candidate.end,

          duration:
            candidate.end -
            candidate.start,

          score: candidate.score,

          hook_score:
            candidate.hookScore,

          engagement_score:
            candidate.engagementScore,

          pattern_score:
            candidate.patternScore,

          emotional_score:
            candidate.emotionalScore,

          shareability_score:
            candidate.shareabilityScore,

          completeness_score:
            candidate.completenessScore,

          matched_pattern_id:
            candidate.patternId,

          matched_pattern_name:
            candidate.patternName,

          status: "RENDERING",
        })
        .select("id")
        .single();

      if (
        clipError ||
        !clip
      ) {
        throw new Error(
          `Clip insert failed: ${
            clipError?.message ||
            "unknown error"
          }`,
        );
      }

      // --------------------------------------------------------------------
      // B. CREATE INTERMEDIATE CLIP SOURCE
      // --------------------------------------------------------------------

      const clipVideoPath =
        path.join(
          workDir,
          `clip_${clip.id}.mp4`,
        );

      await sliceClipVideo(
        sourceVideoPath,
        candidate.start,
        candidate.end,
        clipVideoPath,
        candidate.cropX,
      );

      // --------------------------------------------------------------------
      // C. GOOGLE SPEECH-TO-TEXT (on the rendered clip only, not source)
      // --------------------------------------------------------------------

      const clipAudioPath =
        path.join(
          workDir,
          `clip_audio_${clip.id}.wav`,
        );

      await extractClipAudio(
        clipVideoPath,
        clipAudioPath,
      );

      const {
        words: sttWords,
      } =
        await transcribeClippedAudio(
          clipAudioPath,
          candidate.end - candidate.start,
        );

      // --------------------------------------------------------------------
      // D. UPLOAD INTERMEDIATE SOURCE
      // --------------------------------------------------------------------

      const sourceStoragePath =
        `projects/${project.id}/intermediate/${clip.id}-source.mp4`;

      const {
        error: sourceUploadError,
      } = await supabase.storage
        .from("sources")
        .upload(
          sourceStoragePath,
          readFileSync(
            clipVideoPath,
          ),
          {
            contentType:
              "video/mp4",
            upsert: true,
          },
        );

      if (sourceUploadError) {
        throw new Error(
          `Failed to upload clip source: ${sourceUploadError.message}`,
        );
      }

      // --------------------------------------------------------------------
      // E. B-ROLL / MUSIC
      // --------------------------------------------------------------------

      const broll =
        project.auto_broll
          ? await findBroll(
              candidate.topic,
            )
          : null;

      const music =
        project.auto_music
          ? await findMusic(
              candidate.topic,
            )
          : null;

      // --------------------------------------------------------------------
      // F. REMOTION CONFIGURATION
      // --------------------------------------------------------------------

      const clipConfig:
        ClipConfiguration = {
        sourceVideo:
          sourceStoragePath,

        startTime: 0,

        endTime:
          candidate.end -
          candidate.start,

        aspectRatio: "9:16",

        resolution: {
          width: 1080,
          height: 1920,
        },

        speed: 1,

        crop: {
          mode: "smart",
          x: 0.5,
          y: 0.5,
          scale: 1,
          subject: "speaker",
        },

        captions: {
          enabled: true,

          style: {
            preset:
              (project.caption_preset ||
                "bold") as any,

            font: "Inter",
            fontSize: 64,
            weight: 800,
            position: "bottom",
            animation: "pop",

            highlightColor:
              "#f97316",

            textColor:
              "#ffffff",

            background: null,

            strokeColor:
              "#000000",

            strokeWidth: 8,

            alignment: "center",
            lineSpacing: 1.2,
          },

          words: sttWords,
        },

        broll: broll
          ? [
              {
                ...broll,
                startAt: 1,
              },
            ]
          : [],

        music,

        overlays: [],

        branding: {
          logoUrl: null,
          watermarkText: null,
        },

        voiceVolume: 1,
      };

      // --------------------------------------------------------------------
      // G. CREATE CLIP VERSION
      // --------------------------------------------------------------------

      const {
        data: version,
        error: versionError,
      } = await supabase
        .from("clip_versions")
        .insert({
          clip_id: clip.id,
          version_number: 1,

          configuration_json:
            clipConfig,

          render_url: null,
          thumbnail_url: null,

          status: "QUEUED",
        })
        .select("id")
        .single();

      if (
        versionError ||
        !version
      ) {
        throw new Error(
          `Failed to create clip version: ${
            versionError?.message ||
            "unknown error"
          }`,
        );
      }

      // --------------------------------------------------------------------
      // H. CREATE REMOTION JOB
      // --------------------------------------------------------------------

      const renderJobId =
        await createRenderJob(
          clip.id,
          version.id,
        );

      createdRenderJobs.push(
        renderJobId,
      );

      // --------------------------------------------------------------------
      // I. CLIP WAITING FOR REMOTION
      // --------------------------------------------------------------------

      const {
        error: clipWaitingError,
      } = await supabase
        .from("clips")
        .update({
          status: "RENDERING",
        })
        .eq(
          "id",
          clip.id,
        );

      if (clipWaitingError) {
        throw new Error(
          `Failed to update clip render state: ${clipWaitingError.message}`,
        );
      }

      // --------------------------------------------------------------------
      // J. PREPARATION PROGRESS
      // --------------------------------------------------------------------

      const preparationProgress =
        PREPARATION_START +
        ((index + 1) /
          totalCandidates) *
          (PREPARATION_END -
            PREPARATION_START);

      await setStatus(
        project.id,
        "PREPARING_RENDERS",
        preparationProgress,
        null,
      );
    }

    // ----------------------------------------------------------------------
    // 4. VERIFY JOBS
    // ----------------------------------------------------------------------

    if (
      createdRenderJobs.length === 0
    ) {
      throw new Error(
        "No Remotion render jobs were created.",
      );
    }

    console.log(
      `\nCreated ${createdRenderJobs.length} Remotion render jobs.`,
    );

    // ----------------------------------------------------------------------
    // 5. HAND OFF TO REMOTION
    // ----------------------------------------------------------------------

    await setStatus(
      project.id,
      "RENDERING",
      RENDER_PHASE_START,
      null,
    );

    // ----------------------------------------------------------------------
    // 6. WAIT FOR ONLY THESE REMOTION JOBS
    // ----------------------------------------------------------------------

    await waitForRemotionRenders(
      project.id,
      createdRenderJobs,
    );

    // ----------------------------------------------------------------------
    // 7. FINAL RENDER JOB VERIFICATION
    // ----------------------------------------------------------------------

    const finalState =
      await syncProjectRenderProgress(
        project.id,
        createdRenderJobs,
      );

    if (finalState.anyFailed) {
      throw new Error(
        "At least one Remotion render job failed.",
      );
    }

    if (
      !finalState.allCompleted
    ) {
      throw new Error(
        "Project attempted to complete before all render jobs were completed.",
      );
    }

    // ----------------------------------------------------------------------
    // 8. VERIFY FINAL REMOTION OUTPUT
    // ----------------------------------------------------------------------

    const {
      data: finalClips,
      error: finalClipsError,
    } = await supabase
      .from("clips")
      .select(
        `
          id,
          status,
          current_render_url,
          current_thumbnail_url,
          current_version_id
        `,
      )
      .eq(
        "project_id",
        project.id,
      );

    if (finalClipsError) {
      throw new Error(
        `Failed to verify final clips: ${finalClipsError.message}`,
      );
    }

    if (
      !finalClips ||
      finalClips.length === 0
    ) {
      throw new Error(
        "Project has no final clips.",
      );
    }

    const invalidClips =
      finalClips.filter(
        (clip: any) =>
          clip.status !==
            "RENDERED" ||
          !clip.current_render_url ||
          !clip.current_version_id,
      );

    if (
      invalidClips.length > 0
    ) {
      throw new Error(
        `${invalidClips.length} clips are missing their final Remotion output.`,
      );
    }

    // ----------------------------------------------------------------------
    // 9. ONLY NOW COMPLETE PROJECT
    // ----------------------------------------------------------------------

    await setStatus(
      project.id,
      "COMPLETED",
      100,
      null,
    );

    console.log(
      `\nProject ${project.id} completed.`,
    );

    console.log(
      `${finalClips.length} final Remotion clips verified.`,
    );

    console.log(
      "Project progress = 100%.",
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      `\nProject ${project.id} failed:`,
      message,
    );

    await setStatus(
      project.id,
      "FAILED",
      0,
      message,
    );
  } finally {
    rmSync(
      workDir,
      {
        recursive: true,
        force: true,
      },
    );
  }
}

// ============================================================================
// CLAIM NEXT PROJECT
// ============================================================================

async function claimNextProject():
  Promise<ProjectRow | null> {
  const {
    data,
    error,
  } = await supabase
    .from("projects")
    .select("*")
    .eq(
      "status",
      "QUEUED",
    )
    .order(
      "created_at",
      {
        ascending: true,
      },
    )
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "Failed to find queued project:",
      error.message,
    );

    return null;
  }

  if (!data) {
    return null;
  }

  const {
    data: claimed,
    error: claimError,
  } = await supabase
    .from("projects")
    .update({
      status: "DOWNLOADING",
      progress: 0,
      error_message: null,
    })
    .eq(
      "id",
      data.id,
    )
    .eq(
      "status",
      "QUEUED",
    )
    .select("*")
    .maybeSingle();

  if (
    claimError ||
    !claimed
  ) {
    return null;
  }

  return claimed as ProjectRow;
}

// ============================================================================
// MAIN WORKER LOOP
// ============================================================================

async function main(): Promise<void> {
  console.log(
    "ClipForge pipeline worker active.",
  );

  console.log(
    "Waiting for QUEUED projects...",
  );

  console.log(
    "IMPORTANT: run the Remotion worker separately with:",
  );

  console.log(
    "  npm run worker",
  );

  for (;;) {
    try {
      const project =
        await claimNextProject();

      if (project) {
        await processProject(
          project,
        );

        continue;
      }
    } catch (error) {
      console.error(
        "Pipeline worker error:",
        error instanceof Error
          ? error.message
          : String(error),
      );
    }

    await sleep(
      POLL_INTERVAL_MS,
    );
  }
}

void main();