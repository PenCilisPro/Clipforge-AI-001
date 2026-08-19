// Clip configuration contract shared with the web app (src/lib/types.ts).

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
  resolution: { width: number; height: number }
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

export const FPS = 30
