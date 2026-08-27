# ClipForge dedicated renderer worker

The Vercel app remains the web/API layer. Heavy video processing runs in this Docker worker.

## What the worker runs

- `pipeline.ts`: claims `projects.status = QUEUED`, downloads/probes/analyzes the source, creates clip versions and `render_jobs`.
- `sourceRepair.ts`: repairs missing `sourceVideo` values and starts the Remotion render worker.
- `worker.ts`: claims `render_jobs.status = QUEUED`, renders with Remotion, validates with FFmpeg/ffprobe, and uploads the result.
- `rapidApiFetchFallback.ts`: keeps RapidAPI as the primary YouTube downloader and falls back to local `yt-dlp` on provider/quota HTTP failures.

The Docker image installs FFmpeg, Chromium, Python and `yt-dlp` so the worker does not depend on the Vercel runtime for video processing.

## Railway deployment

1. Create a new Railway service from this GitHub repository.
2. Use the `feat/dedicated-renderer-worker` branch until the worker is verified.
3. Set the service root directory to `renderer`.
4. Deploy using `renderer/Dockerfile`.
5. Set the following environment variables in Railway. Never commit their values to GitHub:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `RAPIDAPI_KEY`
- `RAPIDAPI_HOST` (optional; defaults to `youtube-media-downloader.p.rapidapi.com`)
- `PEXELS_API_KEY`
- `JAMENDO_CLIENT_ID`
- `ANTHROPIC_MODEL` (optional)
- `YTDLP_PATH` (optional; defaults to `/usr/local/bin/yt-dlp` in the image)

6. Start the service. The container runs `npm run worker:all`, which starts both the project pipeline and the source/Remotion worker and restarts either child if it exits unexpectedly.

## Vercel

The Vercel/Supabase `process-video` function should only validate the user/project and set the project to `QUEUED`. It must not attempt to run `yt-dlp`, FFmpeg, or Remotion inside Vercel.

The dedicated worker polls Supabase for queued projects/jobs, so no public worker URL is required for the basic queue architecture.

## Verification

After deployment, submit one YouTube project from the Vercel app and watch Railway logs. You should see:

1. `ClipForge pipeline worker active.`
2. A project claimed from `QUEUED`.
3. RapidAPI attempted first.
4. If RapidAPI is unavailable/quota-exhausted, `yt-dlp` fallback is invoked.
5. The source is uploaded to `sources`.
6. `render_jobs` are created as `QUEUED`.
7. The Remotion worker claims the jobs.
8. Final MP4/thumbnail are uploaded to `renders`.
9. Project reaches `COMPLETED`.
