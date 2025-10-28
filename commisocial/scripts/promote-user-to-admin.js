#!/usr/bin/env node

/**
 * Script to promote a user to super_admin role
 * Usage: node scripts/promote-user-to-admin.js <username>
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const username = process.argv[2]

if (!username) {
  console.error('❌ Usage: node scripts/promote-user-to-admin.js <username>')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function promoteUser() {
  console.log(`🔍 Looking for user: ${username}`)

  // Find the user
  const { data: user, error: findError } = await supabase
    .from('profiles')
    .select('id, username, role')
    .eq('username', username)
    .single()

  if (findError || !user) {
    console.error('❌ User not found:', findError?.message || 'No user with that username')
    process.exit(1)
  }

  console.log(`✅ Found user: ${user.username} (current role: ${user.role})`)

  // Update role to super_admin
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ role: 'super_admin' })
    .eq('id', user.id)

  if (updateError) {
    console.error('❌ Failed to promote user:', updateError.message)
    process.exit(1)
  }

  console.log(`✅ Successfully promoted ${username} to super_admin!`)
}

promoteUser()
