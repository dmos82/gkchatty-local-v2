import { createBrowserClient } from '@supabase/ssr'

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

  // Use SSR-compatible browser client that writes to cookies
  return createBrowserClient(supabaseUrl, supabaseKey)
}