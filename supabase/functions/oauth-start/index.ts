// Starts an OAuth flow for YouTube (Google) or TikTok.
// Client IDs/secrets live only in function secrets; tokens are stored
// server-side by the oauth-callback function.

import { corsHeaders, errorResponse, jsonResponse, requireUser } from '../_shared/utils.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let userId: string
  try {
    userId = (await requireUser(req)).id
  } catch {
    return errorResponse('Unauthorized', 401)
  }

  const { platform } = (await req.json().catch(() => ({}))) as { platform?: string }
  if (platform !== 'youtube' && platform !== 'tiktok') {
    return errorResponse('Platform must be "youtube" or "tiktok".')
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const redirectUri = `${supabaseUrl}/functions/v1/oauth-callback`
  const state = btoa(JSON.stringify({ platform, userId }))

  if (platform === 'youtube') {
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
    if (!clientId) {
      return errorResponse(
        'YouTube OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET as function secrets.',
        503,
      )
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope:
        'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
      state,
    })
    return jsonResponse({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` })
  }

  const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY')
  if (!clientKey) {
    return errorResponse(
      'TikTok OAuth is not configured. Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET as function secrets.',
      503,
    )
  }
  const params = new URLSearchParams({
    client_key: clientKey,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'user.info.basic,video.publish,video.list',
    state,
  })
  return jsonResponse({ url: `https://www.tiktok.com/v2/auth/authorize/?${params}` })
})
