import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** False when .env is absent — App renders setup instructions instead of a dead login form. */
export const isConfigured = Boolean(url && anonKey)

export const supabase = createClient(url || 'https://unconfigured.invalid', anonKey || 'unconfigured', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
