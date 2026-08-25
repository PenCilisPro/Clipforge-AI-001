import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').trim()

const supabaseAnonKey =
  ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '').trim()

// Safe diagnostic logging — never log the actual API key.
console.log('[Supabase] URL configured:', Boolean(supabaseUrl))
console.log('[Supabase] Anon key configured:', Boolean(supabaseAnonKey))

let isValidUrl = true

if (
  supabaseUrl &&
  !supabaseUrl.startsWith('http://') &&
  !supabaseUrl.startsWith('https://')
) {
  console.error(
    '[Supabase] Invalid URL. VITE_SUPABASE_URL must start with http:// or https://'
  )
  isValidUrl = false
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Supabase] Missing environment variables. Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are configured in Vercel before building.'
  )
}

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  isValidUrl
)

// Create the Supabase client.
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
)

// Helper for calling Supabase Edge Functions.
export async function invokeFunction<T>(
  name: string,
  body: Record<string, unknown>
): Promise<T> {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
    )
  }

  const { data, error } = await supabase.functions.invoke(name, {
    body,
  })

  if (error) {
    console.error(`[Supabase] Edge Function "${name}" failed:`, error)
    throw error
  }

  return data as T
}