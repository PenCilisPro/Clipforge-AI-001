export type ProcessingStatus =
  | 'UPLOADING'
  | 'QUEUED'
  | 'DOWNLOADING'
  | 'EXTRACTING_AUDIO'
  | 'TRANSCRIBING'
  | 'ANALYZING'
  | 'MATCHING_PATTERNS'
  | 'FINDING_CLIPS'
  | 'GENERATING_CONFIG'
  | 'RENDERING'
  | 'ADDING_CAPTIONS'
  | 'FINDING_BROLL'
  | 'ADDING_MUSIC'
  | 'UPLOADING_RENDER'
  | 'COMPLETED'
  | 'FAILED'

export type RenderJobStatus =
  | 'QUEUED'
  | 'PREPARING'
  | 'RENDERING'
  | 'UPLOADING'
  | 'COMPLETED'
  | 'FAILED'

export type PostStatus =
  | 'DRAFT'
  | 'READY'
  | 'SCHEDULED'
  | 'UPLOADING'
  | 'PUBLISHED'
  | 'FAILED'
  | 'RETRYING'

export type Platform = 'youtube' | 'tiktok'

export type ClipStatus = 'DETECTED' | 'RENDERING' | 'RENDERED' | 'APPROVED' | 'FAILED'

export type SourceType = 'youtube' | 'upload'

export type DurationPreset = '15-30' | '30-60' | '60-90' | 'ai'

export interface Project {
  id: string
  user_id: string
  name: string
  source_type: SourceType
  source_url: string | null
  status: ProcessingStatus
  progress: number
  error_message: string | null
  pattern_set_id: string | null
  clip_duration_preset: DurationPreset
  max_clips: number
  auto_broll: boolean
  auto_music: boolean
  caption_preset: string
  ai_optimization: boolean
  created_at: string
  updated_at: string
}

export interface Video {
  id: string
  project_id: string
  title: string | null
  duration: number | null
  file_size: number | null
  storage_path: string | null
  thumbnail_url: string | null
  youtube_video_id: string | null
  width: number | null
  height: number | null
  created_at: string
}

export interface TranscriptWord {
  word: string
  start: number
  end: number
}

export interface TranscriptSegment {
  text: string
  start: number
  end: number
  words?: TranscriptWord[]
}

export interface Transcript {
  id: string
  project_id: string
  language: string | null
  full_text: string | null
  segments: TranscriptSegment[]
  created_at: string
}

export interface PatternSet {
  id: string
  user_id: string
  name: string
  is_active: boolean
  created_at: string
}

export interface Pattern {
  id: string
  pattern_set_id: string
  name: string
  category: string
  start_signal: string
  end_signal: string
  score: number
  description: string | null
  keywords: string[]
  is_active: boolean
  created_at: string
}

export interface Clip {
  id: string
  project_id: string
  title: string
  hook: string | null
  topic: string | null
  category: string | null
  start_time: number
  end_time: number
  duration: number
  score: number
  hook_score: number
  engagement_score: number
  pattern_score: number
  emotional_score: number
  shareability_score: number
  completeness_score: number
  matched_pattern_id: string | null
  matched_pattern_name: string | null
  status: ClipStatus
  approved: boolean
  current_version_id: string | null
  current_render_url: string | null
  current_thumbnail_url: string | null
  created_at: string
  updated_at: string
}

export interface ClipVersion {
  id: string
  clip_id: string
  version_number: number
  configuration_json: ClipConfiguration
  render_url: string | null
  thumbnail_url: string | null
  status: RenderJobStatus
  created_at: string
}

export interface RenderJob {
  id: string
  clip_id: string
  clip_version_id: string
  status: RenderJobStatus
  progress: number
  stage: string | null
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface ScheduledPost {
  id: string
  clip_id: string
  user_id: string
  platform: Platform
  scheduled_at: string
  status: PostStatus
  title: string
  description: string | null
  hashtags: string[]
  visibility: 'public' | 'unlisted' | 'private'
  external_post_id: string | null
  error_message: string | null
  retry_count: number
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface SocialAccount {
  id: string
  user_id: string
  platform: Platform
  account_name: string | null
  status: 'connected' | 'disconnected' | 'expired'
  last_sync_at: string | null
  created_at: string
  updated_at: string
}

export interface AnalyticsRecord {
  id: string
  scheduled_post_id: string
  views: number
  likes: number
  comments: number
  shares: number
  engagement_rate: number
  recorded_at: string
}

export interface BrollAsset {
  id: string
  clip_id: string
  provider: 'pexels' | 'pixabay' | 'coverr'
  external_id: string
  video_url: string
  preview_image_url: string | null
  search_query: string | null
  start_at: number
  duration: number
  created_at: string
}

export interface MusicTrack {
  id: string
  clip_id: string
  provider: 'jamendo'
  external_id: string
  title: string
  artist: string | null
  audio_url: string
  duration: number | null
  volume: number
  fade_in: number
  fade_out: number
  trim_start: number
  created_at: string
}

// ---- Clip configuration JSON (drives the Remotion composition) ----

export interface CaptionStyle {
  preset: 'bold' | 'minimal' | 'kinetic' | 'creator' | 'high-impact'
  font: string
  fontSize: number
  weight: number
  position: 'top' | 'center' | 'bottom'
  animation: 'none' | 'pop' | 'karaoke' | 'slide'
  highlightColor: string
  textColor: string
  background: string | null
  strokeColor: string | null
  strokeWidth: number
  alignment: 'left' | 'center' | 'right'
  lineSpacing: number
}

export interface CropConfig {
  mode: 'smart' | 'center' | 'manual'
  x: number
  y: number
  scale: number
  subject: 'face' | 'speaker' | 'motion' | null
}

export interface BrollConfigItem {
  videoUrl: string
  startAt: number
  duration: number
  provider: string
  query: string | null
}

export interface MusicConfig {
  audioUrl: string
  volume: number
  fadeIn: number
  fadeOut: number
  trimStart: number
  title: string | null
}

export interface OverlayConfig {
  type: 'text'
  text: string
  position: 'top' | 'center' | 'bottom'
  startAt: number
  duration: number
  color: string
}

export interface CaptionWordConfig {
  text: string
  start: number
  end: number
}

export interface ClipConfiguration {
  sourceVideo: string
  startTime: number
  endTime: number
  aspectRatio: '9:16'
  resolution: { width: 1080; height: 1920 } | { width: 720; height: 1280 }
  speed: number
  crop: CropConfig
  captions: {
    enabled: boolean
    style: CaptionStyle
    words: CaptionWordConfig[]
  }
  broll: BrollConfigItem[]
  music: MusicConfig | null
  overlays: OverlayConfig[]
  branding: {
    logoUrl: string | null
    watermarkText: string | null
  }
  voiceVolume: number
}

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  preset: 'bold',
  font: 'Inter',
  fontSize: 64,
  weight: 800,
  position: 'bottom',
  animation: 'pop',
  highlightColor: '#f97316',
  textColor: '#ffffff',
  background: null,
  strokeColor: '#000000',
  strokeWidth: 8,
  alignment: 'center',
  lineSpacing: 1.2,
}

export function defaultClipConfiguration(
  sourceVideo: string,
  startTime: number,
  endTime: number,
): ClipConfiguration {
  return {
    sourceVideo,
    startTime,
    endTime,
    aspectRatio: '9:16',
    resolution: { width: 1080, height: 1920 },
    speed: 1,
    crop: { mode: 'smart', x: 0.5, y: 0.5, scale: 1, subject: 'face' },
    captions: { enabled: true, style: DEFAULT_CAPTION_STYLE, words: [] },
    broll: [],
    music: null,
    overlays: [],
    branding: { logoUrl: null, watermarkText: null },
    voiceVolume: 1,
  }
}
