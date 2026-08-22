import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').trim()
const supabaseAnonKey =
  ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '').trim()

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '⚠️ Supabase URL or anon key not provided. App will run in limited mode.'
  )
}

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) throw error
  return data as T
}
