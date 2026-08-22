import React from 'react'
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { Captions } from './Captions'
import { FPS, type ClipConfiguration } from './types'

const MusicTrack: React.FC<{ config: ClipConfiguration }> = ({ config }) => {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const music = config?.music
  if (!music || !music.audioUrl) return null

  const baseVolume = typeof music.volume === 'number' ? music.volume : 0.35
  if (baseVolume <= 0) return null

  const fadeInFrames = Math.max(0, (music.fadeIn || 0) * FPS)
  const fadeOutFrames = Math.max(0, (music.fadeOut || 0) * FPS)

  const isVoiceActive = Boolean(config.voiceUrl) || config.voiceover?.enabled === true
  const isDucking = isVoiceActive && config.voiceover?.duckMusic !== false
  const duckMultiplier = isDucking ? 0.65 : 1.0

  const fadeInMultiplier =
    fadeInFrames > 0
      ? interpolate(frame, [0, Math.max(1, fadeInFrames)], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 1

  const fadeOutMultiplier =
    fadeOutFrames > 0 && durationInFrames > fadeOutFrames
      ? interpolate(
          frame,
          [Math.max(0, durationInFrames - fadeOutFrames), durationInFrames],
          [1, 0],
          {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          },
        )
      : 1

  const calculatedVolume = Math.max(
    0,
    Math.min(1.5, baseVolume * duckMultiplier * fadeInMultiplier * fadeOutMultiplier),
  )

  return (
    <Audio
      src={music.audioUrl}
      volume={calculatedVolume}
      startFrom={Math.round((music.trimStart || 0) * FPS)}
    />
  )
}

const isDirectVideo = (url?: string | null): boolean => {
  if (!url) return false
  const lower = url.trim().toLowerCase()
  if (
    lower.includes('youtube.com/watch') ||
    lower.includes('youtube.com/shorts') ||
    lower.includes('youtu.be/') ||
    lower.includes('vimeo.com/') ||
    lower.includes('tiktok.com/')
  ) {
    return false
  }
  if (
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.gif') ||
    lower.includes('images.unsplash.com') ||
    lower.includes('i.ytimg.com') ||
    lower.includes('ytimg.com')
  ) {
    return false
  }
  return (
    lower.includes('.mp4') ||
    lower.includes('.webm') ||
    lower.includes('.mov') ||
    lower.includes('.m4v') ||
    lower.includes('.m3u8') ||
    lower.includes('blob:') ||
    lower.includes('googlevideo.com') ||
    lower.includes('storage.googleapis.com') ||
    lower.includes('supabase.co/storage') ||
    lower.includes('commondatastorage.googleapis.com')
  )
}

const getResolvedThumbnail = (config: ClipConfiguration): string => {
  if (config.thumbnailUrl) return config.thumbnailUrl
  if (config.youtubeVideoId) {
    return `https://i.ytimg.com/vi/${config.youtubeVideoId}/hqdefault.jpg`
  }
  const raw = config.sourceVideo || ''
  const ytMatch = raw.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/)
  if (ytMatch) {
    return `https://i.ytimg.com/vi/${ytMatch[1]}/hqdefault.jpg`
  }
  return 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1280&q=80'
}

export const ClipComposition: React.FC<{ config: ClipConfiguration }> = ({ config }) => {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()

  // Smart reframing: position the crop window over the detected subject.
  const cropX = config.crop.mode === 'center' ? 0.5 : config.crop.x
  const cropY = config.crop.mode === 'center' ? 0.5 : config.crop.y

  const startFrame = Math.round(config.startTime * FPS)
  const endFrame = Math.round(config.endTime * FPS)
  const durationInFrames = Math.max(30, endFrame - startFrame)

  const rawSourceVideo = (config.sourceVideo || '').trim()
  const isDirect = isDirectVideo(rawSourceVideo)
  const resolvedThumbnail = getResolvedThumbnail(config)

  const kenBurnsScale = interpolate(frame, [0, Math.max(30, durationInFrames)], [1.02, 1.15], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const kenBurnsPanY = interpolate(frame, [0, Math.max(30, durationInFrames)], [0, -35], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={{ backgroundColor: '#090B10' }}>
      {/* 1. Underlying Cinematic Footage / Motion Visual Engine */}
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <Img
          src={resolvedThumbnail}
          style={{
            position: 'absolute',
            width: '120%',
            height: '120%',
            left: '-10%',
            top: '-10%',
            objectFit: 'cover',
            filter: 'blur(45px) brightness(0.45) saturate(1.4)',
            transform: `scale(${kenBurnsScale})`,
          }}
        />

        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <Img
            src={resolvedThumbnail}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: `${cropX * 100}% ${cropY * 100}%`,
              transform: `scale(${config.crop.scale * kenBurnsScale}) translateY(${kenBurnsPanY}px)`,
              filter: 'contrast(1.05) saturate(1.1)',
            }}
          />
        </div>

        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0.2) 65%, rgba(0,0,0,0.85) 100%)',
          }}
        />
      </AbsoluteFill>

      {/* 2. Direct Video Player Layer if source is raw MP4/WebM */}
      {isDirect && (
        <AbsoluteFill style={{ overflow: 'hidden' }}>
          <OffthreadVideo
            src={rawSourceVideo}
            startFrom={startFrame}
            endAt={endFrame}
            playbackRate={config.speed || 1}
            volume={config.originalVolume ?? 1}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: `${cropX * 100}% ${cropY * 100}%`,
              transform: `scale(${config.crop.scale})`,
            }}
          />
        </AbsoluteFill>
      )}

      {/* Standalone original audio stream if video has no embedded audio or source is audio-only */}
      {config.originalAudioUrl && config.originalAudioUrl !== sourceVideo && (
        <Audio
          src={config.originalAudioUrl}
          startFrom={startFrame}
          endAt={endFrame}
          volume={config.originalVolume ?? 1}
        />
      )}

      {/* Synchronized AI voiceover audio narration */}
      {config.voiceUrl && (
        <Audio
          src={config.voiceUrl}
          volume={config.voiceover?.volume ?? config.voiceVolume ?? 1}
        />
      )}

      {config.broll.map((b, i) => (
        <Sequence
          key={i}
          from={Math.round(b.startAt * FPS)}
          durationInFrames={Math.max(1, Math.round(b.duration * FPS))}
        >
          <AbsoluteFill>
            <OffthreadVideo
              src={b.videoUrl}
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </AbsoluteFill>
        </Sequence>
      ))}

      {config.captions.enabled && config.captions.words.length > 0 && (
        <Captions
          words={config.captions.words}
          style={config.captions.style}
          clipStart={config.startTime}
        />
      )}

      {config.overlays.map((overlay, i) => (
        <Sequence
          key={`overlay-${i}`}
          from={Math.round(overlay.startAt * FPS)}
          durationInFrames={Math.max(1, Math.round(overlay.duration * FPS))}
        >
          <AbsoluteFill
            style={{
              justifyContent:
                overlay.position === 'top'
                  ? 'flex-start'
                  : overlay.position === 'center'
                    ? 'center'
                    : 'flex-end',
              alignItems: 'center',
              padding: 120,
            }}
          >
            <div
              style={{
                color: overlay.color,
                fontSize: 56,
                fontWeight: 800,
                fontFamily: 'Inter, sans-serif',
                textAlign: 'center',
                textShadow: '0 2px 12px rgba(0,0,0,0.6)',
              }}
            >
              {overlay.text}
            </div>
          </AbsoluteFill>
        </Sequence>
      ))}

      {config.branding.logoUrl && (
        <Img
          src={config.branding.logoUrl}
          style={{
            position: 'absolute',
            top: 48,
            right: 48,
            width: width * 0.12,
            opacity: 0.9,
          }}
        />
      )}

      {config.branding.watermarkText && (
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            right: 48,
            color: 'rgba(255,255,255,0.6)',
            fontSize: height * 0.016,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 600,
          }}
        >
          {config.branding.watermarkText}
        </div>
      )}

      <MusicTrack config={config} />
    </AbsoluteFill>
  )
}
