-- ClipForge AI — initial schema

create extension if not exists "pgcrypto";

-- ---------- projects ----------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  source_type text not null check (source_type in ('youtube', 'upload')),
  source_url text,
  status text not null default 'QUEUED',
  progress numeric not null default 0,
  error_message text,
  pattern_set_id uuid,
  clip_duration_preset text not null default 'ai',
  max_clips integer not null default 10,
  auto_broll boolean not null default true,
  auto_music boolean not null default true,
  caption_preset text not null default 'bold',
  ai_optimization boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- videos ----------
create table public.videos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text,
  duration numeric,
  file_size bigint,
  storage_path text,
  thumbnail_url text,
  youtube_video_id text,
  width integer,
  height integer,
  created_at timestamptz not null default now()
);

-- ---------- transcripts ----------
create table public.transcripts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  language text,
  full_text text,
  segments jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- ---------- pattern sets & patterns ----------
create table public.pattern_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.patterns (
  id uuid primary key default gen_random_uuid(),
  pattern_set_id uuid not null references public.pattern_sets(id) on delete cascade,
  name text not null,
  category text not null default 'General',
  start_signal text not null default '',
  end_signal text not null default '',
  score numeric not null default 80,
  description text,
  keywords text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.projects
  add constraint projects_pattern_set_fk
  foreign key (pattern_set_id) references public.pattern_sets(id) on delete set null;

-- ---------- clips ----------
create table public.clips (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  hook text,
  topic text,
  category text,
  start_time numeric not null,
  end_time numeric not null,
  duration numeric not null,
  score numeric not null default 0,
  hook_score numeric not null default 0,
  engagement_score numeric not null default 0,
  pattern_score numeric not null default 0,
  emotional_score numeric not null default 0,
  shareability_score numeric not null default 0,
  completeness_score numeric not null default 0,
  matched_pattern_id uuid references public.patterns(id) on delete set null,
  matched_pattern_name text,
  status text not null default 'DETECTED',
  approved boolean not null default false,
  current_version_id uuid,
  current_render_url text,
  current_thumbnail_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- clip versions ----------
create table public.clip_versions (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references public.clips(id) on delete cascade,
  version_number integer not null,
  configuration_json jsonb not null default '{}',
  render_url text,
  thumbnail_url text,
  status text not null default 'QUEUED',
  created_at timestamptz not null default now(),
  unique (clip_id, version_number)
);

alter table public.clips
  add constraint clips_current_version_fk
  foreign key (current_version_id) references public.clip_versions(id) on delete set null;

-- ---------- captions ----------
create table public.captions (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references public.clips(id) on delete cascade,
  words jsonb not null default '[]',
  style jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------- broll assets ----------
create table public.broll_assets (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references public.clips(id) on delete cascade,
  provider text not null check (provider in ('pexels', 'pixabay', 'coverr')),
  external_id text not null,
  video_url text not null,
  preview_image_url text,
  search_query text,
  start_at numeric not null default 0,
  duration numeric not null default 3,
  created_at timestamptz not null default now()
);

-- ---------- music tracks ----------
create table public.music_tracks (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references public.clips(id) on delete cascade,
  provider text not null default 'jamendo',
  external_id text not null,
  title text not null,
  artist text,
  audio_url text not null,
  duration numeric,
  volume numeric not null default 0.12,
  fade_in numeric not null default 1,
  fade_out numeric not null default 1,
  trim_start numeric not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- render jobs ----------
create table public.render_jobs (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references public.clips(id) on delete cascade,
  clip_version_id uuid not null references public.clip_versions(id) on delete cascade,
  status text not null default 'QUEUED',
  progress numeric not null default 0,
  stage text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- scheduled posts ----------
create table public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references public.clips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'tiktok')),
  scheduled_at timestamptz not null,
  status text not null default 'DRAFT',
  title text not null,
  description text,
  hashtags text[] not null default '{}',
  visibility text not null default 'public',
  external_post_id text,
  error_message text,
  retry_count integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- social accounts ----------
create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'tiktok')),
  account_name text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  status text not null default 'disconnected',
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform)
);

-- ---------- analytics ----------
create table public.analytics (
  id uuid primary key default gen_random_uuid(),
  scheduled_post_id uuid not null references public.scheduled_posts(id) on delete cascade,
  views bigint not null default 0,
  likes bigint not null default 0,
  comments bigint not null default 0,
  shares bigint not null default 0,
  engagement_rate numeric not null default 0,
  recorded_at timestamptz not null default now()
);

-- ---------- indexes ----------
create index projects_user_idx on public.projects (user_id, created_at desc);
create index videos_project_idx on public.videos (project_id);
create index transcripts_project_idx on public.transcripts (project_id);
create index patterns_set_idx on public.patterns (pattern_set_id);
create index clips_project_idx on public.clips (project_id, score desc);
create index clip_versions_clip_idx on public.clip_versions (clip_id, version_number desc);
create index render_jobs_status_idx on public.render_jobs (status, created_at);
create index scheduled_posts_user_idx on public.scheduled_posts (user_id, scheduled_at);
create index scheduled_posts_due_idx on public.scheduled_posts (status, scheduled_at);
create index analytics_post_idx on public.analytics (scheduled_post_id, recorded_at desc);

-- ---------- row level security ----------
alter table public.projects enable row level security;
alter table public.videos enable row level security;
alter table public.transcripts enable row level security;
alter table public.pattern_sets enable row level security;
alter table public.patterns enable row level security;
alter table public.clips enable row level security;
alter table public.clip_versions enable row level security;
alter table public.captions enable row level security;
alter table public.broll_assets enable row level security;
alter table public.music_tracks enable row level security;
alter table public.render_jobs enable row level security;
alter table public.scheduled_posts enable row level security;
alter table public.social_accounts enable row level security;
alter table public.analytics enable row level security;

create policy "own projects" on public.projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own videos" on public.videos
  for all using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "own transcripts" on public.transcripts
  for all using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "own pattern_sets" on public.pattern_sets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own patterns" on public.patterns
  for all using (exists (select 1 from public.pattern_sets s where s.id = pattern_set_id and s.user_id = auth.uid()));

create policy "own clips" on public.clips
  for all using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "own clip_versions" on public.clip_versions
  for all using (exists (
    select 1 from public.clips c
    join public.projects p on p.id = c.project_id
    where c.id = clip_id and p.user_id = auth.uid()
  ));

create policy "own captions" on public.captions
  for all using (exists (
    select 1 from public.clips c
    join public.projects p on p.id = c.project_id
    where c.id = clip_id and p.user_id = auth.uid()
  ));

create policy "own broll_assets" on public.broll_assets
  for all using (exists (
    select 1 from public.clips c
    join public.projects p on p.id = c.project_id
    where c.id = clip_id and p.user_id = auth.uid()
  ));

create policy "own music_tracks" on public.music_tracks
  for all using (exists (
    select 1 from public.clips c
    join public.projects p on p.id = c.project_id
    where c.id = clip_id and p.user_id = auth.uid()
  ));

create policy "own render_jobs" on public.render_jobs
  for all using (exists (
    select 1 from public.clips c
    join public.projects p on p.id = c.project_id
    where c.id = clip_id and p.user_id = auth.uid()
  ));

create policy "own scheduled_posts" on public.scheduled_posts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- table grants ----------
-- RLS policies filter rows, but the roles still need table privileges.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Social accounts: rows visible to owner, but token columns must only be read
-- server-side (service role). A view without token columns is exposed instead.
create policy "own social_accounts" on public.social_accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke select on public.social_accounts from anon, authenticated;
grant select (id, user_id, platform, account_name, status, last_sync_at, created_at, updated_at)
  on public.social_accounts to authenticated;

create policy "own analytics" on public.analytics
  for all using (exists (
    select 1 from public.scheduled_posts sp
    where sp.id = scheduled_post_id and sp.user_id = auth.uid()
  ));

-- ---------- updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger clips_updated_at before update on public.clips
  for each row execute function public.set_updated_at();
create trigger scheduled_posts_updated_at before update on public.scheduled_posts
  for each row execute function public.set_updated_at();
create trigger social_accounts_updated_at before update on public.social_accounts
  for each row execute function public.set_updated_at();

-- ---------- storage buckets ----------
insert into storage.buckets (id, name, public)
values
  ('sources', 'sources', false),
  ('renders', 'renders', true),
  ('thumbnails', 'thumbnails', true),
  ('broll', 'broll', false)
on conflict (id) do nothing;

create policy "authenticated read sources" on storage.objects
  for select using (bucket_id = 'sources' and auth.role() = 'authenticated');
create policy "authenticated upload sources" on storage.objects
  for insert with check (bucket_id = 'sources' and auth.role() = 'authenticated');
create policy "public read renders" on storage.objects
  for select using (bucket_id in ('renders', 'thumbnails'));
create policy "authenticated write broll" on storage.objects
  for all using (bucket_id = 'broll' and auth.role() = 'authenticated');
