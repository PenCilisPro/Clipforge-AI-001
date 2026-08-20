import React from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import type { CaptionStyle, CaptionWordConfig } from '@/lib/types'

const FPS = 30
const GROUP_SIZE = 3

interface CaptionsProps {
  words: CaptionWordConfig[]
  style: CaptionStyle
  clipStart: number
}

export const Captions: React.FC<CaptionsProps> = ({ words, style, clipStart }) => {
  const frame = useCurrentFrame()
  const currentSeconds = frame / FPS

  if (!words || words.length === 0) return null

  // Determine if input word timestamps are relative (0-based) or absolute (from video start)
  const isRelative = words[0].start < clipStart
  const normalizedWords = words.map((w) => ({
    ...w,
    start: isRelative ? w.start : w.start - clipStart,
    end: isRelative ? w.end : w.end - clipStart,
  }))

  const groups: CaptionWordConfig[][] = []
  for (let i = 0; i < normalizedWords.length; i += GROUP_SIZE) {
    groups.push(normalizedWords.slice(i, i + GROUP_SIZE))
  }

  const activeGroup = groups.find(
    (g) => currentSeconds >= g[0].start - 0.05 && currentSeconds <= g[g.length - 1].end + 0.25,
  )
  if (!activeGroup) return null

  const groupStartFrame = Math.max(0, Math.round(activeGroup[0].start * FPS))
  const appear = interpolate(frame - groupStartFrame, [0, 4], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const scale = style.animation === 'pop' ? 0.9 + appear * 0.1 : 1
  const translateY = style.animation === 'slide' ? (1 - appear) * 30 : 0

  const justify =
    style.position === 'top' ? 'flex-start' : style.position === 'center' ? 'center' : 'flex-end'

  return (
    <AbsoluteFill
      style={{
        justifyContent: justify,
        alignItems: 'center',
        padding: '160px 50px',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: style.alignment || 'center',
          gap: '0.2em',
          maxWidth: '92%',
          opacity: appear,
          transform: `scale(${scale}) translateY(${translateY}px)`,
          fontFamily: style.font || 'Inter, sans-serif',
          fontSize: style.fontSize || 54,
          fontWeight: style.weight || 900,
          lineHeight: style.lineSpacing || 1.15,
          textAlign: style.alignment || 'center',
          backgroundColor: style.background ?? 'rgba(0, 0, 0, 0.4)',
          borderRadius: 20,
          padding: '12px 24px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(8px)',
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

          return (
            <span
              key={i}
              style={{
                color: highlighted ? (style.highlightColor || '#FACC15') : (style.textColor || '#FFFFFF'),
                textShadow: highlighted
                  ? `0 0 20px ${style.highlightColor || '#FACC15'}80, 0 4px 12px rgba(0,0,0,0.9)`
                  : '0 4px 12px rgba(0,0,0,0.9)',
                WebkitTextStroke: style.strokeWidth
                  ? `${style.strokeWidth / 3}px ${style.strokeColor || '#000000'}`
                  : '2px #000000',
                paintOrder: 'stroke fill',
                transform: isCurrentWord && style.animation === 'pop' ? 'scale(1.08)' : 'scale(1)',
                transition: 'transform 0.08s ease-out, color 0.08s ease-out',
                display: 'inline-block',
                textTransform:
                  style.preset === 'high-impact' ? 'uppercase' : undefined,
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

