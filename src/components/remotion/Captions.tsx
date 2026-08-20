import React from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import type { CaptionStyle, CaptionWordConfig } from '@/lib/types'

const FPS = 30
const GROUP_SIZE = 4

interface CaptionsProps {
  words: CaptionWordConfig[]
  style: CaptionStyle
  clipStart: number
}

export const Captions: React.FC<CaptionsProps> = ({ words, style, clipStart }) => {
  const frame = useCurrentFrame()
  const time = clipStart + frame / FPS

  const groups: CaptionWordConfig[][] = []
  for (let i = 0; i < words.length; i += GROUP_SIZE) {
    groups.push(words.slice(i, i + GROUP_SIZE))
  }

  const activeGroup = groups.find(
    (g) => time >= g[0].start && time <= g[g.length - 1].end + 0.15,
  )
  if (!activeGroup) return null

  const groupStartFrame = Math.round((activeGroup[0].start - clipStart) * FPS)
  const appear = interpolate(frame - groupStartFrame, [0, 5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const scale = style.animation === 'pop' ? 0.85 + appear * 0.15 : 1
  const translateY = style.animation === 'slide' ? (1 - appear) * 40 : 0

  const justify =
    style.position === 'top' ? 'flex-start' : style.position === 'center' ? 'center' : 'flex-end'

  return (
    <AbsoluteFill
      style={{
        justifyContent: justify,
        alignItems: 'center',
        padding: '160px 60px',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: style.alignment,
          gap: '0.25em',
          maxWidth: '90%',
          opacity: appear,
          transform: `scale(${scale}) translateY(${translateY}px)`,
          fontFamily: style.font || 'sans-serif',
          fontSize: style.fontSize || 42,
          fontWeight: style.weight || 700,
          lineHeight: style.lineSpacing || 1.2,
          textAlign: style.alignment,
          backgroundColor: style.background ?? undefined,
          borderRadius: style.background ? 16 : undefined,
          padding: style.background ? '8px 20px' : undefined,
        }}
      >
        {activeGroup.map((word, i) => {
          const highlighted =
            style.animation === 'karaoke'
              ? time >= word.start
              : time >= word.start && time <= word.end
          return (
            <span
              key={i}
              style={{
                color: highlighted ? style.highlightColor : style.textColor,
                WebkitTextStroke: style.strokeColor
                  ? `${(style.strokeWidth || 0) / 4}px ${style.strokeColor}`
                  : undefined,
                paintOrder: 'stroke fill',
                textTransform: style.preset === 'high-impact' ? 'uppercase' : undefined,
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
