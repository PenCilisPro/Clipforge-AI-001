export interface CaptionWord {
  text: string
  start: number
  end: number
}

export interface BrollItem {
  videoUrl: string
  startAt: number
  duration: number
  provider?: string
  query?: string | null
}

export interface MusicItem {
  audioUrl: string
  volume?: number
  trimStart?: number
  fadeIn?: number
  fadeOut?: number
}

export interface EditPlan {
  sourceVideo: string
  startTime: number
  endTime: number
  speed?: number
  resolution?: { width: 1080 | 720; height: 1920 | 1280 }
  crop?: {
    mode?: 'smart' | 'center' | 'manual'
    x?: number
    y?: number
    scale?: number
  }
  captions?: {
    enabled?: boolean
    style?: {
      font?: string
      fontSize?: number
      weight?: number
      position?: 'top' | 'center' | 'bottom'
      textColor?: string
      highlightColor?: string
      strokeColor?: string
      strokeWidth?: number
      animation?: 'none' | 'pop' | 'karaoke' | 'slide'
    }
    words?: CaptionWord[]
  }
  broll?: BrollItem[]
  music?: MusicItem | null
  overlays?: Array<{
    type: 'text'
    text: string
    position: 'top' | 'center' | 'bottom'
    startAt: number
    duration: number
    color: string
  }>
  branding?: {
    logoUrl?: string | null
    watermarkText?: string | null
  }
  originalVolume?: number
}

export interface RenderJob {
  id: string
  clip_id: string
  clip_version_id: string
  status: string
  progress: number
  stage: string | null
  error_message: string | null
}
