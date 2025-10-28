#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function listUsers() {
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, username, role, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('❌ Error:', error.message)
    return
  }

  console.log(`\n📊 Total users: ${users.length}\n`)
  users.forEach(user => {
    console.log(`- ${user.username} (role: ${user.role}, created: ${new Date(user.created_at).toLocaleDateString()})`)
  })
}

listUsers()
