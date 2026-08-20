// OAuth callback for YouTube (Google) and TikTok.
// Exchanges the authorization code for tokens, stores them server-side in
// social_accounts, and redirects back to the app.

import { errorResponse, serviceClient } from '../_shared/utils.ts'

interface OAuthState {
  platform: 'youtube' | 'tiktok'
  userId: string
}

function appRedirect(result: 'connected' | 'error', platform: string, detail?: string): Response {
  const appUrl = Deno.env.get('APP_URL') ?? '/'
  const params = new URLSearchParams({ oauth: result, platform })
  if (detail) params.set('detail', detail)
  return Response.redirect(`${appUrl}/settings?${params}`, 302)
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const stateRaw = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')

  if (!stateRaw) return errorResponse('Missing state.')
  let state: OAuthState
  try {
    state = JSON.parse(atob(stateRaw)) as OAuthState
  } catch {
    return errorResponse('Invalid state.')
  }

  if (oauthError || !code) {
    return appRedirect('error', state.platform, oauthError ?? 'no_code')
  }

  const supabase = serviceClient()
  const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback`

  try {
    if (state.platform === 'youtube') {
      const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
      const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
      if (!clientId || !clientSecret) throw new Error('Google OAuth secrets missing.')

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      })
      if (!tokenRes.ok) throw new Error(`Token exchange failed: ${await tokenRes.text()}`)
      const tokens = (await tokenRes.json()) as {
        access_token: string
        refresh_token?: string
        expires_in: number
      }

      const channelRes = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      )
      let accountName: string | null = null
      if (channelRes.ok) {
        const channels = (await channelRes.json()) as {
          items?: Array<{ snippet: { title: string } }>
        }
        accountName = channels.items?.[0]?.snippet.title ?? null
      }

      const { error } = await supabase.from('social_accounts').upsert(
        {
          user_id: state.userId,
          platform: 'youtube',
          account_name: accountName,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token ?? null,
          token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          status: 'connected',
          last_sync_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,platform' },
      )
      if (error) throw new Error(error.message)
      return appRedirect('connected', 'youtube')
    }

    const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY')
    const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET')
    if (!clientKey || !clientSecret) throw new Error('TikTok OAuth secrets missing.')

    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    })
    if (!tokenRes.ok) throw new Error(`Token exchange failed: ${await tokenRes.text()}`)
    const tokens = (await tokenRes.json()) as {
      access_token: string
      refresh_token: string
      expires_in: number
      open_id: string
    }

    let accountName: string | null = null
    const userRes = await fetch(
      'https://open.tiktokapis.com/v2/user/info/?fields=display_name',
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    )
    if (userRes.ok) {
      const userInfo = (await userRes.json()) as {
        data?: { user?: { display_name?: string } }
      }
      accountName = userInfo.data?.user?.display_name ?? null
    }

    const { error } = await supabase.from('social_accounts').upsert(
      {
        user_id: state.userId,
        platform: 'tiktok',
        account_name: accountName,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        status: 'connected',
        last_sync_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,platform' },
    )
    if (error) throw new Error(error.message)
    return appRedirect('connected', 'tiktok')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OAuth failed'
    return appRedirect('error', state.platform, message)
  }
})
