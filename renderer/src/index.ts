import React from 'react'
import { Composition, registerRoot } from 'remotion'
import { ClipComposition } from './ClipComposition'
import type { EditPlan } from './types'

const FPS = 30

const defaultPlan: EditPlan = {
  sourceVideo: '',
  startTime: 0,
  endTime: 30,
}

export const Root: React.FC = () => (
  <Composition
    id="Clip"
    component={ClipComposition}
    fps={FPS}
    width={1080}
    height={1920}
    durationInFrames={FPS * 30}
    defaultProps={{ plan: defaultPlan }}
    calculateMetadata={({ props }) => {
      const plan = props.plan
      const duration = Math.max(1, Number(plan.endTime || 30))
      const width = plan.resolution?.width ?? 1080
      const height = plan.resolution?.height ?? 1920
      return {
        durationInFrames: Math.max(1, Math.ceil(duration * FPS)),
        fps: FPS,
        width,
        height,
      }
    }}
  />
)

registerRoot(Root)
