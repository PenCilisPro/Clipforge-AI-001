import { createClient } from '@supabase/supabase-js'

const DEFAULT_SUPABASE_URL = 'https://uenjzvbtwlawhpsybamnp.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlbmp2YnR3bGF3aHBzeWJhbW5wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MjQ2ODYsImV4cCI6MjEwMjEwMDY4Nn0.9ObnlcMeS1DeG9PMngh5-89s9rfqHC0RHzWYJqsZIGg'

const supabaseUrl =
  ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').trim() ||
  DEFAULT_SUPABASE_URL
const supabaseAnonKey =
  ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '').trim() ||
  DEFAULT_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) throw error
  return data as T
}
