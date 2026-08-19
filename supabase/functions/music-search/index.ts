// Music search via Jamendo. The client ID stays server-side.

import { corsHeaders, errorResponse, jsonResponse, requireUser } from '../_shared/utils.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    await requireUser(req)
  } catch {
    return errorResponse('Unauthorized', 401)
  }

  const { query, genre, mood } = (await req.json().catch(() => ({}))) as {
    query?: string
    genre?: string
    mood?: string
  }

  const clientId = Deno.env.get('JAMENDO_CLIENT_ID')
  if (!clientId) {
    return errorResponse(
      'Jamendo is not configured. Set JAMENDO_CLIENT_ID as a function secret.',
      503,
    )
  }

  const params = new URLSearchParams({
    client_id: clientId,
    format: 'json',
    limit: '12',
    audioformat: 'mp32',
    include: 'musicinfo',
  })
  if (query?.trim()) params.set('search', query.trim())
  const tags = [genre, mood].filter(Boolean).join(' ')
  if (tags) params.set('tags', tags)

  const res = await fetch(`https://api.jamendo.com/v3.0/tracks/?${params}`)
  if (!res.ok) return errorResponse(`Jamendo error ${res.status}`, 502)

  const data = (await res.json()) as {
    results: Array<{
      id: string
      name: string
      artist_name: string
      duration: number
      audio: string
      image: string
      musicinfo?: { tags?: { genres?: string[]; vartags?: string[] } }
    }>
  }

  const results = data.results
    .filter((t) => t.audio)
    .map((t) => ({
      provider: 'jamendo' as const,
      externalId: t.id,
      title: t.name,
      artist: t.artist_name,
      duration: t.duration,
      audioUrl: t.audio,
      imageUrl: t.image ?? null,
      genres: t.musicinfo?.tags?.genres ?? [],
      moods: t.musicinfo?.tags?.vartags ?? [],
    }))

  return jsonResponse({ results })
})
