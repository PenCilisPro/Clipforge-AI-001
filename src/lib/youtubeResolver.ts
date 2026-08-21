const DEFAULT_RAPIDAPI_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_RAPIDAPI_KEY) ||
  'a3a4ab9b9bmsh25a10436c2edfc5p1b7021jsn8a7c6f7f0e54'
const DEFAULT_RAPIDAPI_HOST =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_RAPIDAPI_HOST) ||
  'youtube-media-downloader.p.rapidapi.com'

export interface YoutubeStreamInfo {
  videoId: string
  title?: string
  videoUrl?: string
  audioUrl?: string
  thumbnailUrl?: string
  durationSeconds?: number
}

const cache = new Map<string, YoutubeStreamInfo>()

export function extractYoutubeId(urlOrId?: string | null): string | null {
  if (!urlOrId) return null
  const trimmed = urlOrId.trim()
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed
  const match = trimmed.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/)
  return match ? match[1] : null
}

export async function resolveYoutubeStream(urlOrId: string): Promise<YoutubeStreamInfo | null> {
  const videoId = extractYoutubeId(urlOrId)
  if (!videoId) return null

  if (cache.has(videoId)) {
    return cache.get(videoId)!
  }

  try {
    const res = await fetch(`https://${DEFAULT_RAPIDAPI_HOST}/v2/video/details?videoId=${videoId}`, {
      headers: {
        'x-rapidapi-key': DEFAULT_RAPIDAPI_KEY,
        'x-rapidapi-host': DEFAULT_RAPIDAPI_HOST,
      },
    })

    if (!res.ok) {
      console.warn(`RapidAPI YouTube stream resolution returned status ${res.status}`)
      return null
    }

    const data = await res.json()
    const videoItems = Array.isArray(data.videos?.items) ? data.videos.items : []
    const audioItems = Array.isArray(data.audios?.items) ? data.audios.items : []

    // 1. Find best video with audio enabled (e.g. 720p or 360p mp4 containing integrated audio stream)
    const directVideoWithAudio =
      videoItems.find((v: any) => v.url && v.hasAudio === true && (v.quality === '720p' || v.quality === '1080p')) ||
      videoItems.find((v: any) => v.url && v.hasAudio === true) ||
      videoItems[0]

    // 2. Find best separate audio stream
    const directAudio = audioItems[0]?.url || directVideoWithAudio?.url

    const info: YoutubeStreamInfo = {
      videoId,
      title: data.title,
      videoUrl: directVideoWithAudio?.url,
      audioUrl: directAudio,
      thumbnailUrl: data.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      durationSeconds: Number(data.lengthSeconds) || 300,
    }

    cache.set(videoId, info)
    return info
  } catch (err) {
    console.warn('Failed to resolve YouTube stream directly:', err)
    return null
  }
}
