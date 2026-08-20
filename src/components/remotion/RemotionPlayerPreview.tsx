import React, { useRef, useState, useEffect, useCallback } from 'react'
import { Player, type PlayerRef } from '@remotion/player'
import { ClipComposition } from './ClipComposition'
import type { ClipConfiguration } from '@/lib/types'
import { LiveVoiceSynthesizer, VOICE_ACTORS } from '@/lib/voiceSynthesis'
import {
  Sparkles,
  Volume2,
  VolumeX,
  Mic,
  Play,
  Square,
  Volume1,
} from 'lucide-react'

interface RemotionPlayerPreviewProps {
  config: ClipConfiguration
  className?: string
  autoPlayVoice?: boolean
}

export const RemotionPlayerPreview: React.FC<RemotionPlayerPreviewProps> = ({
  config,
  className = '',
}) => {
  const playerRef = useRef<PlayerRef>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [voiceVolume, setVoiceVolume] = useState<number>(config.voiceVolume ?? 1)
  const [isMuted, setIsMuted] = useState(false)

  const startTime = Number(config?.startTime) || 0
  const endTime = Number(config?.endTime) || (startTime + 30)
  const durationSec = Math.max(1, endTime - startTime)
  const durationInFrames = Math.max(30, Math.round(durationSec * 30))

  // Extract speech text from captions or hook
  const scriptText = React.useMemo(() => {
    if (config?.captions?.words && config.captions.words.length > 0) {
      return config.captions.words.map((w) => w.text).join(' ')
    }
    return ''
  }, [config?.captions?.words])

  const actor = React.useMemo(() => {
    const vId = config.voiceover?.voiceId || 'alex-viral'
    return VOICE_ACTORS.find((a) => a.id === vId) || VOICE_ACTORS[0]
  }, [config.voiceover?.voiceId])

  // Play voice narration synchronized with playback
  const handlePlayVoice = useCallback(() => {
    if (!scriptText) return

    if (LiveVoiceSynthesizer.speaking) {
      LiveVoiceSynthesizer.stop()
      setIsSpeaking(false)
      return
    }

    setIsSpeaking(true)
    LiveVoiceSynthesizer.speak(scriptText, {
      voiceId: config.voiceover?.voiceId || 'alex-viral',
      rate: config.voiceover?.rate || actor.rate,
      pitch: config.voiceover?.pitch || actor.pitch,
      volume: isMuted ? 0 : voiceVolume,
      onEnd: () => setIsSpeaking(false),
    })
  }, [scriptText, config.voiceover, actor, isMuted, voiceVolume])

  // Sync voice narration with player play/pause events
  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    const onPlay = () => {
      // If voiceover is enabled and no explicit voiceUrl mp3 is set in config, synthesize voice live!
      if (config.voiceover?.enabled !== false && !config.voiceUrl && scriptText && !isMuted) {
        setIsSpeaking(true)
        LiveVoiceSynthesizer.speak(scriptText, {
          voiceId: config.voiceover?.voiceId || 'alex-viral',
          rate: config.voiceover?.rate || actor.rate,
          pitch: config.voiceover?.pitch || actor.pitch,
          volume: voiceVolume,
          onEnd: () => setIsSpeaking(false),
        })
      }
    }

    const onPause = () => {
      LiveVoiceSynthesizer.stop()
      setIsSpeaking(false)
    }

    player.addEventListener('play', onPlay)
    player.addEventListener('pause', onPause)
    player.addEventListener('seeked', onPause)

    return () => {
      player.removeEventListener('play', onPlay)
      player.removeEventListener('pause', onPause)
      player.removeEventListener('seeked', onPause)
      LiveVoiceSynthesizer.stop()
    }
  }, [config.voiceover, config.voiceUrl, scriptText, actor, isMuted, voiceVolume])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      LiveVoiceSynthesizer.stop()
    }
  }, [])

  return (
    <div className={`flex flex-col items-center w-full ${className}`}>
      <div className="relative aspect-[9/16] w-full max-w-[300px] overflow-hidden rounded-xl border border-surface-750 bg-black shadow-2xl">
        <Player
          ref={playerRef}
          component={ClipComposition}
          inputProps={{
            config: {
              ...config,
              voiceVolume: isMuted ? 0 : voiceVolume,
            },
          }}
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
          initialVolume={1}
        />

        {/* Live Remotion Badge */}
        <div className="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-full bg-surface-900/85 px-2.5 py-1 text-[10px] font-semibold text-brand-400 backdrop-blur-md border border-surface-700/50">
          <Sparkles className="h-3 w-3 animate-pulse" />
          Live Remotion Preview
        </div>

        {/* Active Voice Indicator Pill */}
        {config.voiceover?.enabled !== false && (
          <div className="pointer-events-none absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-full bg-emerald-950/80 px-2 py-0.5 text-[9px] font-semibold text-emerald-300 backdrop-blur-md border border-emerald-500/30">
            <Mic className={`h-2.5 w-2.5 ${isSpeaking ? 'animate-bounce text-emerald-400' : ''}`} />
            <span>{isSpeaking ? 'Voice Speaking' : 'AI Voice Ready'}</span>
          </div>
        )}
      </div>

      {/* Interactive Sound & Voice Quick Bar */}
      <div className="mt-3 flex w-full max-w-[300px] flex-col gap-2 rounded-xl bg-surface-850 p-2.5 border border-surface-700/70 shadow-sm text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-surface-750 hover:text-white"
              title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4 text-red-400" />
              ) : voiceVolume > 0.6 ? (
                <Volume2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <Volume1 className="h-4 w-4 text-zinc-300" />
              )}
            </button>
            <span className="text-[11px] font-medium text-zinc-300 truncate">
              {isMuted ? 'Muted' : `Voice: ${Math.round(voiceVolume * 100)}%`}
            </span>
          </div>

          {/* Quick Voice Play / Stop Test Button */}
          {scriptText && (
            <button
              type="button"
              onClick={handlePlayVoice}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all shadow-sm ${
                isSpeaking
                  ? 'bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30'
                  : 'bg-brand-500/20 text-brand-300 border border-brand-500/40 hover:bg-brand-500/30'
              }`}
            >
              {isSpeaking ? (
                <>
                  <Square className="h-3 w-3 fill-red-400" /> Stop Voice
                </>
              ) : (
                <>
                  <Play className="h-3 w-3 fill-brand-400" /> Test Voice
                </>
              )}
            </button>
          )}
        </div>

        {/* Volume Boost Slider */}
        <div className="flex items-center gap-2 pt-1 border-t border-surface-750/60">
          <span className="text-[10px] text-zinc-400">Volume</span>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.05}
            value={isMuted ? 0 : voiceVolume}
            onChange={(e) => {
              const val = Number(e.target.value)
              setVoiceVolume(val)
              if (isMuted && val > 0) setIsMuted(false)
            }}
            className="h-1.5 w-full cursor-pointer rounded-lg accent-brand-500"
          />
          <span className="font-mono text-[10px] text-zinc-400">
            {Math.round((isMuted ? 0 : voiceVolume) * 100)}%
          </span>
        </div>
      </div>
    </div>
  )
}
