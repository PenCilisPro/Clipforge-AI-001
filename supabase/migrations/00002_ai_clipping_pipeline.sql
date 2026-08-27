-- IMG.LY-inspired timeline data model: keep the AI's semantic selection separate
-- from exact media timing. Word timestamps are the source of truth for clip bounds.

alter table public.transcripts
  add column if not exists words jsonb not null default '[]',
  add column if not exists speakers jsonb not null default '[]',
  add column if not exists diarization_provider text,
  add column if not exists metadata jsonb not null default '{}';

alter table public.clips
  add column if not exists selection_text text,
  add column if not exists selection_confidence numeric,
  add column if not exists active_speaker text,
  add column if not exists smart_crop jsonb not null default '{}';

alter table public.render_jobs
  add column if not exists output_path text,
  add column if not exists output_url text,
  add column if not exists thumbnail_url text,
  add column if not exists metadata jsonb not null default '{}';

create index if not exists transcripts_project_words_idx
  on public.transcripts (project_id, created_at desc);

create index if not exists render_jobs_output_idx
  on public.render_jobs (status, completed_at desc);
