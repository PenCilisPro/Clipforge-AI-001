// Publishes a scheduled post to YouTube Shorts or TikTok.
// Status is only set to PUBLISHED after the platform API confirms success.
// Can be invoked directly (retry button) or by a cron schedule for due posts.

import { corsHeaders, errorResponse, jsonResponse, serviceClient } from '../_shared/utils.ts'

interface SocialAccountRow {
  id: string
  user_id: string
  platform: string
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
}

interface PostRow {
  id: string
  clip_id: string
  user_id: string
  platform: 'youtube' | 'tiktok'
  status: string
  title: string
  description: string | null
  hashtags: string[]
  visibility: string
  retry_count: number
}

// deno-lint-ignore no-explicit-any
type ServiceClient = ReturnType<typeof serviceClient>

async function refreshGoogleToken(
  supabase: ServiceClient,
  account: SocialAccountRow,
): Promise<string> {
  const expiresAt = account.token_expires_at ? Date.parse(account.token_expires_at) : 0
  if (account.access_token && expiresAt > Date.now() + 60_000) {
    return account.access_token
  }
  if (!account.refresh_token) throw new Error('YouTube token expired; reconnect the account.')
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw new Error('Google OAuth secrets missing.')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: account.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    await supabase.from('social_accounts').update({ status: 'expired' }).eq('id', account.id)
    throw new Error('YouTube token refresh failed; reconnect the account.')
  }
  const tokens = (await res.json()) as { access_token: string; expires_in: number }
  await supabase
    .from('social_accounts')
    .update({
      access_token: tokens.access_token,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      status: 'connected',
    })
    .eq('id', account.id)
  return tokens.access_token
}

async function publishToYouTube(
  accessToken: string,
  post: PostRow,
  videoBytes: Uint8Array,
): Promise<string> {
  const metadata = {
    snippet: {
      title: post.title,
      description: [post.description ?? '', post.hashtags.map((h) => `#${h}`).join(' ')]
        .filter(Boolean)
        .join('\n\n'),
      categoryId: '22',
    },
    status: {
      privacyStatus: post.visibility,
      selfDeclaredMadeForKids: false,
    },
  }

  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': String(videoBytes.byteLength),
      },
      body: JSON.stringify(metadata),
    },
  )
  if (!initRes.ok) throw new Error(`YouTube upload init failed: ${await initRes.text()}`)
  const uploadUrl = initRes.headers.get('Location')
  if (!uploadUrl) throw new Error('YouTube did not return an upload URL.')

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4' },
    body: videoBytes,
  })
  if (!uploadRes.ok) throw new Error(`YouTube upload failed: ${await uploadRes.text()}`)
  const video = (await uploadRes.json()) as { id: string }
  if (!video.id) throw new Error('YouTube upload returned no video ID.')
  return video.id
}

async function publishToTikTok(
  accessToken: string,
  post: PostRow,
  videoBytes: Uint8Array,
): Promise<string> {
  const initRes = await fetch(
    'https://open.tiktokapis.com/v2/post/publish/video/init/',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        post_info: {
          title: [post.title, post.hashtags.map((h) => `#${h}`).join(' ')]
            .filter(Boolean)
            .join(' '),
          privacy_level:
            post.visibility === 'public'
              ? 'PUBLIC_TO_EVERYONE'
              : post.visibility === 'unlisted'
                ? 'FOLLOWER_OF_CREATOR'
                : 'SELF_ONLY',
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: videoBytes.byteLength,
          chunk_size: videoBytes.byteLength,
          total_chunk_count: 1,
        },
      }),
    },
  )
  if (!initRes.ok) throw new Error(`TikTok publish init failed: ${await initRes.text()}`)
  const init = (await initRes.json()) as {
    data?: { publish_id?: string; upload_url?: string }
    error?: { code?: string; message?: string }
  }
  if (init.error?.code && init.error.code !== 'ok') {
    throw new Error(`TikTok publish init error: ${init.error.message ?? init.error.code}`)
  }
  if (!init.data?.publish_id || !init.data.upload_url) {
    throw new Error('TikTok did not return an upload URL.')
  }

  const uploadRes = await fetch(init.data.upload_url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes 0-${videoBytes.byteLength - 1}/${videoBytes.byteLength}`,
    },
    body: videoBytes,
  })
  if (!uploadRes.ok) throw new Error(`TikTok upload failed: ${await uploadRes.text()}`)

  // Poll publish status; TikTok processes asynchronously.
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    const statusRes = await fetch(
      'https://open.tiktokapis.com/v2/post/publish/status/fetch/',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ publish_id: init.data.publish_id }),
      },
    )
    if (!statusRes.ok) continue
    const status = (await statusRes.json()) as {
      data?: { status?: string; fail_reason?: string }
    }
    if (status.data?.status === 'PUBLISH_COMPLETE') return init.data.publish_id
    if (status.data?.status === 'FAILED') {
      throw new Error(`TikTok publish failed: ${status.data.fail_reason ?? 'unknown reason'}`)
    }
  }
  throw new Error(
    'TikTok is still processing the post; status was not confirmed. It will not be marked published until confirmed.',
  )
}

async function publishOne(supabase: ServiceClient, post: PostRow): Promise<void> {
  await supabase
    .from('scheduled_posts')
    .update({ status: 'UPLOADING', error_message: null })
    .eq('id', post.id)

  try {
    const { data: clip, error: clipError } = await supabase
      .from('clips')
      .select('id, current_render_url')
      .eq('id', post.clip_id)
      .single()
    if (clipError || !clip?.current_render_url) {
      throw new Error('Clip has no rendered MP4 yet.')
    }

    const { data: account, error: accountError } = await supabase
      .from('social_accounts')
      .select('id, user_id, platform, access_token, refresh_token, token_expires_at')
      .eq('user_id', post.user_id)
      .eq('platform', post.platform)
      .single()
    if (accountError || !account) {
      throw new Error(`No connected ${post.platform} account.`)
    }
    const accountRow = account as SocialAccountRow

    const videoRes = await fetch(clip.current_render_url)
    if (!videoRes.ok) throw new Error('Could not download the rendered MP4.')
    const videoBytes = new Uint8Array(await videoRes.arrayBuffer())

    let externalId: string
    if (post.platform === 'youtube') {
      const token = await refreshGoogleToken(supabase, accountRow)
      externalId = await publishToYouTube(token, post, videoBytes)
    } else {
      if (!accountRow.access_token) {
        throw new Error('TikTok token missing; reconnect the account.')
      }
      externalId = await publishToTikTok(accountRow.access_token, post, videoBytes)
    }

    await supabase
      .from('scheduled_posts')
      .update({
        status: 'PUBLISHED',
        external_post_id: externalId,
        published_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', post.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await supabase
      .from('scheduled_posts')
      .update({ status: 'FAILED', error_message: message })
      .eq('id', post.id)
    throw err
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = serviceClient()
  const { postId } = (await req.json().catch(() => ({}))) as { postId?: string }

  if (postId) {
    const { data: post, error } = await supabase
      .from('scheduled_posts')
      .select('*')
      .eq('id', postId)
      .single()
    if (error || !post) return errorResponse('Post not found.', 404)
    try {
      await publishOne(supabase, post as PostRow)
      return jsonResponse({ published: true, postId })
    } catch (err) {
      return errorResponse(err instanceof Error ? err.message : 'Publish failed.', 502)
    }
  }

  // Cron mode: publish all due posts.
  const { data: due, error } = await supabase
    .from('scheduled_posts')
    .select('*')
    .in('status', ['SCHEDULED', 'RETRYING'])
    .lte('scheduled_at', new Date().toISOString())
    .limit(5)
  if (error) return errorResponse(error.message, 500)

  const results: Array<{ postId: string; ok: boolean; error?: string }> = []
  for (const post of (due ?? []) as PostRow[]) {
    try {
      await publishOne(supabase, post)
      results.push({ postId: post.id, ok: true })
    } catch (err) {
      results.push({
        postId: post.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return jsonResponse({ processed: results })
})
