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

  if (!words || !Array.isArray(words) || words.length === 0) return null

  const validWords = words.filter((w) => w && typeof w.text === 'string' && w.text.trim().length > 0)
  if (validWords.length === 0) return null

  // Calculate timestamp bounds of raw words
  const minStart = Math.min(...validWords.map((w) => (typeof w.start === 'number' ? w.start : 0)))
  const maxStart = Math.max(...validWords.map((w) => (typeof w.start === 'number' ? w.start : 0)))

  // Words are ONLY absolute if the FIRST word starts near or after clipStart, and words are in the clip's absolute timeline
  const isAbsolute = clipStart > 2 && minStart >= (clipStart - 1.5) && maxStart > clipStart

  // Normalize words to strictly [0, clipDuration] relative timeframe
  const normalizedWords: CaptionWordConfig[] = validWords
    .map((w) => {
      const s = isAbsolute ? (w.start ?? 0) - clipStart : (w.start ?? 0)
      const e = isAbsolute ? (w.end ?? s + 0.3) - clipStart : (w.end ?? s + 0.3)
      return {
        text: String(w.text || '').trim(),
        start: Math.max(0, Number(s.toFixed(2))),
        end: Math.max(s + 0.12, Number(e.toFixed(2))),
      }
    })
    .filter((w) => {
      // Keep words that are within or close to this clip duration window
      return w.end >= 0 && w.start <= clipDuration + 1.0
    })
    .sort((a, b) => a.start - b.start)

  if (normalizedWords.length === 0) return null

  // Group words into bite-sized viral chunks (2 to 3 words)
  const groups: CaptionWordConfig[][] = []
  for (let i = 0; i < normalizedWords.length; i += GROUP_SIZE) {
    groups.push(normalizedWords.slice(i, i + GROUP_SIZE))
  }

  // Find active group for the current playback second
  // First try to find a group that directly contains currentSeconds
  let activeGroup = groups.find((g) => {
    const groupStart = g[0].start
    const groupEnd = g[g.length - 1].end
    return currentSeconds >= groupStart - 0.12 && currentSeconds <= groupEnd + 0.28
  })

  // If between groups or at boundary, fallback to the group closest to current playback time
  if (!activeGroup) {
    activeGroup = groups.find((g, idx) => {
      const groupStart = g[0].start
      const nextGroupStart = groups[idx + 1] ? groups[idx + 1][0].start : clipDuration + 5
      return currentSeconds >= groupStart && currentSeconds < nextGroupStart
    })
  }

  // Fallback to first or last group if within range
  if (!activeGroup) {
    if (currentSeconds < normalizedWords[0].start && currentSeconds >= 0) {
      activeGroup = groups[0]
    } else if (currentSeconds >= normalizedWords[normalizedWords.length - 1].end && currentSeconds <= clipDuration) {
      activeGroup = groups[groups.length - 1]
    }
  }

  if (!activeGroup || activeGroup.length === 0) return null

  const groupStartFrame = Math.max(0, Math.round(activeGroup[0].start * FPS))
  const appear = interpolate(frame - groupStartFrame, [0, 3], [0.3, 1], {
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
        padding:
          style.position === 'top'
            ? '180px 40px 60px'
            : style.position === 'center'
            ? '60px 40px'
            : '60px 40px 380px',
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
