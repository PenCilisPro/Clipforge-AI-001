// B-roll search across Pexels, Pixabay, and Coverr.
// API keys stay server-side; results are normalized for the Clip Studio.

import { corsHeaders, errorResponse, jsonResponse, requireUser } from '../_shared/utils.ts'

interface BrollResult {
  provider: 'pexels' | 'pixabay' | 'coverr'
  externalId: string
  videoUrl: string
  previewImageUrl: string | null
  duration: number | null
  width: number | null
  height: number | null
}

async function searchPexels(query: string, key: string): Promise<BrollResult[]> {
  const res = await fetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=8`,
    { headers: { Authorization: key } },
  )
  if (!res.ok) throw new Error(`Pexels error ${res.status}`)
  const data = (await res.json()) as {
    videos: Array<{
      id: number
      image: string
      duration: number
      width: number
      height: number
      video_files: Array<{ link: string; width: number; height: number; quality: string }>
    }>
  }
  return data.videos.map((v) => {
    const file =
      v.video_files.find((f) => f.quality === 'hd' && f.height >= f.width) ??
      v.video_files[0]
    return {
      provider: 'pexels' as const,
      externalId: String(v.id),
      videoUrl: file?.link ?? '',
      previewImageUrl: v.image,
      duration: v.duration,
      width: file?.width ?? v.width,
      height: file?.height ?? v.height,
    }
  })
}

async function searchPixabay(query: string, key: string): Promise<BrollResult[]> {
  const res = await fetch(
    `https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(query)}&per_page=8`,
  )
  if (!res.ok) throw new Error(`Pixabay error ${res.status}`)
  const data = (await res.json()) as {
    hits: Array<{
      id: number
      duration: number
      videos: {
        large: { url: string; width: number; height: number; thumbnail: string }
        medium: { url: string; width: number; height: number; thumbnail: string }
      }
    }>
  }
  return data.hits.map((h) => {
    const v = h.videos.large.url ? h.videos.large : h.videos.medium
    return {
      provider: 'pixabay' as const,
      externalId: String(h.id),
      videoUrl: v.url,
      previewImageUrl: v.thumbnail ?? null,
      duration: h.duration,
      width: v.width,
      height: v.height,
    }
  })
}

async function searchCoverr(query: string, key: string): Promise<BrollResult[]> {
  const res = await fetch(
    `https://api.coverr.co/videos?query=${encodeURIComponent(query)}&page_size=8`,
    { headers: { Authorization: `Bearer ${key}` } },
  )
  if (!res.ok) throw new Error(`Coverr error ${res.status}`)
  const data = (await res.json()) as {
    hits: Array<{
      id: string
      duration: number
      poster: string
      urls: { mp4: string; mp4_download: string }
    }>
  }
  return data.hits.map((h) => ({
    provider: 'coverr' as const,
    externalId: h.id,
    videoUrl: h.urls.mp4,
    previewImageUrl: h.poster ?? null,
    duration: h.duration ?? null,
    width: null,
    height: null,
  }))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    await requireUser(req)
  } catch {
    return errorResponse('Unauthorized', 401)
  }

  const { query } = (await req.json().catch(() => ({}))) as { query?: string }
  if (!query || !query.trim()) return errorResponse('Missing "query".')

  const pexelsKey = Deno.env.get('PEXELS_API_KEY')
  const pixabayKey = Deno.env.get('PIXABAY_API_KEY')
  const coverrKey = Deno.env.get('COVERR_API_KEY')

  if (!pexelsKey && !pixabayKey && !coverrKey) {
    return errorResponse(
      'No B-roll providers configured. Set PEXELS_API_KEY, PIXABAY_API_KEY, or COVERR_API_KEY as function secrets.',
      503,
    )
  }

  const tasks: Array<Promise<BrollResult[]>> = []
  if (pexelsKey) tasks.push(searchPexels(query, pexelsKey))
  if (pixabayKey) tasks.push(searchPixabay(query, pixabayKey))
  if (coverrKey) tasks.push(searchCoverr(query, coverrKey))

  const settled = await Promise.allSettled(tasks)
  const results = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []))
  const errors = settled
    .filter((s): s is PromiseRejectedResult => s.status === 'rejected')
    .map((s) => String(s.reason))

  if (results.length === 0 && errors.length > 0) {
    return errorResponse(`All B-roll providers failed: ${errors.join('; ')}`, 502)
  }

  return jsonResponse({ results, providerErrors: errors })
})
