// FIX #3: Use standard Supabase client instead of @supabase/ssr
// The SSR package may have issues with React 19 + Next.js 16
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase environment variables missing!')
    console.error('Missing:', {
      url: !supabaseUrl ? 'NEXT_PUBLIC_SUPABASE_URL' : 'SET',
      key: !supabaseKey ? 'NEXT_PUBLIC_SUPABASE_ANON_KEY' : 'SET'
    })
    throw new Error('Supabase configuration missing')
  }

  console.log('✅ Supabase client creating with URL:', supabaseUrl)

  // Use standard client instead of SSR client
  return createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    }
  })
}