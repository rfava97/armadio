import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

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
