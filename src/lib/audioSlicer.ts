/**
 * Audio Slicer & WAV Encoder utility.
 * Slices an exact time range [startTime, startTime + duration] from an audio/video URL
 * in the browser using Web Audio API and encodes to a WAV File suitable for OpenAI Whisper.
 */

export async function sliceAudioFromUrl(
  mediaUrl: string,
  startTime: number,
  duration: number,
): Promise<File | null> {
  try {
    if (!mediaUrl || typeof window === 'undefined') return null

    // 1. Fetch the media file bytes
    const response = await fetch(mediaUrl, { mode: 'cors' })
    if (!response.ok) {
      console.warn('Could not fetch media for audio slicing:', response.statusText)
      return null
    }

    const arrayBuffer = await response.arrayBuffer()
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtxClass) return null

    const audioCtx = new AudioCtxClass()
    const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer)

    const sampleRate = decodedBuffer.sampleRate
    const startSample = Math.max(0, Math.floor(startTime * sampleRate))
    const totalSamples = Math.max(sampleRate, Math.floor(duration * sampleRate))
    const endSample = Math.min(decodedBuffer.length, startSample + totalSamples)
    const sliceLength = Math.max(1, endSample - startSample)

    // Create sliced buffer (single channel mono is best for Whisper and lightweight)
    const monoBuffer = audioCtx.createBuffer(1, sliceLength, sampleRate)
    const channelData = monoBuffer.getChannelData(0)

    const sourceChannel0 = decodedBuffer.getChannelData(0)
    const hasChannel1 = decodedBuffer.numberOfChannels > 1
    const sourceChannel1 = hasChannel1 ? decodedBuffer.getChannelData(1) : null

    for (let i = 0; i < sliceLength; i++) {
      const srcIdx = startSample + i
      if (srcIdx < decodedBuffer.length) {
        if (sourceChannel1) {
          channelData[i] = (sourceChannel0[srcIdx] + sourceChannel1[srcIdx]) * 0.5
        } else {
          channelData[i] = sourceChannel0[srcIdx]
        }
      }
    }

    await audioCtx.close()

    // 2. Encode to 16-bit PCM WAV Blob
    const wavBlob = audioBufferToWav(monoBuffer)
    return new File([wavBlob], `clip-slice-${Math.round(startTime)}-${Math.round(duration)}s.wav`, {
      type: 'audio/wav',
    })
  } catch (err) {
    console.warn('Audio slicing via Web Audio failed, fallback will be used:', err)
    return null
  }
}

/**
 * Converts an AudioBuffer into a standard 16-bit PCM WAV Blob.
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels
  const length = buffer.length * numOfChan * 2 + 44
  const outBuffer = new ArrayBuffer(length)
  const view = new DataView(outBuffer)
  const channels: Float32Array[] = []
  const sampleRate = buffer.sampleRate
  let offset = 0
  let pos = 0

  function setUint16(data: number) {
    view.setUint16(pos, data, true)
    pos += 2
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true)
    pos += 4
  }

  // RIFF identifier
  setUint32(0x46464952) // "RIFF"
  setUint32(length - 8) // file length - 8
  setUint32(0x45564157) // "WAVE"

  // fmt sub-chunk
  setUint32(0x20746d66) // "fmt " chunk
  setUint32(16) // Subchunk1Size (16 for PCM)
  setUint16(1) // AudioFormat (1 for PCM)
  setUint16(numOfChan) // NumChannels
  setUint32(sampleRate) // SampleRate
  setUint32(sampleRate * 2 * numOfChan) // ByteRate
  setUint16(numOfChan * 2) // BlockAlign
  setUint16(16) // BitsPerSample (16 bits)

  // data sub-chunk
  setUint32(0x61746164) // "data" chunk
  setUint32(length - pos - 4) // Subchunk2Size

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i))
  }

  while (offset < buffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]))
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0
      view.setInt16(pos, sample, true)
      pos += 2
    }
    offset++
  }

  return new Blob([outBuffer], { type: 'audio/wav' })
}
