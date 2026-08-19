# ClipForge AI

Private AI video clipping and publishing platform. Transforms long-form videos into
9:16 short-form clips for YouTube Shorts and TikTok:

```
SOURCE VIDEO → AI ANALYSIS → TRANSCRIPTION → PATTERN ENGINE → CLIP DETECTION →
CLIP CONFIGURATION → REMOTION RENDERING → CAPTIONS → B-ROLL → MUSIC →
9:16 FINAL VIDEO → PREVIEW → APPROVAL → CONTENT CALENDAR → AUTO PUBLISHING → ANALYTICS
```

## Architecture

| Piece | Where | What |
| --- | --- | --- |
| Web app | `src/` | React + Vite + Tailwind dashboard (auth-protected) |
| Database & storage | `supabase/migrations/` | Postgres schema, RLS, storage buckets |
| Edge Functions | `supabase/functions/` | B-roll/music search, OAuth, publishing, analytics sync |
| Remotion composition | `renderer/src/` | The 9:16 clip composition (captions, B-roll, music, branding) |
| Render worker | `renderer/worker.ts` | Polls `render_jobs`, renders MP4s, uploads to storage |
| Pipeline worker | `renderer/pipeline.ts` | Download → transcribe → pattern match → detect clips → queue renders |

## Setup

### 1. Web app

```bash
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```

### 2. Supabase

```bash
supabase db push                 # applies supabase/migrations
supabase functions deploy broll-search music-search process-video start-render \
  oauth-start oauth-callback publish-post sync-analytics
supabase secrets set PEXELS_API_KEY=... JAMENDO_CLIENT_ID=... \
  GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... \
  TIKTOK_CLIENT_KEY=... TIKTOK_CLIENT_SECRET=... \
  YOUTUBE_API_KEY=... APP_URL=https://your-app.example
```

Schedule `publish-post` and `sync-analytics` with Supabase cron for automatic
publishing and analytics collection.

### 3. Workers

Requires Node 22+, plus `yt-dlp`, `ffmpeg`, and `ffprobe` on PATH.

```bash
cd renderer
npm install
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... OPENAI_API_KEY=... npm run pipeline  # processing
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run worker                       # rendering
npm run studio   # open Remotion Studio to develop the composition
```

## Commands

- `npm run dev` — web app dev server
- `npm run build` — typecheck + production build
- `npm run lint` — oxlint
- `renderer: npm run worker` — render worker
- `renderer: npm run pipeline` — processing pipeline worker
- `renderer: npm run studio` — Remotion Studio

## Notes

- All API keys and OAuth tokens stay server-side (edge function secrets / worker env).
  The browser is denied read access to token columns.
- Posts are only marked PUBLISHED after the platform API confirms success.
- TikTok publishing capabilities depend on your TikTok developer app's approval level.
