import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { KeyRound, Link2, RefreshCw, Unlink, User, Shield, ExternalLink, Sparkles, Key, Check } from 'lucide-react'
import { TikTokIcon, YoutubeIcon } from '@/components/icons'
import { format, parseISO } from 'date-fns'
import { useAuth } from '@/hooks/useAuth'
import { supabase, invokeFunction, isSupabaseConfigured } from '@/lib/supabase'
import type { Platform, SocialAccount } from '@/lib/types'
import { ErrorState, LoadingState, PageHeader, StatusBadge } from '@/components/ui'
import { getStoredApiKey } from '@/lib/clipAiAssistant'

const PLATFORMS: Array<{
  id: Platform
  label: string
  description: string
}> = [
  {
    id: 'youtube',
    label: 'YouTube',
    description: 'Publish Shorts with title, description, visibility, and scheduling.',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    description:
      'Publish via the TikTok Content Posting API. Some features (e.g. scheduling) depend on your TikTok app approval level.',
  },
]

export default function SettingsPage() {
  const { user } = useAuth()
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyPlatform, setBusyPlatform] = useState<Platform | null>(null)
  const [aiKey, setAiKey] = useState<string>(() => getStoredApiKey())
  const [keySaved, setKeySaved] = useState(false)

  const handleSaveKey = (newKey: string) => {
    setAiKey(newKey)
    try {
      localStorage.setItem('clipforge_openai_key', newKey.trim())
      setKeySaved(true)
      setTimeout(() => setKeySaved(false), 2500)
    } catch {}
  }

  const load = useCallback(async () => {
    setError(null)
    try {
      const { data, error: loadError } = await supabase
        .from('social_accounts')
        .select('id, user_id, platform, account_name, status, last_sync_at, created_at, updated_at')
      if (loadError) throw new Error(loadError.message)
      setAccounts((data ?? []) as SocialAccount[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function connect(platform: Platform) {
    setBusyPlatform(platform)
    setActionError(null)
    try {
      const { url } = await invokeFunction<{ url: string }>('oauth-start', { platform })
      window.location.href = url
    } catch (err) {
      setActionError(
        err instanceof Error
          ? `Could not start ${platform} connection: ${err.message}`
          : `Could not start ${platform} connection. Check that the server-side OAuth function is deployed and credentials are configured.`,
      )
    } finally {
      setBusyPlatform(null)
    }
  }

  async function disconnect(account: SocialAccount) {
    setBusyPlatform(account.platform)
    setActionError(null)
    const { error: deleteError } = await supabase
      .from('social_accounts')
      .delete()
      .eq('id', account.id)
    setBusyPlatform(null)
    if (deleteError) {
      setActionError(deleteError.message)
      return
    }
    await load()
  }

  if (loading) return <LoadingState label="Loading settings..." />
  if (error) return <ErrorState message={error} onRetry={() => void load()} />

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Settings" subtitle="Account, AI keys, and platform connections." />

      {actionError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {actionError}
        </div>
      )}

      {/* Account Info */}
      <div className="card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
          <User className="h-5 w-5 text-brand-400" /> Account
        </h2>
        <div className="space-y-1 text-sm">
          <p className="text-gray-300">
            <span className="text-gray-500">Email:</span> {user?.email ?? '—'}
          </p>
          <p className="text-gray-300">
            <span className="text-gray-500">User ID:</span>{' '}
            <span className="font-mono text-xs">{user?.id ?? '—'}</span>
          </p>
        </div>
      </div>

      {/* AI Speech & Whisper NIM Key */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Sparkles className="h-5 w-5 text-amber-400" /> AI Key (OpenRouter / Anthropic)
          </h2>
          {aiKey.startsWith('nvapi-') ? (
            <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> NVIDIA NIM Active
            </span>
          ) : aiKey.startsWith('sk-or-') ? (
            <span className="text-xs font-semibold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded border border-brand-500/30 flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> OpenRouter Active
            </span>
          ) : aiKey.startsWith('sk-') ? (
            <span className="text-xs font-semibold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded border border-brand-500/30 flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> OpenAI Active
            </span>
          ) : null}
        </div>
        <p className="text-xs text-gray-400">
          Used by AI services for moment detection, captions, B-roll, and music recommendations.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Key className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
            <input
              type="password"
              placeholder="sk-or-v1-... or sk-... or nvapi-..."
              value={aiKey}
              onChange={(e) => handleSaveKey(e.target.value)}
              className="input w-full !pl-9 text-xs font-mono"
            />
          </div>
          <button
            onClick={() => {
              const defaultKey = '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'
              handleSaveKey(defaultKey)
            }}
            className="btn-secondary text-xs"
            title="Reset to your provided NVIDIA NIM Whisper key"
          >
            Reset Default
          </button>
        </div>
        {keySaved && (
          <p className="text-[11px] text-emerald-400 flex items-center gap-1">
            <Check className="h-3 w-3" /> Saved to your browser workspace
          </p>
        )}
      </div>

      <div className="card p-4">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-white">
          <Link2 className="h-5 w-5 text-brand-400" /> Connected Platforms
        </h2>
        <p className="mb-4 text-xs text-gray-500">
          OAuth tokens are stored server-side only and are never exposed to the browser.
        </p>
        <div className="space-y-3">
          {PLATFORMS.map(({ id, label, description }) => {
            const account = accounts.find((a) => a.platform === id)
            const connected = account?.status === 'connected'
            return (
              <div
                key={id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-surface-500 bg-surface-800 px-4 py-3"
              >
                {id === 'youtube' ? (
                  <YoutubeIcon className="h-5 w-5 shrink-0 text-red-500" />
                ) : (
                  <TikTokIcon className="h-5 w-5 shrink-0 text-white" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">{label}</p>
                    <StatusBadge status={account?.status ?? 'disconnected'} />
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">{description}</p>
                  {account?.account_name && connected && (
                    <p className="mt-0.5 text-xs text-gray-400">
                      Connected as <span className="text-white">{account.account_name}</span>
                      {account.last_sync_at &&
                        ` · last synced ${format(parseISO(account.last_sync_at), 'MMM d, HH:mm')}`}
                    </p>
                  )}
                </div>
                {connected ? (
                  <div className="flex gap-2">
                    <button
                      className="btn-secondary text-xs"
                      disabled={busyPlatform === id}
                      onClick={() => void connect(id)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Reconnect
                    </button>
                    <button
                      className="btn-ghost text-xs text-red-400"
                      disabled={busyPlatform === id}
                      onClick={() => void disconnect(account)}
                    >
                      <Unlink className="h-3.5 w-3.5" /> Disconnect
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn-primary text-xs"
                    disabled={busyPlatform === id}
                    onClick={() => void connect(id)}
                  >
                    {busyPlatform === id ? 'Opening...' : `Connect ${label}`}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
          <KeyRound className="h-5 w-5 text-brand-400" /> Backend Configuration
        </h2>
        <div className="space-y-2 text-sm text-gray-400">
          <p>
            Supabase:{' '}
            {isSupabaseConfigured ? (
              <span className="text-emerald-400">configured</span>
            ) : (
              <span className="text-amber-400">
                not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
              </span>
            )}
          </p>
          <p className="text-xs text-gray-500">
            External API keys (Pexels, Pixabay, Coverr, Jamendo, YouTube, TikTok, transcription)
            are configured as Supabase Edge Function secrets and never leave the server.
          </p>
        </div>
      </div>

      <div className="card p-4 bg-surface-900 border-surface-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Privacy Policy & Data Security</h3>
            <p className="text-xs text-zinc-400">Learn how your media files, transcripts, and account credentials are protected.</p>
          </div>
        </div>
        <Link to="/privacy" className="btn-secondary text-xs">
          <span>Read Policy</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}
