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

export const ClipComposition: React.FC<{ config: ClipConfiguration }> = ({ config }) => {
  const { width, height, durationInFrames } = useVideoConfig()

  const cropConfig = config?.crop || { mode: 'smart', x: 0.5, y: 0.5, scale: 1 }
  const cropX = cropConfig.mode === 'center' ? 0.5 : cropConfig.x ?? 0.5
  const cropY = cropConfig.mode === 'center' ? 0.5 : cropConfig.y ?? 0.5
  const scale = cropConfig.scale ?? 1

  const startTime = Number(config?.startTime) || 0
  const startFrame = Math.max(0, Math.round(startTime * FPS))

  const rawSourceVideo = config?.sourceVideo || ''
  const isDirect = isDirectVideo(rawSourceVideo)
  const sourceVideo = isDirect
    ? rawSourceVideo
    : 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4'

  return (
    <AbsoluteFill style={{ backgroundColor: '#07090E' }}>
      {/* Base Video / Backdrop */}
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <Video
          src={sourceVideo}
          startFrom={startFrame}
          endAt={startFrame + durationInFrames}
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
      {config?.originalAudioUrl && config.originalAudioUrl !== sourceVideo && (
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
