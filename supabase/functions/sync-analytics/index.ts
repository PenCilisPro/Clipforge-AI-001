// Syncs analytics for published posts from YouTube and TikTok.
// Designed to be run on a cron schedule; can also be invoked manually.

import { corsHeaders, errorResponse, jsonResponse, serviceClient } from '../_shared/utils.ts'

interface PostRow {
  id: string
  user_id: string
  platform: 'youtube' | 'tiktok'
  external_post_id: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = serviceClient()
  const { data: posts, error } = await supabase
    .from('scheduled_posts')
    .select('id, user_id, platform, external_post_id')
    .eq('status', 'PUBLISHED')
    .not('external_post_id', 'is', null)
  if (error) return errorResponse(error.message, 500)

  const synced: string[] = []
  const failures: Array<{ postId: string; error: string }> = []

  for (const post of (posts ?? []) as PostRow[]) {
    try {
      if (post.platform === 'youtube') {
        const apiKey = Deno.env.get('YOUTUBE_API_KEY')
        if (!apiKey) throw new Error('YOUTUBE_API_KEY is not configured.')
        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${post.external_post_id}&key=${apiKey}`,
        )
        if (!res.ok) throw new Error(`YouTube stats error ${res.status}`)
        const data = (await res.json()) as {
          items?: Array<{
            statistics: { viewCount?: string; likeCount?: string; commentCount?: string }
          }>
        }
        const stats = data.items?.[0]?.statistics
        if (!stats) throw new Error('Video not found on YouTube.')
        const views = Number(stats.viewCount ?? 0)
        const likes = Number(stats.likeCount ?? 0)
        const comments = Number(stats.commentCount ?? 0)
        const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0
        const { error: insertError } = await supabase.from('analytics').insert({
          scheduled_post_id: post.id,
          views,
          likes,
          comments,
          shares: 0,
          engagement_rate: engagementRate,
        })
        if (insertError) throw new Error(insertError.message)
      } else {
        const { data: account } = await supabase
          .from('social_accounts')
          .select('access_token')
          .eq('user_id', post.user_id)
          .eq('platform', 'tiktok')
          .single()
        if (!account?.access_token) throw new Error('No connected TikTok account.')
        const res = await fetch(
          'https://open.tiktokapis.com/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${account.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              filters: { video_ids: [post.external_post_id] },
            }),
          },
        )
        if (!res.ok) throw new Error(`TikTok stats error ${res.status}`)
        const data = (await res.json()) as {
          data?: {
            videos?: Array<{
              view_count?: number
              like_count?: number
              comment_count?: number
              share_count?: number
            }>
          }
        }
        const video = data.data?.videos?.[0]
        if (!video) throw new Error('Video not found on TikTok.')
        const views = video.view_count ?? 0
        const likes = video.like_count ?? 0
        const comments = video.comment_count ?? 0
        const shares = video.share_count ?? 0
        const engagementRate = views > 0 ? ((likes + comments + shares) / views) * 100 : 0
        const { error: insertError } = await supabase.from('analytics').insert({
          scheduled_post_id: post.id,
          views,
          likes,
          comments,
          shares,
          engagement_rate: engagementRate,
        })
        if (insertError) throw new Error(insertError.message)
      }
      synced.push(post.id)
    } catch (err) {
      failures.push({
        postId: post.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return jsonResponse({ synced, failures })
})
