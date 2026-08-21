import React from 'react'
import { Composition } from 'remotion'
import { ClipComposition } from './ClipComposition'
import { FPS, type ClipConfiguration } from './types'

const defaultConfig: ClipConfiguration = {
  sourceVideo: '',
  startTime: 0,
  endTime: 30,
  aspectRatio: '9:16',
  resolution: { width: 1080, height: 1920 },
  speed: 1,
  crop: { mode: 'center', x: 0.5, y: 0.5, scale: 1, subject: null },
  captions: {
    enabled: true,
    style: {
      preset: 'bold',
      font: 'Inter',
      fontSize: 64,
      weight: 800,
      position: 'bottom',
      animation: 'pop',
      highlightColor: '#f97316',
      textColor: '#ffffff',
      background: null,
      strokeColor: '#000000',
      strokeWidth: 8,
      alignment: 'center',
      lineSpacing: 1.2,
    },
    words: [],
  },
  broll: [],
  music: null,
  overlays: [],
  branding: { logoUrl: null, watermarkText: null },
  voiceVolume: 1,
}

export const Root: React.FC = () => {
  return (
    <Composition
      id="Clip"
      component={ClipComposition}
      durationInFrames={30 * FPS}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{ config: defaultConfig }}
      calculateMetadata={({ props }: { props: { config: typeof defaultConfig } }) => {
        const { config } = props
        const durationSeconds = Math.max(
          1,
          (config.endTime - config.startTime) / config.speed,
        )
        return {
          durationInFrames: Math.round(durationSeconds * FPS),
          width: config.resolution.width,
          height: config.resolution.height,
        }
      }}
    />
  )
}
