import React from 'react'
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from 'remotion'
import type { EditPlan, CaptionWord } from './types'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function relativeWord(word: CaptionWord, startTime: number, speed: number) {
  const safeSpeed = speed > 0 ? speed : 1
  const rawStart = (word.start - startTime) / safeSpeed
  const rawEnd = (word.end - startTime) / safeSpeed

  const start = Math.max(0, rawStart)
  const minDuration = 1 / 30 // one frame at 30fps
  const end = Math.max(start + minDuration, rawEnd)

  return { start, end }
}

export const ClipComposition: React.FC<{ plan: EditPlan }> = ({ plan }) => {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const speed = plan.speed && plan.speed > 0 ? plan.speed : 1
  const time = frame / fps
  const crop = plan.crop ?? {}
  const cropX = clamp(Number(crop.x ?? 0.5), 0, 1)
  const cropY = clamp(Number(crop.y ?? 0.5), 0, 1)
  const cropScale = Math.max(1, Number(crop.scale ?? 1))

  const captionWords = plan.captions?.enabled ? plan.captions.words ?? [] : []
  const style = plan.captions?.style ?? {}
  const fontSize = Math.max(18, Number(style.fontSize ?? 64))
  const textColor = style.textColor ?? '#FFFFFF'
  const highlightColor = style.highlightColor ?? '#FACC15'
  const strokeColor = style.strokeColor ?? '#000000'
  const strokeWidth = Math.max(0, Number(style.strokeWidth ?? 6))
  const position = style.position ?? 'bottom'
  const captionTop = position === 'top' ? height * 0.12 : position === 'center' ? height * 0.5 : height * 0.78

  const activeIndex = captionWords.findIndex((word) => {
    const t = relativeWord(word, plan.startTime, speed)
    return time >= t.start && time < t.end
  })
  const windowStart = activeIndex < 0 ? 0 : Math.max(0, activeIndex - 1)
  const visibleWords = captionWords.slice(windowStart, windowStart + 4)

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <OffthreadVideo
          src={plan.sourceVideo}
          muted={false}
          playbackRate={speed}
          volume={plan.originalVolume ?? 1}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: `${cropX * 100}% ${cropY * 100}%`,
            transform: `scale(${cropScale})`,
          }}
        />
      </AbsoluteFill>

      {(plan.broll ?? []).map((item, index) => {
        const start = Math.max(0, Number(item.startAt ?? 0))
        const duration = Math.max(1 / fps, Number(item.duration ?? 0))
        const from = Math.round(start * fps)
        const durationInFrames = Math.max(1, Math.round(duration * fps))
        return (
          <Sequence key={`${item.videoUrl}-${index}`} from={from} durationInFrames={durationInFrames}>
            <AbsoluteFill style={{ overflow: 'hidden' }}>
              <OffthreadVideo
                src={item.videoUrl}
                volume={0}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </AbsoluteFill>
          </Sequence>
        )
      })}

      {visibleWords.length > 0 && activeIndex >= 0 && (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
          <div
            style={{
              position: 'absolute',
              left: width * 0.06,
              right: width * 0.06,
              top: captionTop,
              transform: 'translateY(-50%)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              textAlign: 'center',
              fontFamily: style.font ?? 'Arial, sans-serif',
              fontSize,
              fontWeight: Number(style.weight ?? 800),
              lineHeight: 1.05,
              WebkitTextStroke: `${strokeWidth}px ${strokeColor}`,
              paintOrder: 'stroke fill',
            }}
          >
            {visibleWords.map((word) => {
              const timing = relativeWord(word, plan.startTime, speed)
              const active = time >= timing.start && time < timing.end
              return (
                <span
                  key={`${word.text}-${word.start}`}
                  style={{
                    color: active ? highlightColor : textColor,
                    transform: active && style.animation === 'pop' ? 'scale(1.08)' : 'scale(1)',
                    transition: 'transform 80ms linear',
                  }}
                >
                  {word.text}
                </span>
              )
            })}
          </div>
        </AbsoluteFill>
      )}

      {(plan.overlays ?? []).map((overlay, index) => {
        const start = Math.max(0, overlay.startAt)
        const end = start + Math.max(0, overlay.duration)
        if (time < start || time > end) return null
        const top = overlay.position === 'top' ? height * 0.08 : overlay.position === 'center' ? height * 0.45 : height * 0.9
        return (
          <div
            key={`overlay-${index}`}
            style={{
              position: 'absolute',
              top,
              left: width * 0.06,
              right: width * 0.06,
              transform: 'translateY(-50%)',
              textAlign: 'center',
              fontSize: Math.round(fontSize * 0.8),
              fontWeight: 800,
              color: overlay.color || '#fff',
              fontFamily: style.font ?? 'Arial, sans-serif',
              textShadow: '0 3px 12px rgba(0,0,0,.8)',
            }}
          >
            {overlay.text}
          </div>
        )
      })}

      {plan.music?.audioUrl && (
        <Audio src={plan.music.audioUrl} volume={Math.max(0, Math.min(1, Number(plan.music.volume ?? 0.3)))} />
      )}
    </AbsoluteFill>
  )
}
