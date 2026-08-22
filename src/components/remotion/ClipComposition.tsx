import React from 'react'
import {
  AbsoluteFill,
  Audio,
  Img,
  Video,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { Captions } from './Captions'
import type { ClipConfiguration } from '@/lib/types'

const FPS = 30

const MusicTrack: React.FC<{ config: ClipConfiguration }> = ({ config }) => {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const music = config?.music
  if (!music || !music.audioUrl) return null

  const baseVolume = typeof music.volume === 'number' ? music.volume : 0.35
  if (baseVolume <= 0) return null

  const fadeInFrames = Math.max(0, (music.fadeIn || 0) * FPS)
  const fadeOutFrames = Math.max(0, (music.fadeOut || 0) * FPS)
  
  // Smart Audio Ducking: ONLY duck if AI voiceover or voice narration is ACTUALLY active and enabled!
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
  // Reject web page URLs that cannot be played directly by HTML <video>
  if (
    lower.includes('youtube.com/watch') ||
    lower.includes('youtube.com/shorts') ||
    lower.includes('youtu.be/') ||
    lower.includes('vimeo.com/') ||
    lower.includes('tiktok.com/')
  ) {
    return false
  }
  // Reject static images
  if (
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.gif') ||
    lower.includes('i.ytimg.com') ||
    lower.includes('images.unsplash.com')
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
    lower.includes('commondatastorage.googleapis.com') ||
    lower.includes('storage.googleapis.com') ||
    lower.includes('/storage/v1/object/') ||
    lower.includes('supabase.co/storage') ||
    lower.includes('googlevideo.com')
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
  const { width, height, durationInFrames } = useVideoConfig()

  const cropConfig = config?.crop || { mode: 'smart', x: 0.5, y: 0.5, scale: 1 }
  const cropX = cropConfig.mode === 'center' ? 0.5 : cropConfig.x ?? 0.5
  const cropY = cropConfig.mode === 'center' ? 0.5 : cropConfig.y ?? 0.5
  const scale = cropConfig.scale ?? 1

  const startTime = Number(config?.startTime) || 0
  const startFrame = Math.max(0, Math.round(startTime * FPS))

  const rawSource = (config?.sourceVideo || '').trim()

  const resolvedThumbnail = getResolvedThumbnail(config)

  // Cinematic Ken-Burns subtle motion for backdrops
  const kenBurnsScale = interpolate(frame, [0, Math.max(30, durationInFrames)], [1.02, 1.15], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const kenBurnsPanY = interpolate(frame, [0, Math.max(30, durationInFrames)], [0, -35], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  // Pulsing ambient glow
  const glowOpacity = interpolate(
    Math.sin((frame / FPS) * Math.PI),
    [-1, 1],
    [0.35, 0.65],
  )

  return (
    <AbsoluteFill style={{ backgroundColor: '#090B10' }}>
      {/* 1. Underlying Cinematic Footage / Motion Visual Engine (Never empty black or purple) */}
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        {/* Full-bleed blurred ambient backdrop */}
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

        {/* Primary foreground imagery with dynamic Ken Burns motion */}
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
              transform: `scale(${scale * kenBurnsScale}) translateY(${kenBurnsPanY}px)`,
              filter: 'contrast(1.05) saturate(1.1)',
            }}
          />
        </div>

        {/* Cinematic vignette & vertical contrast overlays */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0.2) 65%, rgba(0,0,0,0.85) 100%)',
          }}
        />

        {/* Studio accent light sweep */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: glowOpacity,
            background: 'radial-gradient(ellipse at 50% 30%, rgba(249, 115, 22, 0.25) 0%, transparent 60%)',
            pointerEvents: 'none',
          }}
        />

        {/* Dynamic Voice/Audio Equalizer Waveform Bars at bottom */}
        <div
          style={{
            position: 'absolute',
            bottom: 300,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-end',
            gap: 6,
            opacity: 0.75,
            pointerEvents: 'none',
          }}
        >
          {Array.from({ length: 18 }).map((_, idx) => {
            const barHeight = interpolate(
              Math.sin((frame * 0.25) + idx * 0.6),
              [-1, 1],
              [8, 48 + (idx % 4) * 12],
            )
            return (
              <div
                key={idx}
                style={{
                  width: 5,
                  height: barHeight,
                  borderRadius: 3,
                  backgroundColor: idx % 2 === 0 ? '#f97316' : '#ffffff',
                  opacity: 0.85,
                }}
              />
            )
          })}
        </div>
      </AbsoluteFill>

      {/* 2. Direct Video Player Layer (If direct MP4/WebM video exists) */}
      {rawSource && (
        <AbsoluteFill style={{ overflow: 'hidden' }}>
          <Video
            src={rawSource}
            startFrom={startFrame}
            endAt={startFrame + durationInFrames}
            playbackRate={config.speed || 1}
            volume={config.originalVolume ?? 1}
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: `${cropX * 100}% ${cropY * 100}%`,
              transform: `scale(${scale})`,
            }}
          />
        </AbsoluteFill>
      )}

      {/* B-Roll Segments */}
      {Array.isArray(config?.broll) &&
        config.broll.map((b, i) => (
          <Sequence
            key={`broll-${i}`}
            from={Math.max(0, Math.round((b.startAt || 0) * FPS))}
            durationInFrames={Math.max(1, Math.round((b.duration || 3) * FPS))}
          >
            <AbsoluteFill>
              <Video
                src={b.videoUrl}
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </AbsoluteFill>
          </Sequence>
        ))}

      {/* Synchronized Captions */}
      {config?.captions?.enabled !== false &&
        Array.isArray(config?.captions?.words) &&
        config.captions.words.length > 0 && (
          <Captions
            words={config.captions.words}
            style={config.captions.style}
            clipStart={startTime}
          />
        )}

      {/* Overlays */}
      {Array.isArray(config?.overlays) &&
        config.overlays.map((overlay, i) => (
          <Sequence
            key={`overlay-${i}`}
            from={Math.max(0, Math.round((overlay.startAt || 0) * FPS))}
            durationInFrames={Math.max(1, Math.round((overlay.duration || 3) * FPS))}
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
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  color: overlay.color || '#fff',
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

      {/* Branding Logo */}
      {config?.branding?.logoUrl && (
        <Img
          src={config.branding.logoUrl}
          style={{
            position: 'absolute',
            top: 48,
            right: 48,
            width: width * 0.12,
            opacity: 0.9,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Watermark */}
      {config?.branding?.watermarkText && (
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            right: 48,
            color: 'rgba(255,255,255,0.6)',
            fontSize: height * 0.016,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 600,
            pointerEvents: 'none',
          }}
        >
          {config.branding.watermarkText}
        </div>
      )}

      {/* Standalone original audio stream if video has no embedded audio or source is audio-only */}
      {config?.originalAudioUrl && config.originalAudioUrl !== rawSource && (
        <Audio
          src={config.originalAudioUrl}
          startFrom={startFrame}
          endAt={startFrame + durationInFrames}
          volume={config.originalVolume ?? 1}
        />
      )}

      {/* Voice Narration Audio Track */}
      {config?.voiceUrl && (
        <Audio
          src={config.voiceUrl}
          volume={config.voiceover?.volume ?? config.voiceVolume ?? 1}
        />
      )}

      {/* Background Music */}
      <MusicTrack config={config} />
    </AbsoluteFill>
  )
}
