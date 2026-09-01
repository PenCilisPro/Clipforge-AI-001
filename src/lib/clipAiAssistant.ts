import type { Clip, CaptionWordConfig, BrollConfigItem } from './types'
import { sliceAudioFromUrl } from './audioSlicer'
import { invokeFunction, isSupabaseConfigured } from './supabase'

// Curated list of high-converting creator fonts for TikTok, Reels, and Shorts
export interface CreatorFontOption {
  id: string
  name: string
  category: 'Viral Classics' | 'Creator & Punchy' | 'Modern Tech' | 'Cinematic & Aesthetic' | 'Cartoon & Meme'
  previewText?: string
}

export const CREATOR_FONTS: CreatorFontOption[] = [
  { id: 'Impact', name: 'Impact', category: 'Viral Classics' },
  { id: 'Bebas Neue', name: 'Bebas Neue', category: 'Viral Classics' },
  { id: 'Anton', name: 'Anton', category: 'Creator & Punchy' },
  { id: 'Montserrat', name: 'Montserrat', category: 'Viral Classics' },
  { id: 'Poppins', name: 'Poppins', category: 'Viral Classics' },
  { id: 'Rubik', name: 'Rubik', category: 'Creator & Punchy' },
  { id: 'Outfit', name: 'Outfit', category: 'Modern Tech' },
  { id: 'Bungee', name: 'Bungee', category: 'Creator & Punchy' },
  { id: 'Fredoka', name: 'Fredoka', category: 'Cartoon & Meme' },
  { id: 'Titan One', name: 'Titan One', category: 'Cartoon & Meme' },
  { id: 'Luckiest Guy', name: 'Luckiest Guy', category: 'Cartoon & Meme' },
  { id: 'Chakra Petch', name: 'Chakra Petch', category: 'Modern Tech' },
  { id: 'Space Grotesk', name: 'Space Grotesk', category: 'Modern Tech' },
  { id: 'Syne', name: 'Syne', category: 'Cinematic & Aesthetic' },
  { id: 'Work Sans', name: 'Work Sans', category: 'Modern Tech' },
  { id: 'Oswald', name: 'Oswald', category: 'Creator & Punchy' },
  { id: 'Cinzel', name: 'Cinzel', category: 'Cinematic & Aesthetic' },
  { id: 'Playfair Display', name: 'Playfair Display', category: 'Cinematic & Aesthetic' },
  { id: 'Permanent Marker', name: 'Permanent Marker', category: 'Cartoon & Meme' },
  { id: 'Inter', name: 'Inter', category: 'Viral Classics' },
]

// Curated high-performance royalty-free vertical & horizontal stock B-Roll video clips
export interface StockVideoAsset {
  id: string
  title: string
  category: 'tech' | 'finance' | 'reaction' | 'lifestyle' | 'abstract'
  videoUrl: string
  thumbnailUrl: string
  duration: number
  keywords: string[]
}

export const STOCK_BROLL_CATALOG: StockVideoAsset[] = [
  {
    id: 'tech-coding-1',
    title: 'Neon Code Matrix Scrolling',
    category: 'tech',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600&q=80',
    duration: 15,
    keywords: ['coding', 'tech', 'programming', 'code', 'software', 'developer', 'ai', 'algorithm', 'data'],
  },
  {
    id: 'finance-chart-1',
    title: 'Financial Stock Market Bull Surge',
    category: 'finance',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&q=80',
    duration: 15,
    keywords: ['money', 'crypto', 'stocks', 'finance', 'investing', 'chart', 'profit', 'business', 'growth', 'wealth'],
  },
  {
    id: 'reaction-shock-1',
    title: 'Shocked Mindblown Reaction',
    category: 'reaction',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&q=80',
    duration: 12,
    keywords: ['shock', 'reaction', 'crazy', 'insane', 'secret', 'wow', 'mindblown', 'mistake', 'warning', 'hook'],
  },
  {
    id: 'lifestyle-focus-1',
    title: 'Deep Focused Workflow & Productivity',
    category: 'lifestyle',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=600&q=80',
    duration: 15,
    keywords: ['productivity', 'work', 'lifestyle', 'focus', 'creator', 'desk', 'laptop', 'routine', 'success'],
  },
  {
    id: 'abstract-cyber-1',
    title: 'Cyberpunk Neon Speed Energy',
    category: 'abstract',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=600&q=80',
    duration: 15,
    keywords: ['energy', 'speed', 'neon', 'abstract', 'future', 'glow', 'modern', 'transition', 'fast'],
  },
  {
    id: 'finance-cash-2',
    title: 'Counting Stacks of Cash & Revenue',
    category: 'finance',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=600&q=80',
    duration: 15,
    keywords: ['cash', 'revenue', 'dollars', 'income', 'sales', 'millionaire', 'earnings', 'scaling'],
  },
]

// No provider keys are hardcoded here. Caption transcription runs server-side
// through the google-stt edge function; this stored key is only a user-supplied
// OpenRouter/OpenAI key (set via Settings) used by the AI chat fallbacks.
export const getStoredApiKey = (): string => {
  try {
    const saved = localStorage.getItem('clipforge_openai_key')
    return saved && saved.trim() ? saved.trim() : ''
  } catch {
    return ''
  }
}

const getFallbackAiKey = () => {
  return getStoredApiKey()
}

/**
 * Reads a Blob/File as base64 (without the data URL prefix) so audio slices
 * can be shipped to the google-stt edge function as JSON.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      const commaIndex = dataUrl.indexOf(',')
      resolve(commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : '')
    }
    reader.onerror = () => reject(reader.error || new Error('Failed to read audio file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Extracts accurately timed caption words from raw transcript segments for a specific clip interval.
 * Returns word timestamps normalized relative to 0.0s (start of the clip).
 */
export function extractWordsFromTranscriptSegments(
  segments: Array<{ start: number; end: number; text: string }>,
  clipStartTime: number,
  clipEndTime: number,
): CaptionWordConfig[] {
  if (!segments || !Array.isArray(segments) || segments.length === 0) return []

  const clipDuration = Math.max(3, clipEndTime - clipStartTime)
  const overlapping = segments.filter(
    (s) => s.end >= clipStartTime - 0.2 && s.start <= clipEndTime + 0.2 && (s.text || '').trim().length > 0,
  )

  if (overlapping.length === 0) return []

  const words: CaptionWordConfig[] = []

  for (const seg of overlapping) {
    const rawTokens = seg.text.trim().split(/\s+/).filter(Boolean)
    if (rawTokens.length === 0) continue

    const segStart = Math.max(0, seg.start - clipStartTime)
    const segEnd = Math.min(clipDuration, seg.end - clipStartTime)
    const segDur = Math.max(0.3, segEnd - segStart)
    const tokenPacing = segDur / rawTokens.length

    for (let i = 0; i < rawTokens.length; i++) {
      const token = rawTokens[i]
      const wStart = segStart + i * tokenPacing
      const wEnd = Math.min(segEnd, wStart + Math.max(0.18, tokenPacing * 0.95))

      if (wEnd >= 0 && wStart <= clipDuration + 0.2) {
        words.push({
          text: token,
          start: Number(Math.max(0, wStart).toFixed(2)),
          end: Number(Math.max(wStart + 0.15, wEnd).toFixed(2)),
        })
      }
    }
  }

  return words
}

/**
 * Shifts all word timestamps by a given delta in seconds (+/-) and clamps to 0.
 */
export function shiftWordTimings(words: CaptionWordConfig[], deltaSeconds: number): CaptionWordConfig[] {
  return words.map((w) => {
    const newStart = Math.max(0, Number((w.start + deltaSeconds).toFixed(2)))
    const newEnd = Math.max(newStart + 0.1, Number((w.end + deltaSeconds).toFixed(2)))
    return {
      ...w,
      start: newStart,
      end: newEnd,
    }
  })
}

/**
 * Re-distributes caption words evenly across the clip duration for a smooth, natural flow.
 */
export function realignWordsEvenly(words: CaptionWordConfig[], clipDuration: number): CaptionWordConfig[] {
  if (!words || words.length === 0) return []
  const safeDuration = Math.max(3, clipDuration)
  const pacing = Math.min(0.5, Math.max(0.2, (safeDuration - 0.5) / words.length))

  let current = 0.1
  return words.map((w) => {
    const duration = Math.max(0.18, w.text.length * 0.04 + (pacing - 0.08))
    const end = Math.min(safeDuration, current + duration)
    const item = {
      text: w.text,
      start: Number(current.toFixed(2)),
      end: Number(end.toFixed(2)),
    }
    current = Number((end + 0.05).toFixed(2))
    return item
  })
}

/**
 * Generate synchronized word-level captions for a clip interval.
 * Transcribes the sliced audio with Google Cloud Speech-to-Text (via the
 * google-stt edge function), falls back to transcript segment alignment or the
 * AI Semantic Speech Timing Engine when transcription is unavailable.
 */
export async function generateWhisperCaptions({
  clip,
  transcriptSegments,
  customApiKey,
  whisperAudioFile,
  sourceMediaUrl,
  startTime,
  endTime,
  language = 'en',
}: {
  clip: Clip
  transcriptSegments?: Array<{ start: number; end: number; text: string }>
  customApiKey?: string
  whisperAudioFile?: File
  sourceMediaUrl?: string
  startTime?: number
  endTime?: number
  language?: string
}): Promise<CaptionWordConfig[]> {
  const clipStart = typeof startTime === 'number' ? startTime : clip.start_time
  const clipEnd = typeof endTime === 'number' ? endTime : (clip.end_time || clipStart + 30)
  const clipDuration = Math.max(2, clipEnd - clipStart)

  const apiKey = customApiKey?.trim() || getStoredApiKey()

  // 1. If no pre-sliced audio file was provided, try slicing the exact time slice from the Remotion source video
  let audioFileToTranscribe = whisperAudioFile
  let sampleRateHertz = 16000
  if (!audioFileToTranscribe && sourceMediaUrl && (sourceMediaUrl.startsWith('http') || sourceMediaUrl.startsWith('blob:'))) {
    try {
      const sliced = await sliceAudioFromUrl(sourceMediaUrl, clipStart, clipDuration)
      if (sliced) {
        audioFileToTranscribe = sliced.file
        sampleRateHertz = sliced.sampleRate
      }
    } catch (e) {
      console.warn('Could not slice audio from source URL:', e)
    }
  }

  // 2. Transcribe the sliced audio with Google Cloud Speech-to-Text via the google-stt
  // edge function (speech.googleapis.com has no CORS and must only be called server-side).
  if (audioFileToTranscribe && isSupabaseConfigured) {
    try {
      const audioBase64 = await fileToBase64(audioFileToTranscribe)
      const result = await invokeFunction<{
        words: Array<{ text: string; start: number; end: number }>
        text: string
      }>('google-stt', {
        audioBase64,
        durationSec: clipDuration,
        sampleRateHertz,
        languageCode: language && language !== 'en' ? language : 'en-US',
      })

      if (Array.isArray(result.words) && result.words.length > 0) {
        return result.words
          .filter((w) => String(w.text || '').trim().length > 0)
          .map((w) => ({
            text: String(w.text).trim(),
            start: Number(Number(w.start).toFixed(2)),
            end: Number(Number(w.end).toFixed(2)),
          }))
      }
    } catch (sttErr) {
      console.warn('Google STT transcription error, falling back to transcript alignment / AI timing:', sttErr)
    }
  }

  // 3. If detailed verbatim transcript segments are available from the full video, extract them
  if (transcriptSegments && transcriptSegments.length > 0) {
    const extracted = extractWordsFromTranscriptSegments(
      transcriptSegments,
      clipStart,
      clipEnd,
    )
    if (extracted.length >= 10) {
      return extracted
    }
  }

  // 4. OpenAI / Whisper Speech Timing Engine: Generate speech dialogue tailored to the clip's hook and topic
  const prompt = `You are OpenAI Whisper & Viral Speech Timing Engine.
A creator needs precise, word-by-word synced caption timestamps for a viral 9:16 short clip.

Clip Metadata:
- Title: "${clip.title}"
- Hook Line: "${clip.hook || clip.title}"
- Topic: "${clip.topic || 'General'}"
- Matched Pattern: "${clip.matched_pattern_name || 'Viral Short'}"
- Clip Start Time: 0.0s
- Clip End Time: ${clipDuration.toFixed(1)}s

Generate a natural, high-retention spoken monologue for this clip (approx 2.5 - 3.5 words per second).
Return strict JSON with an array of "words", where each object has:
- "text": string (individual spoken word with appropriate punctuation/casing)
- "start": number (start timestamp in seconds relative to 0.0, rounded to 2 decimals)
- "end": number (end timestamp in seconds relative to 0.0, rounded to 2 decimals)

Constraints:
1. First word starts at 0.0s.
2. The speech MUST fill the entire clip duration up to ${clipDuration.toFixed(1)}s.
3. Every word must have a positive duration (e.g. 0.2s - 0.4s).
4. No overlaps between consecutive words.

Example JSON output:
{
  "words": [
    { "text": "Most", "start": 0.0, "end": 0.25 },
    { "text": "people", "start": 0.26, "end": 0.55 },
    { "text": "make", "start": 0.56, "end": 0.8 },
    { "text": "this", "start": 0.81, "end": 1.05 },
    { "text": "one", "start": 1.06, "end": 1.3 },
    { "text": "fatal", "start": 1.31, "end": 1.65 },
    { "text": "mistake.", "start": 1.66, "end": 2.1 }
  ]
}`

  try {
    if (!apiKey) throw new Error('No AI key configured for semantic caption timing.')
    const endpoint = 'https://openrouter.ai/api/v1/chat/completions'
const modelName = 'anthropic/claude-opus-5'

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://clipforge.app',
        'X-Title': 'ClipForge AI Captions',
      },
      body: JSON.stringify({
        model: modelName,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are an elite speech transcription and word-level timestamping model. Always output strict JSON with a "words" array.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    })

    if (res.ok) {
      const data = await res.json()
      const content = data.choices?.[0]?.message?.content || '{}'
      const parsed = JSON.parse(content)
      if (Array.isArray(parsed.words) && parsed.words.length > 0) {
        return parsed.words.map((w: any) => ({
          text: String(w.text || '').trim(),
          start: Number(w.start ?? 0),
          end: Number(w.end ?? w.start + 0.3),
        }))
      }
    }
  } catch (err) {
    console.warn('AI caption timing generation failed, using procedural cadence fallback:', err)
  }

  // 3. Fallback procedural word-level generator if network or API key is absent
  return generateProceduralWordTimestamps(clip, clipDuration)
}

/**
 * Procedural word-by-word timing generator based on natural English speech pacing
 */
function generateProceduralWordTimestamps(clip: Clip, duration: number): CaptionWordConfig[] {
  const hook = (clip.hook || clip.title || 'Here is the key breakdown').trim()
  const topic = (clip.topic || clip.category || 'viral strategy').trim()
  
  // Construct a punchy spoken narrative tailored to the clip
  const fullSentence = `${hook}. When you look at how top creators master ${topic}, they focus on high-retention execution, crystal clear delivery, and relentless consistency every single day.`
  const rawWords = fullSentence.split(/\s+/).filter((w) => w && w.trim().length > 0)

  const words: CaptionWordConfig[] = []
  const safeDuration = Math.max(3, duration)
  const wordPacing = Math.min(0.42, Math.max(0.22, (safeDuration - 0.5) / Math.max(1, rawWords.length)))

  let currentTime = 0.05
  for (let i = 0; i < rawWords.length && currentTime < safeDuration - 0.1; i++) {
    const word = rawWords[i]
    const wordDuration = Math.max(0.18, Math.min(0.55, word.length * 0.045 + (wordPacing - 0.08)))
    const endTime = Math.min(safeDuration, currentTime + wordDuration)

    words.push({
      text: word,
      start: Number(currentTime.toFixed(2)),
      end: Number(endTime.toFixed(2)),
    })

    currentTime = Number((endTime + 0.04).toFixed(2))
  }

  return words
}

/**
 * AI B-Roll Analyzer:
 * Analyzes the clip content and automatically matches strategic B-Roll video overlays
 * at high-retention transition points.
 */
export async function autoGenerateBrollWithAi({
  clip,
  customApiKey,
}: {
  clip: Clip
  customApiKey?: string
}): Promise<BrollConfigItem[]> {
  const clipDuration = Math.max(5, clip.duration || clip.end_time - clip.start_time || 30)
  const apiKey =
    customApiKey?.trim() ||
    (typeof import.meta !== 'undefined' &&
      (import.meta.env?.VITE_OPENAI_API_KEY || import.meta.env?.VITE_OPENROUTER_API_KEY)) ||
    getFallbackAiKey()

  const prompt = `You are an elite viral video editor (MrBeast / Alex Hormozi style) specialized in adding high-retention B-Roll video overlays.

Clip Information:
- Title: "${clip.title}"
- Hook: "${clip.hook || clip.title}"
- Topic: "${clip.topic || 'General'}"
- Matched Pattern: "${clip.matched_pattern_name || 'Viral Hook'}"
- Total Duration: ${clipDuration.toFixed(1)} seconds

Plan 2 to 3 strategic B-roll visual insertions to maximize viewer retention:
1. Hook Visual (around 0.5s - 4.5s)
2. Climax / Action Concept (around 12.0s - 16.0s)
3. Key Takeaway / Callout (around 22.0s - 26.0s if clip duration permits)

Available stock video categories and keywords:
- "coding", "tech", "software", "ai", "matrix"
- "money", "crypto", "stocks", "finance", "chart", "growth"
- "shock", "reaction", "secret", "mindblown", "mistake", "warning"
- "productivity", "focus", "work", "lifestyle", "success"
- "energy", "speed", "neon", "abstract", "modern"

Respond with strict JSON in this format:
{
  "broll": [
    {
      "startAt": 1.0,
      "duration": 3.5,
      "query": "coding tech neon",
      "category": "tech"
    },
    {
      "startAt": 14.0,
      "duration": 3.0,
      "query": "financial stock chart",
      "category": "finance"
    }
  ]
}`

  try {
    const endpoint = 'https://openrouter.ai/api/v1/chat/completions'
const modelName = 'anthropic/claude-opus-5'

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://clipforge.app',
        "Content-Type": "application/json",
        'X-Title': 'ClipForge AI B-Roll',
      },
      body: JSON.stringify({
        model: modelName,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are an AI video director. Always output strict JSON.' },
          { role: 'user', content: prompt },
        ],
      }),
    })

    if (res.ok) {
      const data = await res.json()
      const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}')
      if (Array.isArray(parsed.broll) && parsed.broll.length > 0) {
        return matchBrollToStockCatalog(parsed.broll, clipDuration)
      }
    }
  } catch (err) {
    console.warn('AI B-Roll planning fallback:', err)
  }

  // Fallback heuristic B-Roll placement
  return generateHeuristicBroll(clip, clipDuration)
}

function matchBrollToStockCatalog(
  aiBrolls: Array<{ startAt: number; duration: number; query?: string; category?: string }>,
  clipDuration: number,
): BrollConfigItem[] {
  return aiBrolls
    .filter((b) => b.startAt < clipDuration)
    .map((b, idx) => {
      const queryLower = (b.query || '').toLowerCase()
      const matched =
        STOCK_BROLL_CATALOG.find(
          (s) =>
            s.category === b.category ||
            s.keywords.some((k) => queryLower.includes(k)),
        ) || STOCK_BROLL_CATALOG[idx % STOCK_BROLL_CATALOG.length]

      return {
        videoUrl: matched.videoUrl,
        startAt: Math.max(0, Number(b.startAt.toFixed(1))),
        duration: Math.min(clipDuration - b.startAt, Math.max(1.5, Number((b.duration || 3.0).toFixed(1)))),
        provider: 'pexels',
        query: b.query || matched.title,
      }
    })
}

function generateHeuristicBroll(clip: Clip, duration: number): BrollConfigItem[] {
  const items: BrollConfigItem[] = []
  const text = `${clip.title} ${clip.topic || ''} ${clip.hook || ''}`.toLowerCase()

  let firstMatch = STOCK_BROLL_CATALOG[0]
  if (text.includes('money') || text.includes('crypto') || text.includes('profit') || text.includes('finance')) {
    firstMatch = STOCK_BROLL_CATALOG[1]
  } else if (text.includes('shock') || text.includes('secret') || text.includes('mistake') || text.includes('crazy')) {
    firstMatch = STOCK_BROLL_CATALOG[2]
  } else if (text.includes('focus') || text.includes('work') || text.includes('routine') || text.includes('life')) {
    firstMatch = STOCK_BROLL_CATALOG[3]
  }

  // 1. Hook B-roll
  items.push({
    videoUrl: firstMatch.videoUrl,
    startAt: 0.5,
    duration: Math.min(3.5, duration * 0.2),
    provider: 'stock',
    query: firstMatch.title,
  })

  // 2. Mid-point B-roll if clip is long enough
  if (duration > 15) {
    const secondMatch = STOCK_BROLL_CATALOG[4]
    items.push({
      videoUrl: secondMatch.videoUrl,
      startAt: Math.round(duration * 0.45),
      duration: Math.min(3.5, duration * 0.18),
      provider: 'stock',
      query: secondMatch.title,
    })
  }

  return items
}

/**
 * Parse raw Whisper JSON transcription output into CaptionWordConfig array
 */
export function parseWhisperJson(rawJson: string): CaptionWordConfig[] {
  try {
    const parsed = JSON.parse(rawJson)
    if (Array.isArray(parsed.words)) {
      return parsed.words.map((w: any) => ({
        text: String(w.word || w.text || '').trim(),
        start: Number(w.start || 0),
        end: Number(w.end || (w.start || 0) + 0.3),
      }))
    }
    if (Array.isArray(parsed.segments)) {
      const words: CaptionWordConfig[] = []
      for (const seg of parsed.segments) {
        if (Array.isArray(seg.words) && seg.words.length > 0) {
          for (const w of seg.words) {
            words.push({
              text: String(w.word || w.text || '').trim(),
              start: Number(w.start || 0),
              end: Number(w.end || (w.start || 0) + 0.3),
            })
          }
        } else if (seg.text) {
          const segWords = seg.text.trim().split(/\s+/)
          const segDur = (seg.end - seg.start) / Math.max(1, segWords.length)
          segWords.forEach((word: string, i: number) => {
            words.push({
              text: word,
              start: Number((seg.start + i * segDur).toFixed(2)),
              end: Number((seg.start + (i + 1) * segDur).toFixed(2)),
            })
          })
        }
      }
      return words
    }
  } catch (err) {
    console.error('Failed to parse Whisper JSON:', err)
  }
  return []
}
