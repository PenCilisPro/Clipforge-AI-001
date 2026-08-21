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
  const [originalVolume, setOriginalVolume] = useState<number>(config.originalVolume ?? 1)
  const [isOriginalMuted, setIsOriginalMuted] = useState(false)
  const [voiceVolume, setVoiceVolume] = useState<number>(config.voiceover?.volume ?? config.voiceVolume ?? 1)
  const [isVoiceMuted, setIsVoiceMuted] = useState(false)

  // Keep state in sync if parent config changes
  useEffect(() => {
    if (typeof config.originalVolume === 'number') {
      setOriginalVolume(config.originalVolume)
    }
    if (typeof config.voiceover?.volume === 'number') {
      setVoiceVolume(config.voiceover.volume)
    } else if (typeof config.voiceVolume === 'number') {
      setVoiceVolume(config.voiceVolume)
    }
  }, [config.originalVolume, config.voiceover?.volume, config.voiceVolume])

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
      volume: isVoiceMuted ? 0 : voiceVolume,
      onEnd: () => setIsSpeaking(false),
    })
  }, [scriptText, config.voiceover, actor, isVoiceMuted, voiceVolume])

  // Sync voice narration with player play/pause events
  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    const onPlay = () => {
      // If voiceover is enabled and no explicit voiceUrl mp3 is set in config, synthesize voice live alongside video audio
      if (config.voiceover?.enabled !== false && !config.voiceUrl && scriptText && !isVoiceMuted) {
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
  }, [config.voiceover, config.voiceUrl, scriptText, actor, isVoiceMuted, voiceVolume])

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
              originalVolume: isOriginalMuted ? 0 : originalVolume,
              voiceVolume: isVoiceMuted ? 0 : voiceVolume,
              voiceover: config.voiceover
                ? {
                    ...config.voiceover,
                    volume: isVoiceMuted ? 0 : voiceVolume,
                  }
                : undefined,
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
            <span>{isSpeaking ? 'Voice Speaking' : 'Voiceover Active'}</span>
          </div>
        )}
      </div>

      {/* Dual Audio Track Controls: Original Clip Audio + AI Voiceover */}
      <div className="mt-3 flex w-full max-w-[300px] flex-col gap-2.5 rounded-xl bg-surface-850 p-3 border border-surface-700/70 shadow-sm text-xs">
        {/* Track 1: Original Clip Audio */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsOriginalMuted(!isOriginalMuted)}
                className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-surface-750 hover:text-white"
                title={isOriginalMuted ? 'Unmute Original Clip Audio' : 'Mute Original Clip Audio'}
              >
                {isOriginalMuted ? (
                  <VolumeX className="h-3.5 w-3.5 text-red-400" />
                ) : originalVolume > 0.6 ? (
                  <Volume2 className="h-3.5 w-3.5 text-brand-400" />
                ) : (
                  <Volume1 className="h-3.5 w-3.5 text-zinc-300" />
                )}
              </button>
              <span className="text-[11px] font-semibold text-zinc-200">Original Clip Audio</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setOriginalVolume(1.0)
                  setIsOriginalMuted(false)
                }}
                className="rounded bg-surface-750 px-1.5 py-0.5 text-[9px] font-medium text-zinc-300 hover:bg-surface-700"
              >
                100%
              </button>
              <button
                type="button"
                onClick={() => {
                  setOriginalVolume(1.5)
                  setIsOriginalMuted(false)
                }}
                className="rounded bg-brand-500/20 px-1.5 py-0.5 text-[9px] font-medium text-brand-300 hover:bg-brand-500/30"
              >
                +50%
              </button>
              <span className="font-mono text-[10px] text-brand-400 w-9 text-right font-medium">
                {isOriginalMuted ? 'MUTED' : `${Math.round(originalVolume * 100)}%`}
              </span>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={2.0}
            step={0.05}
            value={isOriginalMuted ? 0 : originalVolume}
            onChange={(e) => {
              const val = Number(e.target.value)
              setOriginalVolume(val)
              if (isOriginalMuted && val > 0) setIsOriginalMuted(false)
            }}
            className="h-1.5 w-full cursor-pointer rounded-lg accent-brand-500"
          />
        </div>

        {/* Track 2: AI Voiceover Narration */}
        {config.voiceover?.enabled !== false && (
          <div className="space-y-1.5 pt-2 border-t border-surface-750/70">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsVoiceMuted(!isVoiceMuted)}
                  className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-surface-750 hover:text-white"
                  title={isVoiceMuted ? 'Unmute AI Voiceover' : 'Mute AI Voiceover'}
                >
                  {isVoiceMuted ? (
                    <VolumeX className="h-3.5 w-3.5 text-red-400" />
                  ) : (
                    <Mic className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                </button>
                <span className="text-[11px] font-semibold text-zinc-200">AI Voiceover</span>
              </div>

              <div className="flex items-center gap-1.5">
                {scriptText && (
                  <button
                    type="button"
                    onClick={handlePlayVoice}
                    className={`flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold transition-all ${
                      isSpeaking
                        ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                    }`}
                  >
                    {isSpeaking ? (
                      <>
                        <Square className="h-2.5 w-2.5 fill-red-400" /> Stop
                      </>
                    ) : (
                      <>
                        <Play className="h-2.5 w-2.5 fill-emerald-400" /> Test
                      </>
                    )}
                  </button>
                )}
                <span className="font-mono text-[10px] text-emerald-400 w-9 text-right font-medium">
                  {isVoiceMuted ? 'MUTED' : `${Math.round(voiceVolume * 100)}%`}
                </span>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={isVoiceMuted ? 0 : voiceVolume}
              onChange={(e) => {
                const val = Number(e.target.value)
                setVoiceVolume(val)
                if (isVoiceMuted && val > 0) setIsVoiceMuted(false)
              }}
              className="h-1.5 w-full cursor-pointer rounded-lg accent-emerald-500"
            />
          </div>
        )}
      </div>
    </div>
  )
}
