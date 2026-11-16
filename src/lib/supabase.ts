import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const url = SUPABASE_URL
const key = SUPABASE_KEY

if (!url || !key) {
  throw new Error('Mancano VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY')
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // implicit: il link nell'email funziona anche se aperto in un browser diverso
    // da quello che l'ha richiesto (es. PWA su iPhone → Safari).
    flowType: 'implicit',
  },
})
