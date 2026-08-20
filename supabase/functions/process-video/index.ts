// Kicks off processing for a project. Heavy work (download, ffmpeg,
// transcription, rendering) runs in the Node pipeline worker, which polls
// for projects in QUEUED status. This function validates ownership, fetches
// YouTube metadata where possible, and marks the project QUEUED.

import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  requireUser,
  serviceClient,
} from '../_shared/utils.ts'

function extractYoutubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/,
  )
  return match ? match[1] : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let userId: string
  try {
    userId = (await requireUser(req)).id
  } catch {
    return errorResponse('Unauthorized', 401)
  }

  const { projectId } = (await req.json().catch(() => ({}))) as { projectId?: string }
  if (!projectId) return errorResponse('Missing "projectId".')

  const supabase = serviceClient()
  const { data: project, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single()
  if (error || !project) return errorResponse('Project not found.', 404)

  // Fetch YouTube metadata (via YouTube Data API v3 if key available, else oEmbed / RapidAPI)
  if (project.source_type === 'youtube' && project.source_url) {
    const videoId = extractYoutubeId(project.source_url)
    if (!videoId) {
      await supabase
        .from('projects')
        .update({ status: 'FAILED', error_message: 'Invalid YouTube URL.' })
        .eq('id', projectId)
      return errorResponse('Invalid YouTube URL.')
    }

    let title: string | null = null
    let thumbnailUrl: string | null = null
    let durationSeconds: number | null = null

    // 1. Try Google YouTube Data API v3 if key is configured
    const ytApiKey = Deno.env.get('YOUTUBE_API_KEY')
    if (ytApiKey) {
      try {
        const ytRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${ytApiKey}`,
        )
        if (ytRes.ok) {
          const ytData = await ytRes.json()
          const item = ytData.items?.[0]
          if (item) {
            title = item.snippet?.title
            thumbnailUrl =
              item.snippet?.thumbnails?.maxres?.url ||
              item.snippet?.thumbnails?.high?.url ||
              item.snippet?.thumbnails?.medium?.url ||
              item.snippet?.thumbnails?.default?.url
          }
        }
      } catch (err) {
        console.warn('YouTube API metadata fetch failed:', err)
      }
    }

    // 2. Fallback to oEmbed if title not found
    if (!title) {
      const oembed = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      ).catch(() => null)
      if (oembed?.ok) {
        const meta = (await oembed.json()) as { title: string; thumbnail_url: string }
        title = meta.title
        thumbnailUrl = meta.thumbnail_url
      }
    }

    // Insert or update video record
    const { data: existing } = await supabase
      .from('videos')
      .select('id')
      .eq('project_id', projectId)
      .maybeSingle()
    if (!existing) {
      await supabase.from('videos').insert({
        project_id: projectId,
        title: title || `YouTube Video (${videoId})`,
        thumbnail_url: thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        youtube_video_id: videoId,
      })
    }
  }

  await supabase
    .from('projects')
    .update({ status: 'QUEUED', progress: 0, error_message: null })
    .eq('id', projectId)

  return jsonResponse({ queued: true })
})
