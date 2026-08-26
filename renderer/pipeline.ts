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
const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");
const ANTHROPIC_API_KEY = requireEnv("ANTHROPIC_API_KEY");
const RAPIDAPI_KEY = requireEnv("RAPIDAPI_KEY");
const PEXELS_API_KEY = requireEnv("PEXELS_API_KEY");
const JAMENDO_CLIENT_ID = requireEnv("JAMENDO_CLIENT_ID");

const RAPIDAPI_HOST =
  process.env.RAPIDAPI_HOST ||
  "youtube-media-downloader.p.rapidapi.com";

const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-opus-4-1";

// ============================================================================
// API HEADERS
// ============================================================================

const anthropicHeaders: Record<string, string> = {
  "x-api-key": ANTHROPIC_API_KEY,
  "anthropic-version": "2023-06-01",
  "content-type": "application/json",
};

const rapidApiHeaders: Record<string, string> = {
  "x-rapidapi-key": RAPIDAPI_KEY,
  "x-rapidapi-host": RAPIDAPI_HOST,
};

const pexelsHeaders: Record<string, string> = {
  Authorization: PEXELS_API_KEY,
};

const openAiHeaders: Record<string, string> = {
  Authorization: `Bearer ${OPENAI_API_KEY}`,
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

interface PatternRow {
  id: string;
  name: string;
  category: string;
  start_signal: string;
  end_signal: string;
  score: number;
  keywords: string[];
  is_active: boolean;
}

interface Candidate {
  start: number;
  end: number;
  title: string;
  hook: string;
  topic: string;
  category: string;

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
// CLAUDE CANDIDATE DETECTION
// ============================================================================

async function findMomentsWithClaude(
  project: ProjectRow,
  title: string,
  duration: number,
  patterns: PatternRow[],
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

  const patternText =
    patterns.length > 0
      ? patterns
          .map(
            (pattern) =>
              `- ID: ${pattern.id}, Name: "${pattern.name}", Category: "${pattern.category}", Start signal: "${pattern.start_signal}", End signal: "${pattern.end_signal}", Score: ${pattern.score}`,
          )
          .join("\n")
      : "No predefined patterns are available.";

  const prompt = `
You are ClipForge AI, an expert video clipping and viral retention specialist.

Video title:
"${title}"

Video duration:
${Math.round(duration)} seconds

Target clip duration:
${durationTarget}

Target number of clips:
${targetCount}

Available viral hook patterns:
${patternText}

Find the best ${targetCount} moments that could perform well as:
- YouTube Shorts
- TikTok
- Instagram Reels

Important:
- Timestamps must be inside the source video.
- start must be >= 0.
- end must be greater than start.
- end must be <= ${duration}.
- Prefer complete thoughts.
- Prefer strong hooks.
- Avoid starting in the middle of a sentence.
- Avoid ending in the middle of a thought.
- Distribute timestamps throughout the video when possible.
- Do not invent timestamps outside the video.
- Return ONLY valid JSON.

{
  "clips": [
    {
      "start": 0,
      "end": 30,
      "title": "Short title",
      "hook": "Strong hook",
      "topic": "Main topic",
      "category": "Insight",
      "patternId": null,
      "hookScore": 95,
      "engagementScore": 94,
      "emotionalScore": 90,
      "shareabilityScore": 95,
      "completenessScore": 96
    }
  ]
}
`;

  try {
    const response = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: anthropicHeaders,
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 4000,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      const errorText =
        await response.text();

      console.warn(
        `Claude returned ${response.status}: ${errorText}`,
      );

      return createFallbackCandidates(
        title,
        duration,
        targetCount,
      );
    }

    const json =
      (await response.json()) as any;

    const text =
      json.content?.[0]?.text || "";

    if (!text) {
      console.warn(
        "Claude returned empty content.",
      );

      return createFallbackCandidates(
        title,
        duration,
        targetCount,
      );
    }

    const cleanedText =
      text
        .replace(
          /^```json\s*/i,
          "",
        )
        .replace(
          /^```\s*/i,
          "",
        )
        .replace(
          /\s*```$/i,
          "",
        )
        .trim();

    const parsed =
      JSON.parse(cleanedText);

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

    const patternMap =
      new Map(
        patterns.map(
          (pattern) => [
            pattern.id,
            pattern,
          ],
        ),
      );

    const candidates =
      parsed.clips
        .filter((clip: any) => {
          const start =
            Number(clip.start);

          const end =
            Number(clip.end);

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
          const start = Math.max(
            0,
            Number(clip.start),
          );

          const end = Math.min(
            duration,
            Number(clip.end),
          );

          const pattern =
            clip.patternId
              ? patternMap.get(
                  String(
                    clip.patternId,
                  ),
                ) ?? null
              : null;

          const patternScore =
            pattern?.score ?? 50;

          const hookScore =
            Number(clip.hookScore) || 90;

          const engagementScore =
            Number(
              clip.engagementScore,
            ) || 90;

          const emotionalScore =
            Number(
              clip.emotionalScore,
            ) || 85;

          const shareabilityScore =
            Number(
              clip.shareabilityScore,
            ) || 90;

          const completenessScore =
            Number(
              clip.completenessScore,
            ) || 95;

          const score =
            hookScore * 0.3 +
            engagementScore * 0.3 +
            patternScore * 0.2 +
            shareabilityScore * 0.2;

          return {
            start,
            end,

            title: String(
              clip.title ||
                `Viral Moment ${title.slice(
                  0,
                  30,
                )}`,
            ),

            hook: String(
              clip.hook ||
                "Watch until the end.",
            ),

            topic: String(
              clip.topic || title,
            ),

            category: String(
              clip.category ||
                "Insight",
            ),

            patternId:
              pattern?.id ?? null,

            patternName:
              pattern?.name ?? null,

            patternScore,
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
      "Claude candidate generation failed:",
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
): Promise<string> {
  const duration =
    Math.max(
      3,
      end - start,
    );

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
      "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",

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
      "-b:a",
      "64k",
      outAudioPath,
    ],
  );

  return outAudioPath;
}

// ============================================================================
// WHISPER
// ============================================================================

async function transcribeClippedAudio(
  clipAudioPath: string,
): Promise<{
  words: CaptionWordConfig[];
  text: string;
}> {
  try {
    const form = new FormData();

    const audioBuffer =
      readFileSync(
        clipAudioPath,
      );

    form.append(
      "file",
      new Blob(
        [audioBuffer],
        {
          type: "audio/mpeg",
        },
      ),
      "clip.mp3",
    );

    form.append(
      "model",
      "whisper-1",
    );

    form.append(
      "response_format",
      "verbose_json",
    );

    form.append(
      "timestamp_granularities[]",
      "word",
    );

    form.append(
      "timestamp_granularities[]",
      "segment",
    );

    const response =
      await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: openAiHeaders,
          body: form,
        },
      );

    if (!response.ok) {
      const errorText =
        await response.text();

      console.warn(
        `Whisper returned ${response.status}: ${errorText}`,
      );

      return {
        words: [],
        text: "",
      };
    }

    const data =
      (await response.json()) as any;

    const words:
      CaptionWordConfig[] =
      (data.words ?? []).map(
        (word: any) => ({
          text: String(
            word.word || "",
          ).trim(),

          start: Number(
            Number(
              word.start,
            ).toFixed(2),
          ),

          end: Number(
            Number(
              word.end,
            ).toFixed(2),
          ),
        }),
      );

    return {
      words,
      text: data.text || "",
    };
  } catch (error) {
    console.warn(
      "Whisper failed:",
      error instanceof Error
        ? error.message
        : String(error),
    );

    return {
      words: [],
      text: "",
    };
  }
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

    let patterns: PatternRow[] = [];

    if (project.pattern_set_id) {
      const {
        data,
        error,
      } = await supabase
        .from("patterns")
        .select(
          "id, name, category, start_signal, end_signal, score, keywords, is_active",
        )
        .eq(
          "pattern_set_id",
          project.pattern_set_id,
        )
        .eq(
          "is_active",
          true,
        );

      if (error) {
        throw new Error(
          `Failed to load patterns: ${error.message}`,
        );
      }

      patterns =
        (data ?? []) as PatternRow[];
    }

    const candidates =
      await findMomentsWithClaude(
        project,
        project.name,
        meta.duration,
        patterns,
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
      );

      // --------------------------------------------------------------------
      // C. WHISPER
      // --------------------------------------------------------------------

      const clipAudioPath =
        path.join(
          workDir,
          `clip_audio_${clip.id}.mp3`,
        );

      await extractClipAudio(
        clipVideoPath,
        clipAudioPath,
      );

      const {
        words: whisperWords,
      } =
        await transcribeClippedAudio(
          clipAudioPath,
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

          words: whisperWords,
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