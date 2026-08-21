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
  const music = config.music
  if (!music || !music.audioUrl) return null

  const fadeInFrames = (music.fadeIn || 0) * FPS
  const fadeOutFrames = (music.fadeOut || 0) * FPS
  
  // Smart Audio Ducking: If voiceover or voice is active, reduce music volume to 15-20%
  const isDucking = config.voiceover?.duckMusic !== false
  const duckMultiplier = isDucking ? 0.35 : 1.0

  const volume =
    (music.volume ?? 0.3) *
    duckMultiplier *
    interpolate(frame, [0, Math.max(1, fadeInFrames)], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }) *
    interpolate(
      frame,
      [Math.max(0, durationInFrames - fadeOutFrames), durationInFrames],
      [1, 0],
      {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      },
    )

  return (
    <Audio
      src={music.audioUrl}
      volume={volume}
      startFrom={Math.round((music.trimStart || 0) * FPS)}
    />
  )
}

const isDirectVideo = (url?: string | null): boolean => {
  if (!url) return false
  const lower = url.toLowerCase()
  if (
    (lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.png') ||
      lower.endsWith('.webp') ||
      lower.includes('images.unsplash.com') ||
      lower.includes('i.ytimg.com') ||
      lower.includes('ytimg.com')) &&
    !lower.includes('.mp4') &&
    !lower.includes('video') &&
    !lower.includes('blob:')
  ) {
    return false
  }
  return (
    lower.includes('.mp4') ||
    lower.includes('.webm') ||
    lower.includes('.mov') ||
    lower.includes('.m4v') ||
    lower.includes('.m3u8') ||
    lower.includes('.ogv') ||
    lower.includes('blob:') ||
    lower.includes('commondatastorage.googleapis.com') ||
    lower.includes('storage.googleapis.com') ||
    lower.includes('/storage/v1/object/') ||
    lower.includes('video') ||
    lower.includes('supabase.co/storage') ||
    lower.startsWith('http')
  )
}

const isDirectImage = (url?: string | null): boolean => {
  if (!url) return false
  const lower = url.toLowerCase()
  return (
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.webp') ||
    lower.includes('images.unsplash.com') ||
    lower.includes('i.ytimg.com') ||
    lower.includes('ytimg') ||
    lower.includes('placeholder')
  )
}

export const ClipComposition: React.FC<{ config: ClipConfiguration }> = ({ config }) => {
  const frame = useCurrentFrame()
  const { width, height, durationInFrames } = useVideoConfig()

  const cropConfig = config?.crop || { mode: 'smart', x: 0.5, y: 0.5, scale: 1 }
  const cropX = cropConfig.mode === 'center' ? 0.5 : cropConfig.x ?? 0.5
  const cropY = cropConfig.mode === 'center' ? 0.5 : cropConfig.y ?? 0.5
  const scale = cropConfig.scale ?? 1

  const startTime = Number(config?.startTime) || 0
  const endTime = Number(config?.endTime) || (startTime + 30)
  const startFrame = Math.max(0, Math.round(startTime * FPS))
  const endFrame = Math.max(startFrame + 30, Math.round(endTime * FPS))

  const sourceVideo = config?.sourceVideo || ''
  const hasVideoSource = isDirectVideo(sourceVideo)
  const hasImageSource = isDirectImage(sourceVideo)

  // Gentle Ken Burns slow zoom for image backdrops
  const imageZoom = interpolate(frame, [0, Math.max(1, durationInFrames)], [1, 1.12], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  // Pulsing ambient glow for background
  const glowOpacity = interpolate(
    Math.sin((frame / FPS) * Math.PI),
    [-1, 1],
    [0.15, 0.35],
  )

  return (
    <AbsoluteFill style={{ backgroundColor: '#07090E' }}>
      {/* Base Video / Backdrop */}
      {hasVideoSource ? (
        <AbsoluteFill>
          <Video
            src={sourceVideo}
            startFrom={startFrame}
            endAt={endFrame}
            playbackRate={config.speed || 1}
            volume={config.originalVolume ?? 1}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: `${cropX * 100}% ${cropY * 100}%`,
              transform: `scale(${scale})`,
            }}
          />
        </AbsoluteFill>
      ) : hasImageSource ? (
        <AbsoluteFill>
          <Img
            src={sourceVideo}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: `${cropX * 100}% ${cropY * 100}%`,
              transform: `scale(${scale * imageZoom})`,
              filter: 'brightness(0.85) saturate(1.15)',
            }}
          />
          {/* Subtle cinematic gradient vignette */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, transparent 35%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0.92) 100%)',
            }}
          />
        </AbsoluteFill>
      ) : (
        /* Fallback rich creator studio motion backdrop */
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, #1e1b4b 0%, #0c0a1f 60%, #030712 100%)' }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              opacity: glowOpacity,
              background: 'radial-gradient(circle at 50% 40%, rgba(99, 102, 241, 0.45) 0%, transparent 60%)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              opacity: 0.1,
              backgroundImage: 'radial-gradient(#818cf8 1.5px, transparent 1.5px)',
              backgroundSize: '40px 40px',
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

      {/* Standalone original audio stream from YouTube/source if provided */}
      {config?.originalAudioUrl && (
        <Audio
          src={config.originalAudioUrl}
          startFrom={startFrame}
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
