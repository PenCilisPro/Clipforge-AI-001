/**
 * Client-side Direct Video Exporter.
 * Renders the clip composition directly in the browser using HTML5 Canvas + Web Audio API + MediaRecorder.
 * Generates high-quality 9:16 vertical video with mixed audio tracks (source video audio, Jamendo music, AI voiceover)
 * and animated typography captions, producing a downloadable video file with real-time progress callbacks.
 */

import type { ClipConfiguration } from './types'

export interface RenderProgress {
  stage: string
  progress: number // 0 - 100
  currentFrame?: number
  totalFrames?: number
}

export async function renderClipInBrowser({
  config,
  onProgress,
}: {
  config: ClipConfiguration
  onProgress?: (p: RenderProgress) => void
}): Promise<{ videoBlob: Blob; downloadUrl: string }> {
  const fps = 30
  const width = 1080
  const height = 1920

  const startTime = Number(config.startTime) || 0
  const endTime = Number(config.endTime) || (startTime + 30)
  const durationSec = Math.max(1, endTime - startTime)
  const totalFrames = Math.round(durationSec * fps)

  onProgress?.({ stage: 'Initializing canvas & audio context…', progress: 5, totalFrames })

  // 1. Setup Canvas
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create 2D canvas context')

  // 2. Setup Web Audio & Mixers
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const audioCtx = new AudioCtx()
  const dest = audioCtx.createMediaStreamDestination()

  // Prepare source video element
  const videoEl = document.createElement('video')
  videoEl.crossOrigin = 'anonymous'
  videoEl.src = config.sourceVideo
  videoEl.muted = false
  videoEl.preload = 'auto'
  videoEl.currentTime = startTime

  // Wait for video metadata
  await new Promise<void>((resolve) => {
    videoEl.onloadedmetadata = () => resolve()
    videoEl.onerror = () => resolve() // Continue even if CORS prevents direct canvas draw
    setTimeout(resolve, 5000)
  })

  // Mix Source Video Audio if available
  try {
    const videoSourceNode = audioCtx.createMediaElementSource(videoEl)
    const videoGain = audioCtx.createGain()
    videoGain.gain.value = typeof config.originalVolume === 'number' ? config.originalVolume : 1.0
    videoSourceNode.connect(videoGain)
    videoGain.connect(dest)
  } catch (e) {
    console.warn('Could not connect video element audio source to mixer:', e)
  }

  // Mix Background Music Track if available
  let musicEl: HTMLAudioElement | null = null
  if (config.music?.audioUrl) {
    try {
      musicEl = document.createElement('audio')
      musicEl.crossOrigin = 'anonymous'
      musicEl.src = config.music.audioUrl
      musicEl.currentTime = config.music.trimStart || 0
      const musicSourceNode = audioCtx.createMediaElementSource(musicEl)
      const musicGain = audioCtx.createGain()
      const isVoiceActive = Boolean(config.voiceUrl) || config.voiceover?.enabled === true
      const duckMultiplier = isVoiceActive && config.voiceover?.duckMusic !== false ? 0.65 : 1.0
      musicGain.gain.value = (config.music.volume ?? 0.35) * duckMultiplier
      musicSourceNode.connect(musicGain)
      musicGain.connect(dest)
    } catch (e) {
      console.warn('Could not connect music track to mixer:', e)
    }
  }

  // Mix AI Voiceover if voiceUrl is available
  let voiceEl: HTMLAudioElement | null = null
  if (config.voiceUrl) {
    try {
      voiceEl = document.createElement('audio')
      voiceEl.crossOrigin = 'anonymous'
      voiceEl.src = config.voiceUrl
      const voiceSourceNode = audioCtx.createMediaElementSource(voiceEl)
      const voiceGain = audioCtx.createGain()
      voiceGain.gain.value = config.voiceover?.volume ?? config.voiceVolume ?? 1.0
      voiceSourceNode.connect(voiceGain)
      voiceGain.connect(dest)
    } catch (e) {
      console.warn('Could not connect voiceover track to mixer:', e)
    }
  }

  // 3. Setup MediaRecorder with combined Canvas Video Stream + Mixed Audio Stream
  const canvasStream = canvas.captureStream(fps)
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ])

  // Select optimal mimeType
  const mimeTypes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]
  const supportedMime = mimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) || 'video/webm'

  const mediaRecorder = new MediaRecorder(combinedStream, {
    mimeType: supportedMime,
    videoBitsPerSecond: 8_000_000, // 8 Mbps high quality
  })

  const chunks: Blob[] = []
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data)
    }
  }

  // 4. Start recording and render frame-by-frame
  mediaRecorder.start(200)

  // Start audio sources
  try {
    videoEl.currentTime = startTime
    void videoEl.play().catch(() => {})
    if (musicEl) void musicEl.play().catch(() => {})
    if (voiceEl) void voiceEl.play().catch(() => {})
  } catch (e) {
    console.warn('Audio playback start warning:', e)
  }

  const words = config.captions?.enabled ? config.captions.words || [] : []
  const font = config.captions?.style?.font || 'Impact'
  const primaryColor = config.captions?.style?.textColor || '#FFFFFF'
  const highlightColor = config.captions?.style?.highlightColor || '#FFE600'
  const fontSize = config.captions?.style?.fontSize || 68
  const posKey = config.captions?.style?.position || 'bottom'
  const positionY = posKey === 'top' ? 25 : posKey === 'center' ? 50 : 75

  // Frame rendering loop
  for (let f = 0; f < totalFrames; f++) {
    const currentTimeInClip = f / fps

    // Background color
    ctx.fillStyle = '#0a0a0f'
    ctx.fillRect(0, 0, width, height)

    // Draw video frame if accessible
    try {
      if (videoEl.readyState >= 2) {
        // Draw video scaled to fill 9:16 vertical canvas (cover)
        const vW = videoEl.videoWidth || 1920
        const vH = videoEl.videoHeight || 1080
        const scale = Math.max(width / vW, height / vH)
        const dW = vW * scale
        const dH = vH * scale
        const dX = (width - dW) / 2
        const dY = (height - dH) / 2
        ctx.drawImage(videoEl, dX, dY, dW, dH)
      }
    } catch {
      // Fallback gradient if CORS restriction on canvas drawImage
      const grad = ctx.createLinearGradient(0, 0, 0, height)
      grad.addColorStop(0, '#13111C')
      grad.addColorStop(1, '#08070B')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, width, height)
    }

    // Render Captions
    if (words.length > 0) {
      // Find active words in a 3-5 word window
      const activeIdx = words.findIndex(
        (w) => currentTimeInClip >= w.start && currentTimeInClip <= w.end,
      )

      if (activeIdx !== -1) {
        const windowSize = 3
        const startIdx = Math.max(0, activeIdx - Math.floor(windowSize / 2))
        const endIdx = Math.min(words.length, startIdx + windowSize)
        const currentSlice = words.slice(startIdx, endIdx)

        ctx.save()
        ctx.font = `900 ${fontSize}px "${font}", sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        const textY = (height * positionY) / 100
        const fullPhrase = currentSlice.map((w) => w.text.toUpperCase()).join(' ')

        // Measure layout
        const totalTextWidth = ctx.measureText(fullPhrase).width
        let currentX = width / 2 - totalTextWidth / 2

        currentSlice.forEach((w) => {
          const rawWord = w.text.toUpperCase()
          const wordText = rawWord + ' '
          const wordWidth = ctx.measureText(wordText).width
          const isHighlighted = currentTimeInClip >= w.start && currentTimeInClip <= w.end

          // Text shadow / outline for viral readability
          ctx.lineJoin = 'round'
          ctx.lineWidth = 14
          ctx.strokeStyle = '#000000'
          ctx.strokeText(wordText, currentX + wordWidth / 2, textY)

          // Fill text
          ctx.fillStyle = isHighlighted ? highlightColor : primaryColor
          ctx.fillText(wordText, currentX + wordWidth / 2, textY)

          currentX += wordWidth
        })

        ctx.restore()
      }
    }

    // Update progress
    const pct = Math.min(95, Math.round(10 + (f / totalFrames) * 85))
    if (f % 15 === 0) {
      onProgress?.({
        stage: `Encoding vertical reel frame ${f + 1}/${totalFrames}…`,
        progress: pct,
        currentFrame: f + 1,
        totalFrames,
      })
      // Yield to browser event loop
      await new Promise((r) => setTimeout(r, 2))
    }
  }

  // 5. Complete Recording
  onProgress?.({ stage: 'Finalizing high-definition video container…', progress: 98, totalFrames })

  // Stop media elements
  try {
    videoEl.pause()
    if (musicEl) musicEl.pause()
    if (voiceEl) voiceEl.pause()
    await audioCtx.close()
  } catch (e) {
    console.warn('Audio cleanup warning:', e)
  }

  const finishedBlob = await new Promise<Blob>((resolve) => {
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: supportedMime })
      resolve(blob)
    }
    mediaRecorder.stop()
  })

  const downloadUrl = URL.createObjectURL(finishedBlob)
  onProgress?.({ stage: 'Render completed successfully!', progress: 100, totalFrames })

  return { videoBlob: finishedBlob, downloadUrl }
}
