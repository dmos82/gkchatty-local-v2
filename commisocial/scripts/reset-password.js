#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const username = process.argv[2]
const newPassword = process.argv[3]

if (!username || !newPassword) {
  console.error('❌ Usage: node scripts/reset-password.js <username> <new-password>')
  console.error('   Example: node scripts/reset-password.js davidmorin82 MyNewPass123!')
  process.exit(1)
}

async function resetPassword() {
  // Get user from profiles
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('username', username)
    .single()

  if (profileError || !profile) {
    console.error('❌ User not found:', username)
    process.exit(1)
  }

  console.log(`🔍 Found user: ${profile.username}`)

  // Update password using service role
  const { error: updateError } = await supabase.auth.admin.updateUserById(
    profile.id,
    { password: newPassword }
  )

  if (updateError) {
    console.error('❌ Failed to reset password:', updateError.message)
    process.exit(1)
  }

  console.log(`✅ Password reset successfully for ${username}!`)
  console.log(`\n💡 You can now login with:`)
  console.log(`   Username: ${username}`)
  console.log(`   Password: ${newPassword}`)
}

resetPassword()
