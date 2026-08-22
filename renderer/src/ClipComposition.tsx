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
    lower.includes('blob:') ||
    lower.includes('googlevideo.com') ||
    lower.includes('storage.googleapis.com') ||
    lower.includes('supabase.co/storage') ||
    lower.startsWith('http')
  )
}

export const ClipComposition: React.FC<{ config: ClipConfiguration }> = ({ config }) => {
  const { width, height } = useVideoConfig()

  // Smart reframing: position the crop window over the detected subject.
  // For smart mode the crop center comes from upstream subject detection
  // stored in config.crop; center mode locks to the middle.
  const cropX = config.crop.mode === 'center' ? 0.5 : config.crop.x
  const cropY = config.crop.mode === 'center' ? 0.5 : config.crop.y

  const startFrame = Math.round(config.startTime * FPS)
  const endFrame = Math.round(config.endTime * FPS)

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Primary Video / Backdrop */}
      {isDirectVideo(config.sourceVideo) ? (
        <AbsoluteFill>
          <OffthreadVideo
            src={config.sourceVideo}
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
      ) : (
        <AbsoluteFill style={{ overflow: 'hidden' }}>
          <Img
            src={config.sourceVideo}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'brightness(0.95)',
              transform: `scale(${config.crop?.scale || 1})`,
            }}
          />
        </AbsoluteFill>
      )}

      {/* Standalone original audio stream if video has no embedded audio or source is image/audio-only */}
      {config.originalAudioUrl && (!isDirectVideo(config.sourceVideo) || config.originalAudioUrl !== config.sourceVideo) && (
        <Audio
          src={config.originalAudioUrl}
          startFrom={startFrame}
          volume={isDirectVideo(config.sourceVideo) ? 0 : (config.originalVolume ?? 1)}
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
