import { createClient } from '@supabase/supabase-js'

// The project URL is safe to expose in a browser bundle. Keeping this fallback
// prevents a deployment from becoming unusable solely because Vercel omitted
// the URL variable. The public key must still be configured in Vercel.
const DEFAULT_SUPABASE_URL = 'https://uenjvbtwlawhpsybamnp.supabase.co'

const supabaseUrl = (
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  DEFAULT_SUPABASE_URL
).trim()

// Supabase supports both the legacy anon key and the newer publishable key.
const supabaseAnonKey = (
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  ''
).trim()

const isValidUrl = /^https?:\/\//i.test(supabaseUrl)
const isSupabaseConfigured = Boolean(isValidUrl && supabaseAnonKey)

// Safe diagnostics: never print the actual key.
console.log('[Supabase] URL configured:', Boolean(supabaseUrl), supabaseUrl)
console.log('[Supabase] Public key configured:', Boolean(supabaseAnonKey))

if (!isValidUrl) {
  console.error('[Supabase] Invalid VITE_SUPABASE_URL.')
}

if (!supabaseAnonKey) {
  console.error(
    '[Supabase] Missing VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY). Add it to Vercel Environment Variables and redeploy.',
  )
}

// Keep the application renderable when configuration is incomplete. The real
// key is still required before auth or Edge Functions can work.
const clientKey = supabaseAnonKey || 'missing-public-key'

export { isSupabaseConfigured }

export const supabase = createClient(supabaseUrl, clientKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export async function invokeFunction<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY) in Vercel and redeploy.',
    )
  }

  const { data, error } = await supabase.functions.invoke(name, { body })

  if (error) {
    console.error(`[Supabase] Edge Function "${name}" failed:`, error)
    throw error
  }

  return data as T
}
