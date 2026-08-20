import React, { useRef } from 'react'
import { Player, type PlayerRef } from '@remotion/player'
import { ClipComposition } from './ClipComposition'
import type { ClipConfiguration } from '@/lib/types'
import { Sparkles } from 'lucide-react'

interface RemotionPlayerPreviewProps {
  config: ClipConfiguration
  className?: string
}

export const RemotionPlayerPreview: React.FC<RemotionPlayerPreviewProps> = ({
  config,
  className = '',
}) => {
  const playerRef = useRef<PlayerRef>(null)

  const startTime = Number(config?.startTime) || 0
  const endTime = Number(config?.endTime) || (startTime + 30)
  const durationSec = Math.max(1, endTime - startTime)
  const durationInFrames = Math.max(30, Math.round(durationSec * 30))

  return (
    <div className={`flex flex-col items-center w-full ${className}`}>
      <div className="relative aspect-[9/16] w-full max-w-[300px] overflow-hidden rounded-xl border border-surface-750 bg-black shadow-2xl">
        <Player
          ref={playerRef}
          component={ClipComposition}
          inputProps={{ config }}
          durationInFrames={durationInFrames}
          compositionWidth={1080}
          compositionHeight={1920}
          fps={30}
          style={{
            width: '100%',
            height: '100%',
          }}
          controls
          loop
          autoPlay={false}
          showVolumeControls
        />

        {/* Live Remotion Badge */}
        <div className="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-full bg-surface-900/80 px-2.5 py-1 text-[10px] font-semibold text-brand-400 backdrop-blur-md border border-surface-700/50">
          <Sparkles className="h-3 w-3 animate-pulse" />
          Live Remotion Preview
        </div>
      </div>
    </div>
  )
}
