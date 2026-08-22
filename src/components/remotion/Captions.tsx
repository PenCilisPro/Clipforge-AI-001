import React from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { CaptionStyle, CaptionWordConfig } from '@/lib/types'

const FPS = 30
const GROUP_SIZE = 3

interface CaptionsProps {
  words: CaptionWordConfig[]
  style: CaptionStyle
  clipStart?: number
}

export const Captions: React.FC<CaptionsProps> = ({ words, style, clipStart = 0 }) => {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const currentSeconds = frame / FPS
  const clipDuration = durationInFrames / FPS

  if (!words || words.length === 0) return null

  // Determine if input word timestamps are absolute (from full video start) or relative (0 to clip duration)
  const maxStart = Math.max(...words.map((w) => w.start || 0))
  const isAbsolute = clipStart > 0 && maxStart >= clipStart - 1.0

  // Normalize words to strictly [0, clipDuration] relative timeframe
  const normalizedWords: CaptionWordConfig[] = words
    .map((w) => {
      const s = isAbsolute ? (w.start ?? 0) - clipStart : (w.start ?? 0)
      const e = isAbsolute ? (w.end ?? s + 0.3) - clipStart : (w.end ?? s + 0.3)
      return {
        text: String(w.text || '').trim(),
        start: Math.max(0, Number(s.toFixed(2))),
        end: Math.max(s + 0.1, Number(e.toFixed(2))),
      }
    })
    .filter((w) => {
      // Keep words that occur during this clip playback window
      return w.text.length > 0 && w.end >= -0.2 && w.start <= clipDuration + 0.5
    })

  if (normalizedWords.length === 0) return null

  // Group words into bite-sized viral chunks (2 to 3 words)
  const groups: CaptionWordConfig[][] = []
  for (let i = 0; i < normalizedWords.length; i += GROUP_SIZE) {
    groups.push(normalizedWords.slice(i, i + GROUP_SIZE))
  }

  // Find active group for the current playback second
  const activeGroup = groups.find((g) => {
    const groupStart = g[0].start
    const groupEnd = g[g.length - 1].end
    return currentSeconds >= groupStart - 0.08 && currentSeconds <= groupEnd + 0.22
  })

  if (!activeGroup) return null

  const groupStartFrame = Math.max(0, Math.round(activeGroup[0].start * FPS))
  const appear = interpolate(frame - groupStartFrame, [0, 4], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const scale = style.animation === 'pop' ? 0.92 + appear * 0.08 : 1
  const translateY = style.animation === 'slide' ? (1 - appear) * 24 : 0

  const justifyContent =
    style.position === 'top' ? 'flex-start' : style.position === 'center' ? 'center' : 'flex-end'

  const fontFamily = style.font
    ? `"${style.font}", "Montserrat", "Bebas Neue", "Inter", sans-serif`
    : '"Montserrat", "Inter", sans-serif'

  return (
    <AbsoluteFill
      style={{
        justifyContent,
        alignItems: 'center',
        padding: style.position === 'top' ? '140px 40px 60px' : style.position === 'center' ? '60px 40px' : '60px 40px 180px',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: style.alignment || 'center',
          alignItems: 'center',
          gap: '0.22em',
          maxWidth: '92%',
          opacity: appear,
          transform: `scale(${scale}) translateY(${translateY}px)`,
          fontFamily,
          fontSize: style.fontSize || 54,
          fontWeight: style.weight || 900,
          lineHeight: style.lineSpacing || 1.15,
          textAlign: style.alignment || 'center',
          backgroundColor: style.background ?? 'rgba(0, 0, 0, 0.45)',
          borderRadius: 20,
          padding: '12px 26px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(10px)',
          textTransform:
            style.preset === 'high-impact' || style.font === 'Bebas Neue' || style.font === 'Anton'
              ? 'uppercase'
              : undefined,
        }}
      >
        {activeGroup.map((word, i) => {
          const isCurrentWord =
            currentSeconds >= word.start && currentSeconds <= word.end + 0.08
          const isPastWord = currentSeconds > word.end

          const highlighted =
            style.animation === 'karaoke'
              ? isCurrentWord || isPastWord
              : isCurrentWord

          const strokeWidth = style.strokeWidth ?? 6
          const strokeColor = style.strokeColor || '#000000'

          return (
            <span
              key={i}
              style={{
                color: highlighted ? (style.highlightColor || '#FACC15') : (style.textColor || '#FFFFFF'),
                textShadow: highlighted
                  ? `0 0 24px ${style.highlightColor || '#FACC15'}90, 0 4px 14px rgba(0,0,0,0.95)`
                  : '0 4px 14px rgba(0,0,0,0.95)',
                WebkitTextStroke: strokeWidth > 0
                  ? `${Math.max(1, strokeWidth / 2.5)}px ${strokeColor}`
                  : undefined,
                paintOrder: 'stroke fill',
                transform: isCurrentWord && style.animation === 'pop' ? 'scale(1.12)' : 'scale(1)',
                transition: 'transform 0.08s ease-out, color 0.08s ease-out',
                display: 'inline-block',
              }}
            >
              {word.text}
            </span>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}
