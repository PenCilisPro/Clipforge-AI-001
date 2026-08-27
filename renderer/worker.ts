// ClipForge AI — Remotion Render Worker
//
// Polls Supabase for QUEUED render jobs.
// Claims one job at a time.
// Renders with Remotion.
// Uploads the final MP4.
// Updates clip_versions and clips.
// Updates ONLY render_jobs.progress.
//
// IMPORTANT:
// This worker does NOT directly control projects.progress.
// pipeline.ts is responsible for aggregating render-job progress.
//
// Run:
//   npm run worker

import { execFile } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { bundle } from "@Remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@Remotion/renderer";
import { createClient } from "@supabase/supabase-js";

import type { ClipConfiguration } from "./src/types";

const execFileAsync = promisify(execFile);

// ============================================================================
// ENVIRONMENT
// ============================================================================

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}`,
    );
  }

  return value;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

// ============================================================================
// SUPABASE
// ============================================================================

const supabase = createClient(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
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
const SOURCE_SIGNED_URL_TTL = 60 * 60 * 6;

// IMPORTANT:
// Railway currently has only 1 GB RAM.
// Never allow Remotion to spawn multiple render threads.
const REMOTION_CONCURRENCY = 1;

// ============================================================================
// TYPES
// ============================================================================

interface RenderJobRow {
  id: string;
  clip_id: string;
  clip_version_id: string;
  status: string;
  progress?: number;
  stage?: string | null;
  error_message?: string | null;
}

interface ClipVersionRow {
  id: string;
  clip_id: string;
  version_number: number;
  configuration_json: ClipConfiguration;
}

interface ClipRow {
  id: string;
  project_id: string;
  title: string;
}

// ============================================================================
// REMOTION BUNDLE
// ============================================================================

let bundleLocation: string | null = null;

async function getBundle(): Promise<string> {
  if (bundleLocation) {
    return bundleLocation;
  }

  console.log("Bundling Remotion composition...");

  bundleLocation = await bundle({
    entryPoint: path.resolve("src/index.ts"),
  });

  return bundleLocation;
}

// ============================================================================
// JOB UPDATE
// ============================================================================

async function updateJob(
  jobId: string,
  fields: {
    status?: string;
    progress?: number;
    stage?: string | null;
    error_message?: string | null;
    started_at?: string;
    completed_at?: string;
  },
): Promise<void> {
  const { error } = await supabase
    .from("render_jobs")
    .update(fields)
    .eq("id", jobId);

  if (error) {
    console.error(
      `Failed to update render job ${jobId}:`,
      error.message,
    );
  }
}

// ============================================================================
// SOURCE URL
// ============================================================================

async function resolveSourceUrl(
  config: ClipConfiguration,
): Promise<string> {
  const source = config.sourceVideo;

  if (
    typeof source !== "string" ||
    source.length === 0
  ) {
    throw new Error(
      "Clip configuration has no sourceVideo.",
    );
  }

  if (
    source.startsWith("http://") ||
    source.startsWith("https://")
  ) {
    return source;
  }

  const { data, error } =
    await supabase.storage
      .from("sources")
      .createSignedUrl(
        source,
        SOURCE_SIGNED_URL_TTL,
      );

  if (error || !data) {
    throw new Error(
      `Cannot sign source video URL for "${source}": ${
        error?.message || "unknown error"
      }`,
    );
  }

  return data.signedUrl;
}

// ============================================================================
// PROCESS RENDER JOB
// ============================================================================

async function processJob(
  job: RenderJobRow,
): Promise<void> {
  console.log(
    `\nProcessing render job ${job.id}...`,
  );

  await updateJob(job.id, {
    status: "RENDERING",
    stage: "PREPARING",
    progress: 0,
    started_at: new Date().toISOString(),
    error_message: null,
  });

  await supabase
    .from("clip_versions")
    .update({
      status: "RENDERING",
    })
    .eq(
      "id",
      job.clip_version_id,
    );

  const workDir = mkdtempSync(
    path.join(
      tmpdir(),
      "clipforge-render-",
    ),
  );

  try {
    // ------------------------------------------------------------------------
    // LOAD CLIP VERSION
    // ------------------------------------------------------------------------

    const {
      data: versionData,
      error: versionError,
    } = await supabase
      .from("clip_versions")
      .select(
        "id, clip_id, version_number, configuration_json",
      )
      .eq(
        "id",
        job.clip_version_id,
      )
      .single();

    if (
      versionError ||
      !versionData
    ) {
      throw new Error(
        `Cannot load clip version: ${
          versionError?.message ||
          "unknown error"
        }`,
      );
    }

    const version =
      versionData as ClipVersionRow;

    // ------------------------------------------------------------------------
    // LOAD CLIP
    // ------------------------------------------------------------------------

    const {
      data: clipData,
      error: clipError,
    } = await supabase
      .from("clips")
      .select(
        "id, project_id, title",
      )
      .eq(
        "id",
        job.clip_id,
      )
      .single();

    if (
      clipError ||
      !clipData
    ) {
      throw new Error(
        `Cannot load clip: ${
          clipError?.message ||
          "unknown error"
        }`,
      );
    }

    const clip =
      clipData as ClipRow;

    // ------------------------------------------------------------------------
    // CONFIGURATION
    // ------------------------------------------------------------------------

    const config: ClipConfiguration = {
      ...version.configuration_json,
    };

    config.sourceVideo =
      await resolveSourceUrl(config);

    console.log(
      `Source URL resolved for clip ${clip.id}.`,
    );

    // ------------------------------------------------------------------------
    // BUNDLE REMOTION
    // ------------------------------------------------------------------------

    await updateJob(job.id, {
      stage: "BUNDLING",
      progress: 2,
    });

    const serveUrl =
      await getBundle();

    // ------------------------------------------------------------------------
    // SELECT COMPOSITION
    // ------------------------------------------------------------------------

    await updateJob(job.id, {
      stage: "PREPARING",
      progress: 5,
    });

    const composition =
      await selectComposition({
        serveUrl,
        id: "Clip",
        inputProps: {
          config,
        },
      });

    // ------------------------------------------------------------------------
    // RENDER VIDEO
    // ------------------------------------------------------------------------

    const outputPath =
      path.join(
        workDir,
        "clip.mp4",
      );

    let lastReported = -1;

    await updateJob(job.id, {
      stage: "RENDERING",
      progress: 5,
    });

    console.log(
      `Starting Remotion render with concurrency=${REMOTION_CONCURRENCY}`,
    );

    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: outputPath,

      // CRITICAL FOR 1 GB RAILWAY MEMORY
      concurrency: REMOTION_CONCURRENCY,

      inputProps: {
        config,
      },

      onProgress: ({
        progress,
      }: {
        progress: number;
      }) => {
        const safeProgress =
          Math.max(
            0,
            Math.min(
              1,
              progress,
            ),
          );

        const pct =
          Math.round(
            safeProgress * 85,
          ) + 5;

        if (
          pct >=
          lastReported + 2
        ) {
          lastReported = pct;

          void updateJob(
            job.id,
            {
              status:
                "RENDERING",
              stage:
                "RENDERING",
              progress: pct,
            },
          );
        }
      },
    });

    console.log(
      `Remotion render finished for job ${job.id}.`,
    );

    // ------------------------------------------------------------------------
    // VALIDATE OUTPUT
    // ------------------------------------------------------------------------

    await updateJob(job.id, {
      stage: "VALIDATING",
      progress: 92,
    });

    const {
      stdout: ffprobeStdout,
    } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type,codec_name,duration",
        "-of",
        "json",
        outputPath,
      ],
    );

    const ffprobeResult =
      JSON.parse(
        ffprobeStdout,
      );

    const streams =
      ffprobeResult.streams || [];

    const videoStream =
      streams.find(
        (stream: any) =>
          stream.codec_type ===
          "video",
      );

    if (!videoStream) {
      throw new Error(
        "Remotion output contains no video stream.",
      );
    }

    console.log(
      `Output streams: ${streams
        .map(
          (stream: any) =>
            stream.codec_type,
        )
        .join(", ")}`,
    );

    // ------------------------------------------------------------------------
    // UPLOAD VIDEO
    // ------------------------------------------------------------------------

    await updateJob(job.id, {
      stage: "UPLOADING_RENDER",
      progress: 95,
    });

    const renderKey =
      `projects/${clip.project_id}/renders/${clip.id}-v${version.version_number}.mp4`;

    const {
      error: uploadError,
    } = await supabase.storage
      .from("renders")
      .upload(
        renderKey,
        readFileSync(outputPath),
        {
          contentType:
            "video/mp4",
          upsert: true,
        },
      );

    if (uploadError) {
      throw new Error(
        `Render upload failed: ${uploadError.message}`,
      );
    }

    const renderUrl =
      supabase.storage
        .from("renders")
        .getPublicUrl(
          renderKey,
        )
        .data.publicUrl;

    if (!renderUrl) {
      throw new Error(
        "Supabase did not return a render URL.",
      );
    }

    // ------------------------------------------------------------------------
    // GENERATE THUMBNAIL
    // ------------------------------------------------------------------------

    let thumbnailUrl:
      string | null = null;

    try {
      await updateJob(job.id, {
        stage:
          "GENERATING_THUMBNAIL",
        progress: 97,
      });

      const thumbnailPath =
        path.join(
          workDir,
          "thumbnail.jpg",
        );

      await renderStill({
        composition,
        serveUrl,
        output:
          thumbnailPath,

        // Keep thumbnail generation lightweight.
        inputProps: {
          config,
        },

        frame: 0,
        imageFormat: "jpeg",
      });

      const thumbnailKey =
        `projects/${clip.project_id}/thumbnails/${clip.id}-v${version.version_number}.jpg`;

      const {
        error:
          thumbnailUploadError,
      } = await supabase.storage
        .from("renders")
        .upload(
          thumbnailKey,
          readFileSync(
            thumbnailPath,
          ),
          {
            contentType:
              "image/jpeg",
            upsert: true,
          },
        );

      if (
        thumbnailUploadError
      ) {
        console.warn(
          `Thumbnail upload failed: ${thumbnailUploadError.message}`,
        );
      } else {
        thumbnailUrl =
          supabase.storage
            .from("renders")
            .getPublicUrl(
              thumbnailKey,
            )
            .data.publicUrl;
      }
    } catch (
      thumbnailError
    ) {
      console.warn(
        "Thumbnail generation failed:",
        thumbnailError instanceof Error
          ? thumbnailError.message
          : String(
              thumbnailError,
            ),
      );
    }

    // ------------------------------------------------------------------------
    // UPDATE CLIP VERSION
    // ------------------------------------------------------------------------

    const {
      error:
        versionUpdateError,
    } = await supabase
      .from("clip_versions")
      .update({
        render_url:
          renderUrl,
        thumbnail_url:
          thumbnailUrl,
        status:
          "RENDERED",
      })
      .eq(
        "id",
        version.id,
      );

    if (
      versionUpdateError
    ) {
      throw new Error(
        `Version update failed: ${versionUpdateError.message}`,
      );
    }

    // ------------------------------------------------------------------------
    // UPDATE CLIP
    // ------------------------------------------------------------------------

    const {
      error:
        clipUpdateError,
    } = await supabase
      .from("clips")
      .update({
        current_version_id:
          version.id,
        current_render_url:
          renderUrl,
        current_thumbnail_url:
          thumbnailUrl,
        status:
          "RENDERED",
      })
      .eq(
        "id",
        clip.id,
      );

    if (
      clipUpdateError
    ) {
      throw new Error(
        `Clip update failed: ${clipUpdateError.message}`,
      );
    }

    // ------------------------------------------------------------------------
    // COMPLETE RENDER JOB
    // ------------------------------------------------------------------------

    await updateJob(job.id, {
      status: "COMPLETED",
      stage: "COMPLETED",
      progress: 100,
      completed_at:
        new Date().toISOString(),
    });

    console.log(
      `Render job ${job.id} completed.`,
    );

    console.log(
      `Render URL: ${renderUrl}`,
    );

    if (thumbnailUrl) {
      console.log(
        `Thumbnail URL: ${thumbnailUrl}`,
      );
    }

    // IMPORTANT:
    // Do NOT update projects.progress here.
    //
    // pipeline.ts aggregates the render jobs and owns
    // the project-level progress.

  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : String(err);

    console.error(
      `Render job ${job.id} failed:`,
      message,
    );

    await updateJob(job.id, {
      status: "FAILED",
      stage: "FAILED",
      progress: 0,
      error_message:
        message,
      completed_at:
        new Date().toISOString(),
    });

    await supabase
      .from("clip_versions")
      .update({
        status: "FAILED",
      })
      .eq(
        "id",
        job.clip_version_id,
      );

    await supabase
      .from("clips")
      .update({
        status: "FAILED",
      })
      .eq(
        "id",
        job.clip_id,
      );

    // Do NOT update projects.progress here.
    // pipeline.ts will detect the FAILED render job.

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
// CLAIM NEXT JOB
// ============================================================================

async function claimNextJob():
  Promise<RenderJobRow | null> {
  const {
    data,
    error,
  } = await supabase
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
      "Failed to find queued render job:",
      error.message,
    );

    return null;
  }

  if (!data) {
    return null;
  }

  // --------------------------------------------------------------------------
  // ATOMIC CLAIM
  // --------------------------------------------------------------------------

  const {
    data: claimed,
    error: claimError,
  } =
    await supabase
      .from("render_jobs")
      .update({
        status: "CLAIMED",
        stage: "CLAIMED",
        progress: 0,
      })
      .eq(
        "id",
        data.id,
      )
      .eq(
        "status",
        "QUEUED",
      )
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
      .maybeSingle();

  if (
    claimError ||
    !claimed
  ) {
    return null;
  }

  return claimed as RenderJobRow;
}

// ============================================================================
// MAIN WORKER LOOP
// ============================================================================

async function main(): Promise<void> {
  console.log(
    "ClipForge Remotion render worker started.",
  );

  console.log(
    `Remotion concurrency: ${REMOTION_CONCURRENCY}`,
  );

  console.log(
    "Polling for QUEUED render jobs...",
  );

  for (;;) {
    try {
      const job =
        await claimNextJob();

      if (job) {
        // IMPORTANT:
        // Process exactly ONE render at a time.
        await processJob(job);
        continue;
      }

    } catch (error) {
      console.error(
        "Render worker loop error:",
        error instanceof Error
          ? error.message
          : String(error),
      );
    }

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          POLL_INTERVAL_MS,
        ),
    );
  }
}

void main();