import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || process.env.VITE_RAPIDAPI_KEY;
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || "youtube-media-downloader.p.rapidapi.com";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function extractYoutubeId(url?: string | null): string | null {
  if (!url) return null;
  const match = url.trim().match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  return match?.[1] || null;
}

function isStoragePath(value?: string | null): boolean {
  return !!value && !/^https?:\/\//i.test(value) && value.startsWith("projects/");
}

async function downloadYoutubeToStorage(projectId: string, youtubeUrl: string): Promise<string> {
  if (!RAPIDAPI_KEY) {
    throw new Error("RAPIDAPI_KEY (or VITE_RAPIDAPI_KEY) is required to repair a YouTube source.");
  }

  const response = await fetch(
    `https://${RAPIDAPI_HOST}/v2/video/download?url=${encodeURIComponent(youtubeUrl)}`,
    {
      headers: {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": RAPIDAPI_HOST,
      },
    },
  );

  if (!response.ok) throw new Error(`RapidAPI download endpoint returned ${response.status}.`);

  const contentType = response.headers.get("content-type") || "";
  let downloadUrl: string | null = null;

  if (contentType.includes("application/json")) {
    const data = (await response.json()) as any;
    const candidates = [
      data?.downloadUrl,
      data?.download_url,
      data?.link,
      data?.url,
      data?.data?.downloadUrl,
      data?.data?.download_url,
      data?.data?.url,
      Array.isArray(data?.data) ? data.data[0]?.downloadUrl : null,
      Array.isArray(data?.data) ? data.data[0]?.download_url : null,
      Array.isArray(data?.data) ? data.data[0]?.url : null,
      Array.isArray(data?.formats) ? data.formats.find((x: any) => typeof x?.url === "string")?.url : null,
    ];
    downloadUrl = candidates.find((x) => typeof x === "string" && x.length > 0) || null;
  } else {
    const bytes = Buffer.from(await response.arrayBuffer());
    const storagePath = `projects/${projectId}/source/source.mp4`;
    const { error } = await supabase.storage.from("sources").upload(storagePath, bytes, {
      contentType: "video/mp4",
      upsert: true,
    });
    if (error) throw new Error(`Source upload failed: ${error.message}`);
    return storagePath;
  }

  if (!downloadUrl) throw new Error("RapidAPI did not return a usable download URL.");

  const media = await fetch(downloadUrl);
  if (!media.ok) throw new Error(`RapidAPI media URL returned ${media.status}.`);

  const bytes = Buffer.from(await media.arrayBuffer());
  if (bytes.length === 0) throw new Error("Downloaded YouTube file was empty.");

  const storagePath = `projects/${projectId}/source/source.mp4`;
  const { error } = await supabase.storage.from("sources").upload(storagePath, bytes, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (error) throw new Error(`Source upload failed: ${error.message}`);

  await supabase
    .from("videos")
    .update({ storage_path: storagePath, file_size: bytes.length })
    .eq("project_id", projectId);

  return storagePath;
}

async function repairQueuedSources(): Promise<void> {
  const { data: jobs, error } = await supabase
    .from("render_jobs")
    .select("id, clip_id, clip_version_id, status")
    .in("status", ["QUEUED", "CLAIMED"])
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    console.error("Source repair query failed:", error.message);
    return;
  }

  for (const job of jobs || []) {
    try {
      const { data: version, error: versionError } = await supabase
        .from("clip_versions")
        .select("id, configuration_json")
        .eq("id", job.clip_version_id)
        .single();
      if (versionError || !version) continue;

      const config = { ...(version.configuration_json || {}) } as Record<string, any>;
      const currentSource = typeof config.sourceVideo === "string" ? config.sourceVideo.trim() : "";

      const { data: clip } = await supabase
        .from("clips")
        .select("id, project_id")
        .eq("id", job.clip_id)
        .single();
      if (!clip) continue;

      const { data: project } = await supabase
        .from("projects")
        .select("id, source_type, source_url")
        .eq("id", clip.project_id)
        .single();
      if (!project) continue;

      const { data: video } = await supabase
        .from("videos")
        .select("storage_path")
        .eq("project_id", clip.project_id)
        .maybeSingle();

      let sourcePath = isStoragePath(video?.storage_path) ? video!.storage_path : "";

      if (!sourcePath && project.source_type === "youtube" && project.source_url) {
        sourcePath = await downloadYoutubeToStorage(project.id, project.source_url);
      }

      if (!sourcePath && isStoragePath(currentSource)) sourcePath = currentSource;

      if (!sourcePath) {
        if (currentSource) {
          console.warn(`[source-repair] Keeping existing URL for job ${job.id}; no storage source is available yet.`);
        }
        continue;
      }

      if (currentSource !== sourcePath) {
        config.sourceVideo = sourcePath;
        const { error: updateError } = await supabase
          .from("clip_versions")
          .update({ configuration_json: config })
          .eq("id", version.id);
        if (updateError) throw new Error(updateError.message);
        console.log(`[source-repair] Job ${job.id}: sourceVideo -> ${sourcePath}`);
      }
    } catch (error) {
      console.error(`[source-repair] Job ${job.id} failed:`, error instanceof Error ? error.message : String(error));
    }
  }
}

async function main(): Promise<void> {
  console.log("ClipForge source repair + Remotion worker launcher started.");
  await repairQueuedSources();

  const worker = spawn("tsx", ["worker.ts"], {
    stdio: "inherit",
    shell: false,
  });

  const timer = setInterval(() => {
    void repairQueuedSources();
  }, 1000);

  worker.on("exit", (code, signal) => {
    clearInterval(timer);
    console.error(`Remotion worker exited (code=${code}, signal=${signal}).`);
    process.exit(code ?? 1);
  });

  worker.on("error", (error) => {
    clearInterval(timer);
    console.error("Could not start Remotion worker:", error);
    process.exit(1);
  });
}

void main();
