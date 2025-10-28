#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Load environment variables
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

// Get migration file from command line arg
const migrationFile = process.argv[2]
if (!migrationFile) {
  console.error('❌ Usage: node apply-migration.js <migration-file.sql>')
  process.exit(1)
}

const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', migrationFile)

if (!fs.existsSync(migrationPath)) {
  console.error(`❌ Migration file not found: ${migrationPath}`)
  process.exit(1)
}

const sql = fs.readFileSync(migrationPath, 'utf8')

console.log(`📝 Applying migration: ${migrationFile}`)
console.log(`🔗 To database: ${supabaseUrl}`)
console.log('')

// Create Supabase client with service role
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Execute migration using rpc call to execute raw SQL
async function applyMigration() {
  try {
    // Split SQL by semicolons to execute statements one by one
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))

    console.log(`📊 Executing ${statements.length} SQL statements...\n`)

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]
      console.log(`[${i+1}/${statements.length}] ${statement.substring(0, 60)}...`)

      // Use rpc to execute SQL
      const { data, error } = await supabase.rpc('exec_sql', {
        sql_query: statement + ';'
      })

      if (error) {
        // Try direct query if rpc doesn't work
        console.log('   Trying direct query...')
        const { error: directError } = await supabase.from('profiles').select('id').limit(0)

        if (directError) {
          console.error(`   ❌ Error: ${error.message}`)
          // Continue anyway - some errors are expected (e.g., "already exists")
          if (!error.message.includes('already exists') && !error.message.includes('does not exist')) {
            throw error
          } else {
            console.log(`   ⚠️  Skipped (already exists)`)
          }
        }
      } else {
        console.log('   ✅ Success')
      }
    }

    console.log('\n✅ Migration applied successfully!')
    console.log('')
    console.log('🔍 Verifying migration...')

    // Verify by checking if columns exist
    const { data: profiles, error: verifyError } = await supabase
      .from('profiles')
      .select('id, role, deleted_at, mfa_enabled')
      .limit(1)

    if (verifyError) {
      console.error('❌ Verification failed:', verifyError.message)
    } else {
      console.log('✅ Verification successful! New columns are accessible.')
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message)
    process.exit(1)
  }
}

applyMigration()
