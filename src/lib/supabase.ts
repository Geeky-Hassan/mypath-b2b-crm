import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from './config'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!env) {
    throw new Error('Supabase environment variables are not configured.')
  }

  client ??= createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })

  return client
}
