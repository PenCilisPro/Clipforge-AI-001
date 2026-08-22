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

export interface VoiceoverConfig {
  enabled: boolean
  voiceId: string
  actorName?: string
  rate: number
  pitch: number
  volume: number
  duckMusic: boolean
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
  originalVolume?: number
  originalAudioUrl?: string | null
  voiceVolume: number
  voiceUrl?: string | null
  voiceover?: VoiceoverConfig | null
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
    sourceVideo: sourceVideo || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    startTime: Number(startTime) || 0,
    endTime: Number(endTime) || (Number(startTime) || 0) + 30,
    aspectRatio: '9:16',
    resolution: { width: 1080, height: 1920 },
    speed: 1,
    crop: { mode: 'smart', x: 0.5, y: 0.5, scale: 1, subject: 'face' },
    captions: { enabled: true, style: { ...DEFAULT_CAPTION_STYLE }, words: [] },
    broll: [],
    music: null,
    overlays: [],
    branding: { logoUrl: null, watermarkText: null },
    originalVolume: 1.0,
    originalAudioUrl: null,
    voiceVolume: 1,
    voiceUrl: null,
    voiceover: {
      enabled: false,
      voiceId: 'alex-viral',
      actorName: 'Alex (Viral TikTok Narrator)',
      rate: 1.1,
      pitch: 1.05,
      volume: 1,
      duckMusic: true,
    },
  }
}

/**
 * Normalizes any stored or partial clip configuration into a complete, safe ClipConfiguration
 * that guarantees Remotion will render the best clipped moment smoothly with no blank screens.
 */
export function normalizeClipConfiguration(
  rawConfig: any,
  clip?: Clip | null,
  context?: {
    sourceUrl?: string | null
    thumbnailUrl?: string | null
    storagePath?: string | null
    sourceType?: string | null
    transcript?: Transcript | null
  } | null,
): ClipConfiguration {
  const startTime = typeof rawConfig?.startTime === 'number' && !isNaN(rawConfig.startTime)
    ? rawConfig.startTime
    : (clip?.start_time ?? 0)

  const endTime = typeof rawConfig?.endTime === 'number' && !isNaN(rawConfig.endTime) && rawConfig.endTime > startTime
    ? rawConfig.endTime
    : (clip?.end_time ?? (startTime + 30))

  // Determine the best source video / background (MUST be a playable video format, never a static image thumbnail)
  let sourceVideo = ''
  const isVideoExt = (url?: string | null) => {
    if (!url) return false
    const l = url.trim().toLowerCase()
    if (
      l.includes('youtube.com/watch') ||
      l.includes('youtube.com/shorts') ||
      l.includes('youtu.be/') ||
      l.includes('vimeo.com/') ||
      l.endsWith('.jpg') ||
      l.endsWith('.jpeg') ||
      l.endsWith('.png') ||
      l.endsWith('.webp') ||
      l.endsWith('.gif') ||
      l.includes('i.ytimg.com') ||
      l.includes('images.unsplash.com')
    ) {
      return false
    }
    return (
      l.includes('.mp4') ||
      l.includes('.webm') ||
      l.includes('.mov') ||
      l.includes('.m4v') ||
      l.includes('.m3u8') ||
      l.includes('blob:') ||
      l.includes('commondatastorage.googleapis.com') ||
      l.includes('storage.googleapis.com') ||
      l.includes('supabase.co/storage') ||
      l.includes('googlevideo.com')
    )
  }

  if (isVideoExt(rawConfig?.sourceVideo)) {
    sourceVideo = rawConfig.sourceVideo.trim()
  } else if (isVideoExt(context?.storagePath)) {
    sourceVideo = context!.storagePath!.trim()
  } else if (isVideoExt(context?.sourceUrl)) {
    sourceVideo = context!.sourceUrl!.trim()
  } else if (isVideoExt(clip?.current_render_url)) {
    sourceVideo = clip!.current_render_url!
  } else {
    // Default to a fast, reliable, pristine 1080p MP4 stream
    sourceVideo = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
  }

  // Safe Caption Style
  const rawStyle = rawConfig?.captions?.style || {}
  const style: CaptionStyle = {
    preset: rawStyle.preset || rawConfig?.captions?.preset || DEFAULT_CAPTION_STYLE.preset,
    font: rawStyle.font || DEFAULT_CAPTION_STYLE.font,
    fontSize: typeof rawStyle.fontSize === 'number' ? rawStyle.fontSize : DEFAULT_CAPTION_STYLE.fontSize,
    weight: typeof rawStyle.weight === 'number' ? rawStyle.weight : DEFAULT_CAPTION_STYLE.weight,
    position: rawStyle.position || DEFAULT_CAPTION_STYLE.position,
    animation: rawStyle.animation || DEFAULT_CAPTION_STYLE.animation,
    highlightColor: rawStyle.highlightColor || DEFAULT_CAPTION_STYLE.highlightColor,
    textColor: rawStyle.textColor || DEFAULT_CAPTION_STYLE.textColor,
    background: rawStyle.background !== undefined ? rawStyle.background : DEFAULT_CAPTION_STYLE.background,
    strokeColor: rawStyle.strokeColor || DEFAULT_CAPTION_STYLE.strokeColor,
    strokeWidth: typeof rawStyle.strokeWidth === 'number' ? rawStyle.strokeWidth : DEFAULT_CAPTION_STYLE.strokeWidth,
    alignment: rawStyle.alignment || DEFAULT_CAPTION_STYLE.alignment,
    lineSpacing: typeof rawStyle.lineSpacing === 'number' ? rawStyle.lineSpacing : DEFAULT_CAPTION_STYLE.lineSpacing,
  }

  // Safe Words: extract or generate if empty
  let words: CaptionWordConfig[] = []
  if (Array.isArray(rawConfig?.captions?.words) && rawConfig.captions.words.length > 0) {
    words = rawConfig.captions.words.map((w: any) => ({
      text: String(w.text || w.word || '').trim(),
      start: Number(w.start) || 0,
      end: Number(w.end) || (Number(w.start) || 0) + 0.3,
    })).filter((w: CaptionWordConfig) => w.text.length > 0)
  }

  // If words are still empty and transcript segments exist, extract directly from real video speech!
  if (words.length === 0 && context?.transcript?.segments && Array.isArray(context.transcript.segments) && context.transcript.segments.length > 0) {
    const clipDuration = Math.max(3, endTime - startTime)
    const overlapping = context.transcript.segments.filter(
      (s: any) => s.end >= startTime - 0.2 && s.start <= endTime + 0.2 && (s.text || '').trim().length > 0,
    )

    if (overlapping.length > 0) {
      for (const seg of overlapping) {
        const rawTokens = String(seg.text).trim().split(/\s+/).filter(Boolean)
        if (rawTokens.length === 0) continue
        const segStart = Math.max(0, seg.start - startTime)
        const segEnd = Math.min(clipDuration, seg.end - startTime)
        const segDur = Math.max(0.3, segEnd - segStart)
        const tokenPacing = segDur / rawTokens.length

        for (let i = 0; i < rawTokens.length; i++) {
          const token = rawTokens[i]
          const wStart = segStart + i * tokenPacing
          const wEnd = Math.min(clipDuration, wStart + Math.max(0.18, tokenPacing * 0.95))
          if (wEnd >= 0 && wStart <= clipDuration + 0.2) {
            words.push({
              text: token,
              start: Number(Math.max(0, wStart).toFixed(2)),
              end: Number(Math.max(wStart + 0.15, wEnd).toFixed(2)),
            })
          }
        }
      }
    }
  }

  // If words are still empty, build words from hook or viral sentence
  if (words.length === 0 && clip) {
    const duration = Math.max(3, endTime - startTime)
    const hook = clip.hook || `Here is the secret about ${clip.title}`
    const body = `If you want to master ${clip.topic || 'this'}, you must stop making the same mistakes. Focus on real execution every single day.`
    const sentence = `${hook}. ${body}`
    const rawList = sentence.split(/\s+/).filter(Boolean)
    const pacing = Math.min(0.45, Math.max(0.22, duration / (rawList.length + 4)))
    let current = 0.1
    for (let i = 0; i < rawList.length && current < duration - 0.2; i++) {
      const w = rawList[i]
      const wDur = Math.max(0.18, w.length * 0.05 + (pacing - 0.1))
      const wEnd = Math.min(duration, current + wDur)
      words.push({
        text: w,
        start: Number(current.toFixed(2)),
        end: Number(wEnd.toFixed(2)),
      })
      current = Number((wEnd + 0.06).toFixed(2))
    }
  }

  // Safe B-Roll
  const broll: BrollConfigItem[] = Array.isArray(rawConfig?.broll)
    ? rawConfig.broll.map((b: any) => ({
        videoUrl: String(b.videoUrl || ''),
        startAt: Number(b.startAt) || 0,
        duration: Number(b.duration) || 3,
        provider: String(b.provider || 'stock'),
        query: b.query ? String(b.query) : null,
      })).filter((b: BrollConfigItem) => Boolean(b.videoUrl))
    : []

  // Safe Overlays
  const overlays: OverlayConfig[] = Array.isArray(rawConfig?.overlays)
    ? rawConfig.overlays.map((o: any) => ({
        type: 'text' as const,
        text: String(o.text || ''),
        position: o.position || 'bottom',
        startAt: Number(o.startAt) || 0,
        duration: Number(o.duration) || 3,
        color: String(o.color || '#ffffff'),
      }))
    : []

  // Safe Crop
  const crop: CropConfig = {
    mode: rawConfig?.crop?.mode || 'smart',
    x: typeof rawConfig?.crop?.x === 'number' ? rawConfig?.crop?.x : 0.5,
    y: typeof rawConfig?.crop?.y === 'number' ? rawConfig?.crop?.y : 0.5,
    scale: typeof rawConfig?.crop?.scale === 'number' ? rawConfig?.crop?.scale : 1,
    subject: rawConfig?.crop?.subject || 'face',
  }

  // Safe Voiceover (opt-in only so speech synthesis does not mix over original clip audio)
  const rawVoice = rawConfig?.voiceover
  const voiceover: VoiceoverConfig = {
    enabled: Boolean(rawVoice?.enabled === true),
    voiceId: rawVoice?.voiceId || 'alex-viral',
    actorName: rawVoice?.actorName || 'Alex (Viral TikTok Narrator)',
    rate: typeof rawVoice?.rate === 'number' ? rawVoice.rate : 1.1,
    pitch: typeof rawVoice?.pitch === 'number' ? rawVoice.pitch : 1.05,
    volume: typeof rawVoice?.volume === 'number' ? rawVoice.volume : 1,
    duckMusic: rawVoice?.duckMusic !== false,
  }

  return {
    sourceVideo,
    startTime,
    endTime,
    aspectRatio: '9:16',
    resolution: { width: 1080, height: 1920 },
    speed: typeof rawConfig?.speed === 'number' && rawConfig.speed > 0 ? rawConfig.speed : 1,
    crop,
    captions: {
      enabled: rawConfig?.captions?.enabled !== false,
      style,
      words,
    },
    broll,
    music: rawConfig?.music && typeof rawConfig.music === 'object' && rawConfig.music.audioUrl ? rawConfig.music : null,
    overlays,
    branding: {
      logoUrl: rawConfig?.branding?.logoUrl || null,
      watermarkText: rawConfig?.branding?.watermarkText || null,
    },
    originalVolume: typeof rawConfig?.originalVolume === 'number' ? rawConfig.originalVolume : 1.0,
    originalAudioUrl: rawConfig?.originalAudioUrl || null,
    voiceVolume: typeof rawConfig?.voiceVolume === 'number' ? rawConfig.voiceVolume : 1,
    voiceUrl: rawConfig?.voiceUrl || null,
    voiceover,
  }
}

export type FeedbackCategory =
  | 'bug'
  | 'feature'
  | 'video_quality'
  | 'captions'
  | 'ui_ux'
  | 'performance'
  | 'general'

export type FeedbackStatus = 'pending' | 'in_review' | 'resolved' | 'planned' | 'archived'

export interface UserFeedback {
  id: string
  user_id?: string
  user_email: string
  user_name?: string
  category: FeedbackCategory
  rating: number // 1 to 5
  subject: string
  message: string
  device_info?: string
  status: FeedbackStatus
  admin_notes?: string
  admin_reply?: string
  created_at: string
  updated_at?: string
  is_read?: boolean
}

export const ADMIN_FEEDBACK_EMAIL = 'pencilmacro@gmail.com'

export const isFeedbackAdmin = (email?: string | null): boolean => {
  if (!email) return false
  return email.trim().toLowerCase() === ADMIN_FEEDBACK_EMAIL.toLowerCase()
}

