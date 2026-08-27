import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Mic, Music, Play, Square, Type, Volume1, Volume2, VolumeX } from 'lucide-react'
import type { ClipConfiguration } from '@/lib/types'
import { LiveVoiceSynthesizer, VOICE_ACTORS } from '@/lib/voiceSynthesis'

type PreviewProps = {
  config: ClipConfiguration
  className?: string
  autoPlayVoice?: boolean
  onAddCaptions?: () => void
  isGeneratingCaptions?: boolean
  onUpdateConfig?: (partial: Partial<ClipConfiguration>) => void
}

export const RemotionPlayerPreview: React.FC<PreviewProps> = ({ config, className = '', onAddCaptions, isGeneratingCaptions = false, onUpdateConfig }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [originalVolume, setOriginalVolume] = useState(config.originalVolume ?? 1)
  const [isOriginalMuted, setIsOriginalMuted] = useState(false)
  const [voiceVolume, setVoiceVolume] = useState(config.voiceover?.volume ?? config.voiceVolume ?? 1)
  const [isVoiceMuted, setIsVoiceMuted] = useState(false)
  const scriptText = useMemo(() => config.captions?.words?.map((w) => w.text).join(' ') ?? '', [config.captions?.words])
  const actor = useMemo(() => VOICE_ACTORS.find((v) => v.id === (config.voiceover?.voiceId || 'alex-viral')) || VOICE_ACTORS[0], [config.voiceover?.voiceId])

  useEffect(() => () => LiveVoiceSynthesizer.stop(), [])

  const speak = () => {
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
  }

  const source = typeof config.sourceVideo === 'string' ? config.sourceVideo : ''
  const start = Number(config.startTime) || 0
  const end = Number(config.endTime) || 0

  return (
    <div className={`flex flex-col items-center w-full ${className}`}>
      <div className="relative aspect-[9/16] w-full max-w-[300px] overflow-hidden rounded-xl border border-surface-750 bg-black shadow-2xl">
        {source ? (
          <video ref={videoRef} src={source} controls playsInline preload="metadata" className="h-full w-full object-cover"
            onLoadedMetadata={() => { if (start > 0 && videoRef.current) videoRef.current.currentTime = start }}
            onTimeUpdate={() => { if (end > start && videoRef.current && videoRef.current.currentTime >= end) videoRef.current.pause() }} />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-zinc-500">No source video available yet.</div>
        )}
        <div className="pointer-events-none absolute top-3 left-3 rounded-full bg-black/75 px-2.5 py-1 text-[10px] font-semibold text-zinc-200">Video Preview</div>
        {config.music?.audioUrl && <div className="pointer-events-none absolute top-11 left-3 flex items-center gap-1 rounded-full bg-black/75 px-2 py-0.5 text-[9px] text-zinc-200"><Music className="h-2.5 w-2.5" />{config.music.title || 'Soundtrack'}</div>}
      </div>

      {onAddCaptions && <div className="mt-2.5 w-full max-w-[300px]"><button type="button" onClick={onAddCaptions} disabled={isGeneratingCaptions} className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{isGeneratingCaptions ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Type className="h-3.5 w-3.5" />}{isGeneratingCaptions ? 'Generating captions...' : 'Add Captions'}</button></div>}

      <div className="mt-2.5 w-full max-w-[300px] rounded-xl border border-surface-700/70 bg-surface-850 p-3 text-xs">
        <div className="flex items-center justify-between"><div className="flex items-center gap-1.5"><button type="button" onClick={() => { const muted = !isOriginalMuted; setIsOriginalMuted(muted); onUpdateConfig?.({ originalVolume: muted ? 0 : originalVolume }) }} className="rounded-md p-1 text-zinc-400 hover:text-white">{isOriginalMuted ? <VolumeX className="h-3.5 w-3.5" /> : originalVolume > 0.6 ? <Volume2 className="h-3.5 w-3.5" /> : <Volume1 className="h-3.5 w-3.5" />}</button><span className="font-semibold text-zinc-200">Original Audio</span></div><span className="font-mono text-[10px] text-zinc-400">{Math.round((isOriginalMuted ? 0 : originalVolume) * 100)}%</span></div>
        <input type="range" min={0} max={2} step={0.05} value={isOriginalMuted ? 0 : originalVolume} onChange={(e) => { const value = Number(e.target.value); setOriginalVolume(value); setIsOriginalMuted(false); onUpdateConfig?.({ originalVolume: value }) }} className="mt-1.5 h-1.5 w-full" />
        {config.voiceover?.enabled !== false && <div className="mt-3 border-t border-surface-750 pt-3"><div className="flex items-center justify-between"><div className="flex items-center gap-1.5"><button type="button" onClick={() => setIsVoiceMuted((v) => !v)} className="rounded-md p-1 text-zinc-400 hover:text-white">{isVoiceMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}</button><span className="font-semibold text-zinc-200">AI Voiceover</span></div>{scriptText && <button type="button" onClick={speak} className="flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-300">{isSpeaking ? <Square className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}{isSpeaking ? 'Stop' : 'Test'}</button>}</div><input type="range" min={0} max={1.5} step={0.05} value={isVoiceMuted ? 0 : voiceVolume} onChange={(e) => setVoiceVolume(Number(e.target.value))} className="mt-1.5 h-1.5 w-full" /></div>}
      </div>
    </div>
  )
}
