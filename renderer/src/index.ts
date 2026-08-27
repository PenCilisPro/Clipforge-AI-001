import { Composition, registerRoot } from 'remotion'
import React from 'react'
import { ClipComposition } from './ClipComposition'
import type { EditPlan } from './types'

const DEFAULT_FPS = 30
const DEFAULT_WIDTH = 1080
const DEFAULT_HEIGHT = 1920

export const Root: React.FC = () => (
  <Composition
    id="Clip"
    component={ClipComposition as React.FC<Record<string, unknown>>}
    fps={DEFAULT_FPS}
    width={DEFAULT_WIDTH}
    height={DEFAULT_HEIGHT}
    durationInFrames={DEFAULT_FPS * 30}
    calculateMetadata={({ props }) => {
      const plan = (props as { plan?: EditPlan }).plan
      const duration = Math.max(1, Number(plan?.endTime ?? 30) - Number(plan?.startTime ?? 0))
      const width = plan?.resolution?.width ?? DEFAULT_WIDTH
      const height = plan?.resolution?.height ?? DEFAULT_HEIGHT
      return {
        durationInFrames: Math.max(1, Math.ceil(duration * DEFAULT_FPS)),
        fps: DEFAULT_FPS,
        width,
        height,
      }
    }}
    defaultProps={{
      plan: {
        sourceVideo: '',
        startTime: 0,
        endTime: 30,
      } satisfies Partial<EditPlan>,
    }}
  />
)

registerRoot(Root)
