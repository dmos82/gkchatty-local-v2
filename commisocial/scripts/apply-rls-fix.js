#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })

async function applyFix() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  console.log('🔵 Applying RLS INSERT policy for profiles table...')

  const sql = `CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);`

  try {
    // Use the REST API to execute SQL
    const { error } = await supabase.rpc('exec', { query: sql })

    if (error) {
      console.log('⚠️  Policy might already exist or different method needed')
      console.log('📋 Please run this SQL in Supabase dashboard SQL Editor:')
      console.log('')
      console.log(sql)
      console.log('')
      console.log('Dashboard URL: https://supabase.com/dashboard/project/usdmnaljflsbkgiejved/editor')
    } else {
      console.log('✅ RLS policy applied successfully!')
    }
  } catch (err) {
    console.log('⚠️  Script method failed')
    console.log('📋 Please run this SQL in Supabase dashboard SQL Editor:')
    console.log('')
    console.log(sql)
    console.log('')
    console.log('Dashboard URL: https://supabase.com/dashboard/project/usdmnaljflsbkgiejved/editor')
  }
}

applyFix()
