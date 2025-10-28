#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const username = process.argv[2] || 'davidmorin82'

async function getUserEmail() {
  // Get user from profiles
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, role')
    .eq('username', username)
    .single()

  if (profileError || !profile) {
    console.error('❌ User not found in profiles')
    return
  }

  console.log(`\n👤 User: ${profile.username}`)
  console.log(`🔑 Role: ${profile.role}`)
  console.log(`🆔 ID: ${profile.id}`)

  // Get email from auth.users (requires service role)
  const { data: { user }, error: authError } = await supabase.auth.admin.getUserById(profile.id)

  if (authError || !user) {
    console.error('❌ Could not get auth user')
    return
  }

  console.log(`📧 Email: ${user.email}`)
  console.log(`\n💡 You can login with:`)
  console.log(`   Email: ${user.email}`)
  console.log(`   Password: <the password you used when signing up>`)
}

getUserEmail()
