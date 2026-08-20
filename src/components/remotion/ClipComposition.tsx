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
  const volume =
    (music.volume ?? 0.5) *
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

export const ClipComposition: React.FC<{ config: ClipConfiguration }> = ({ config }) => {
  const { width, height } = useVideoConfig()

  const cropX = config.crop.mode === 'center' ? 0.5 : config.crop.x ?? 0.5
  const cropY = config.crop.mode === 'center' ? 0.5 : config.crop.y ?? 0.5
  const scale = config.crop.scale ?? 1

  return (
    <AbsoluteFill style={{ backgroundColor: '#0B0F19' }}>
      {/* Base Video / Backdrop */}
      {config.sourceVideo && (config.sourceVideo.endsWith('.mp4') || config.sourceVideo.endsWith('.webm') || config.sourceVideo.includes('blob:')) ? (
        <AbsoluteFill>
          <Video
            src={config.sourceVideo}
            startFrom={Math.round(config.startTime * FPS)}
            endAt={Math.round(config.endTime * FPS)}
            playbackRate={config.speed || 1}
            volume={config.voiceVolume ?? 1}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: `${cropX * 100}% ${cropY * 100}%`,
              transform: `scale(${scale})`,
            }}
          />
        </AbsoluteFill>
      ) : config.sourceVideo ? (
        <AbsoluteFill>
          <Img
            src={config.sourceVideo}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: `scale(${scale * 1.05})`,
              filter: 'brightness(0.85)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 40%, rgba(0,0,0,0.85) 100%)',
            }}
          />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{ background: 'radial-gradient(circle at center, #1e1b4b 0%, #030712 100%)' }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              opacity: 0.15,
              backgroundImage: 'radial-gradient(#6366f1 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
        </AbsoluteFill>
      )}

      {/* B-Roll Segments */}
      {config.broll?.map((b, i) => (
        <Sequence
          key={`broll-${i}`}
          from={Math.round(b.startAt * FPS)}
          durationInFrames={Math.max(1, Math.round(b.duration * FPS))}
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

      {/* Captions */}
      {config.captions?.enabled && config.captions.words?.length > 0 && (
        <Captions
          words={config.captions.words}
          style={config.captions.style}
          clipStart={config.startTime}
        />
      )}

      {/* Overlays */}
      {config.overlays?.map((overlay, i) => (
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
      {config.branding?.logoUrl && (
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
      {config.branding?.watermarkText && (
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

      {/* Background Music */}
      <MusicTrack config={config} />
    </AbsoluteFill>
  )
}
