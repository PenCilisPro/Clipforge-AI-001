// Analyzes TikTok/YouTube analytics CSV exports with Claude via OpenRouter.
// The OpenRouter API key stays server-side.

import { corsHeaders, errorResponse, jsonResponse, requireUser } from '../_shared/utils.ts'

const MAX_ROWS = 200
const MAX_FIELD_LENGTH = 300

interface SuggestedPattern {
  name: string
  category: string
  start_signal: string
  end_signal: string
  score: number
  description: string
  keywords: string[]
}

function sanitizeRows(rows: unknown): Record<string, string>[] {
  if (!Array.isArray(rows)) return []
  return rows.slice(0, MAX_ROWS).map((row) => {
    const out: Record<string, string> = {}
    if (row && typeof row === 'object') {
      for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
        out[String(key).slice(0, 100)] = String(value ?? '').slice(0, MAX_FIELD_LENGTH)
      }
    }
    return out
  })
}

function toCsvBlock(label: string, rows: Record<string, string>[]): string {
  if (rows.length === 0) return `${label}: (no data provided)`
  const columns = Object.keys(rows[0])
  const lines = [columns.join(',')]
  for (const row of rows) {
    lines.push(columns.map((c) => JSON.stringify(row[c] ?? '')).join(','))
  }
  return `${label} (${rows.length} rows):\n${lines.join('\n')}`
}

const SYSTEM_PROMPT = `You are a short-form video content strategist. You are given analytics CSV exports from a creator's TikTok and/or YouTube accounts. Analyze which videos perform best and identify the recurring content patterns behind them (hooks, formats, topics, structures).

Respond with ONLY a JSON object (no markdown fences) with this exact shape:
{
  "insights": "A concise multi-paragraph analysis in plain text: what performs best, why, and concrete recommendations.",
  "patterns": [
    {
      "name": "Short pattern name",
      "category": "hook | story | education | humor | controversy | reaction | other",
      "start_signal": "How a clip matching this pattern typically starts",
      "end_signal": "How it typically ends",
      "score": 85,
      "description": "Why this pattern works for this creator, citing the data",
      "keywords": ["keyword1", "keyword2"]
    }
  ]
}
Include 3-8 patterns, scored 0-100 by how strongly the data supports them.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    await requireUser(req)
  } catch {
    return errorResponse('Unauthorized', 401)
  }

  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) {
    return errorResponse(
      'OpenRouter is not configured. Set OPENROUTER_API_KEY as a function secret.',
      503,
    )
  }
  const model = Deno.env.get('OPENROUTER_MODEL') ?? 'anthropic/claude-sonnet-4'

  const body = (await req.json().catch(() => ({}))) as {
    tiktokRows?: unknown
    youtubeRows?: unknown
    notes?: string
  }
  const tiktok = sanitizeRows(body.tiktokRows)
  const youtube = sanitizeRows(body.youtubeRows)
  if (tiktok.length === 0 && youtube.length === 0) {
    return errorResponse('Provide tiktokRows and/or youtubeRows parsed from the CSV exports.')
  }

  const userPrompt = [
    toCsvBlock('TikTok analytics export', tiktok),
    toCsvBlock('YouTube analytics export', youtube),
    body.notes?.trim() ? `Creator notes: ${body.notes.trim().slice(0, 1000)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': Deno.env.get('APP_URL') ?? 'https://clipforge.app',
      'X-Title': 'ClipForge AI',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return errorResponse(`OpenRouter error ${res.status}: ${detail.slice(0, 300)}`, 502)
  }

  const completion = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = completion.choices?.[0]?.message?.content ?? ''
  const jsonText = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')

  let parsed: { insights?: string; patterns?: SuggestedPattern[] }
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return jsonResponse({ insights: content, patterns: [], model })
  }

  const patterns = (Array.isArray(parsed.patterns) ? parsed.patterns : [])
    .filter((p) => p && typeof p.name === 'string' && p.name.trim())
    .map((p) => ({
      name: String(p.name).slice(0, 120),
      category: String(p.category ?? 'other').slice(0, 60),
      start_signal: String(p.start_signal ?? '').slice(0, 300),
      end_signal: String(p.end_signal ?? '').slice(0, 300),
      score: Math.max(0, Math.min(100, Number(p.score) || 0)),
      description: String(p.description ?? '').slice(0, 1000),
      keywords: Array.isArray(p.keywords) ? p.keywords.map((k) => String(k).slice(0, 60)).slice(0, 12) : [],
    }))

  return jsonResponse({ insights: parsed.insights ?? '', patterns, model })
})
