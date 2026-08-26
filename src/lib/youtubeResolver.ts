const DEFAULT_RAPIDAPI_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_RAPIDAPI_KEY) || ''
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

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim()
}

export async function resolveYoutubeStream(urlOrId: string): Promise<YoutubeStreamInfo | null> {
  const videoId = extractYoutubeId(urlOrId)
  if (!videoId) return null

  if (cache.has(videoId)) return cache.get(videoId)!

  if (!DEFAULT_RAPIDAPI_KEY) {
    console.warn('VITE_RAPIDAPI_KEY is not configured; YouTube stream resolution skipped.')
    return null
  }

  try {
    const res = await fetch(`https://${DEFAULT_RAPIDAPI_HOST}/v2/video/details?videoId=${encodeURIComponent(videoId)}`, {
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

    const audioTrackList = audioItems
      .map((a: any) => {
        const url = String(a.url || '')
        const matchLang = url.match(/lang%3D([a-zA-Z-]+)/i) || url.match(/lang=([a-zA-Z-]+)/i)
        const lang = matchLang ? matchLang[1].toLowerCase() : ''
        const isOriginal = url.includes('acont%3Doriginal') || url.includes('acont=original')
        const isDubbed = url.includes('acont%3Ddubbed') || url.includes('acont=dubbed')
        const isM4a = String(a.mimeType || '').includes('mp4') || a.extension === 'm4a'
        const isEn = lang.startsWith('en') || (!lang && !isDubbed)
        return { ...a, lang, isOriginal, isDubbed, isM4a, isEn }
      })

    const bestAudioTrack =
      audioTrackList.find((a: any) => a.isEn && a.isOriginal && a.isM4a) ||
      audioTrackList.find((a: any) => a.isEn && a.isOriginal) ||
      audioTrackList.find((a: any) => a.isEn && !a.isDubbed) ||
      audioTrackList.find((a: any) => a.isOriginal) ||
      audioTrackList.find((a: any) => a.isEn) ||
      audioTrackList.find((a: any) => !a.isDubbed && a.isM4a) ||
      audioTrackList.find((a: any) => !a.isDubbed) ||
      audioTrackList[0]

    const usableVideos = videoItems.filter((v: any) => typeof v?.url === 'string' && v.url.trim().length > 0)
    const directVideoWithAudio =
      usableVideos.find((v: any) => v.hasAudio === true && (v.quality === '720p' || v.quality === '1080p')) ||
      usableVideos.find((v: any) => v.hasAudio === true) ||
      usableVideos[0]

    const videoUrl = firstString(directVideoWithAudio?.url)
    const audioUrl = firstString(bestAudioTrack?.url, directVideoWithAudio?.url)

    if (!videoUrl) {
      console.warn(`RapidAPI returned no usable video URL for YouTube video ${videoId}`)
      return null
    }

    const info: YoutubeStreamInfo = {
      videoId,
      title: data.title,
      videoUrl,
      audioUrl,
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
