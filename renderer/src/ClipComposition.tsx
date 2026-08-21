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
  const music = config.music
  if (!music) return null

  const fadeInFrames = music.fadeIn * FPS
  const fadeOutFrames = music.fadeOut * FPS
  const volume =
    music.volume *
    interpolate(frame, [0, fadeInFrames], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }) *
    interpolate(frame, [durationInFrames - fadeOutFrames, durationInFrames], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })

  return (
    <Audio
      src={music.audioUrl}
      volume={volume}
      startFrom={Math.round(music.trimStart * FPS)}
    />
  )
}

export const ClipComposition: React.FC<{ config: ClipConfiguration }> = ({ config }) => {
  const { width, height } = useVideoConfig()

  // Smart reframing: position the crop window over the detected subject.
  // For smart mode the crop center comes from upstream subject detection
  // stored in config.crop; center mode locks to the middle.
  const cropX = config.crop.mode === 'center' ? 0.5 : config.crop.x
  const cropY = config.crop.mode === 'center' ? 0.5 : config.crop.y

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <AbsoluteFill>
        <OffthreadVideo
          src={config.sourceVideo}
          startFrom={Math.round(config.startTime * FPS)}
          endAt={Math.round(config.endTime * FPS)}
          playbackRate={config.speed}          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: `${cropX * 100}% ${cropY * 100}%`,
            transform: `scale(${config.crop.scale})`,
          }}
        />
      </AbsoluteFill>

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
