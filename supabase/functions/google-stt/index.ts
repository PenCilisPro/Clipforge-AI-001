// Google Cloud Speech-to-Text proxy for browser-side caption generation.
//
// The browser cannot call speech.googleapis.com directly (no CORS) and must
// never hold provider credentials, so it uploads a base64 mono LINEAR16 WAV
// slice here; this function forwards it to Google STT with the server-side
// GOOGLE_STT_API_KEY and returns word-level timestamps. Mirrors the logic of
// renderer/googleStt.ts so both paths stay in sync.

import { corsHeaders, jsonResponse, errorResponse, requireUser } from '../_shared/utils.ts'

// Google's synchronous speech:recognize endpoint is limited to ~60s of audio.
// Longer clips need the async longrunningrecognize flow.
const SYNC_LIMIT_SEC = 55
const POLL_INTERVAL_MS = 2000
const POLL_MAX_ATTEMPTS = 45

const MAX_AUDIO_BASE64_LENGTH = 25 * 1024 * 1024 // ~18MB of raw WAV

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseOffset(offset: any): number {
  if (typeof offset === 'number') {
    return offset
  }

  if (typeof offset === 'string') {
    return parseFloat(offset.replace(/s$/, '')) || 0
  }

  // v1 REST also allows {seconds, nanos} objects.
  const seconds = Number(offset?.seconds || 0)
  const nanos = Number(offset?.nanos || 0)

  return seconds + nanos / 1e9
}

function parseResponse(data: any): { words: Array<{ text: string; start: number; end: number }>; text: string } {
  const results = Array.isArray(data?.results) ? data.results : []

  const words: Array<{ text: string; start: number; end: number }> = []
  const textParts: string[] = []

  for (const result of results) {
    const alternative = result?.alternatives?.[0]

    if (!alternative) {
      continue
    }

    if (alternative.transcript) {
      textParts.push(alternative.transcript)
    }

    for (const word of alternative.words ?? []) {
      words.push({
        text: String(word.word || '').trim(),
        start: Number(parseOffset(word.startTime).toFixed(2)),
        end: Number(parseOffset(word.endTime).toFixed(2)),
      })
    }
  }

  return { words, text: textParts.join(' ').trim() }
}

async function transcribe(
  audioBase64: string,
  durationSec: number,
  sampleRateHertz: number,
  languageCode: string,
  apiKey: string,
): Promise<{ words: Array<{ text: string; start: number; end: number }>; text: string }> {
  const config = {
    encoding: 'LINEAR16',
    sampleRateHertz,
    languageCode,
    enableWordTimeOffsets: true,
    enableAutomaticPunctuation: true,
  }

  if (durationSec <= SYNC_LIMIT_SEC) {
    const response = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config, audio: { content: audioBase64 } }),
    })

    if (!response.ok) {
      throw new Error(`speech:recognize returned ${response.status}: ${await response.text()}`)
    }

    return parseResponse(await response.json())
  }

  const startResponse = await fetch(
    `https://speech.googleapis.com/v1/speech:longrunningrecognize?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config, audio: { content: audioBase64 } }),
    },
  )

  if (!startResponse.ok) {
    throw new Error(`speech:longrunningrecognize returned ${startResponse.status}: ${await startResponse.text()}`)
  }

  const startData = (await startResponse.json()) as any
  const operationName = startData.name

  if (!operationName) {
    throw new Error('long-running op had no operation name.')
  }

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS)

    const pollResponse = await fetch(
      `https://speech.googleapis.com/v1/operations/${operationName}?key=${apiKey}`,
    )

    if (!pollResponse.ok) {
      continue
    }

    const pollData = (await pollResponse.json()) as any

    if (pollData.done) {
      if (pollData.error) {
        throw new Error(`long-running op failed: ${JSON.stringify(pollData.error)}`)
      }

      return parseResponse(pollData.response)
    }
  }

  throw new Error('long-running op timed out waiting for completion.')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    await requireUser(req)
  } catch {
    return errorResponse('Unauthorized', 401)
  }

  const apiKey = Deno.env.get('GOOGLE_STT_API_KEY')
  if (!apiKey) {
    return errorResponse('GOOGLE_STT_API_KEY is not configured for this project.', 500)
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body.', 400)
  }

  const audioBase64 = String(body?.audioBase64 || '').replace(/\s/g, '')
  if (!audioBase64) {
    return errorResponse('audioBase64 is required (base64-encoded mono LINEAR16 WAV).', 400)
  }
  if (audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
    return errorResponse('Audio payload too large. Slice the clip to a shorter interval.', 413)
  }

  const durationSec = Number(body?.durationSec) > 0 ? Number(body.durationSec) : 0
  const sampleRateHertz = Number(body?.sampleRateHertz) > 0 ? Number(body.sampleRateHertz) : 16000
  const languageCode =
    typeof body?.languageCode === 'string' && body.languageCode.trim() ? body.languageCode.trim() : 'en-US'

  if (!durationSec) {
    return errorResponse('durationSec is required to choose the sync vs long-running API.', 400)
  }

  try {
    const result = await transcribe(audioBase64, durationSec, sampleRateHertz, languageCode, apiKey)
    return jsonResponse(result)
  } catch (error) {
    console.error('[google-stt] transcription failed:', error instanceof Error ? error.message : String(error))
    return errorResponse(
      `Google Speech-to-Text transcription failed: ${error instanceof Error ? error.message : String(error)}`,
      502,
    )
  }
})
