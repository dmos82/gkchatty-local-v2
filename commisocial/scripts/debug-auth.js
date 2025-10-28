#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const email = 'davidmorin82@gmail.com'
const password = 'AdminTest123!'

async function debugAuth() {
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  console.log('\n🔐 Testing authentication flow...\n')

  // Step 1: Login
  console.log('1️⃣ Attempting login...')
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (authError) {
    console.error('❌ Login failed:', authError.message)
    return
  }

  console.log('✅ Login successful!')
  console.log(`   User ID: ${authData.user.id}`)
  console.log(`   Email: ${authData.user.email}`)

  // Step 2: Check if we can query our own profile
  console.log('\n2️⃣ Checking profile access...')
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, role, deleted_at')
    .eq('id', authData.user.id)
    .single()

  if (profileError) {
    console.error('❌ Cannot access profile:', profileError.message)
    console.error('   Code:', profileError.code)
    console.error('   Details:', profileError.details)
    console.error('   Hint:', profileError.hint)
    return
  }

  console.log('✅ Profile accessible!')
  console.log(`   Username: ${profile.username}`)
  console.log(`   Role: ${profile.role}`)
  console.log(`   Deleted: ${profile.deleted_at ? 'Yes' : 'No'}`)

  // Step 3: Check admin authorization
  console.log('\n3️⃣ Checking admin authorization...')
  const isAdmin = ['admin', 'super_admin'].includes(profile.role)
  const isNotDeleted = !profile.deleted_at

  if (!isAdmin) {
    console.error('❌ Not an admin or super_admin')
    return
  }

  if (!isNotDeleted) {
    console.error('❌ Account is deleted')
    return
  }

  console.log('✅ Admin authorization passed!')
  console.log(`\n🎉 You should be able to access /admin with these credentials!`)
  console.log(`\n📋 Summary:`)
  console.log(`   - Auth: ✅`)
  console.log(`   - Profile Access: ✅`)
  console.log(`   - Admin Role: ✅`)
  console.log(`   - Not Deleted: ✅`)
}

debugAuth()
