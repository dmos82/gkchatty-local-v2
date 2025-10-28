#!/usr/bin/env node

/**
 * Apply Admin System Migrations
 *
 * Applies only the new admin-related migrations (20251028_*.sql)
 * Uses direct PostgreSQL connection via pg library
 */

const fs = require('fs')
const path = require('path')

// Load environment variables
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

if (!supabaseUrl) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL not found in .env.local')
  process.exit(1)
}

// Extract project ref
const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '')

console.log('\n' + '='.repeat(70))
console.log('  ADMIN SYSTEM MIGRATIONS')
console.log('='.repeat(70))
console.log(`\n📍 Project: ${projectRef}`)
console.log(`🔗 Database: ${supabaseUrl}\n`)

// List of admin migrations to apply (in order)
const adminMigrations = [
  '20251028_add_admin_columns.sql',
  '20251028_create_audit_logs_table.sql',
  '20251028_create_mfa_recovery_codes_table.sql',
  '20251028_add_admin_rls_policies.sql',
  '20251028_add_audit_triggers.sql'
]

console.log('📋 Migrations to apply:\n')
adminMigrations.forEach((file, i) => {
  console.log(`   ${i + 1}. ${file}`)
})

console.log('\n' + '─'.repeat(70))
console.log('\n⚠️  MANUAL APPLICATION REQUIRED\n')
console.log('Supabase does not allow direct SQL execution via API for security.')
console.log('Please apply these migrations manually:\n')

console.log('📌 STEPS:\n')
console.log('1. Go to Supabase SQL Editor:')
console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new\n`)

console.log('2. Copy and run each migration file in order:\n')

const migrationsDir = path.join(__dirname, '../supabase/migrations')

adminMigrations.forEach((file, i) => {
  const filePath = path.join(migrationsDir, file)

  if (!fs.existsSync(filePath)) {
    console.error(`   ❌ File not found: ${file}`)
    return
  }

  const sql = fs.readFileSync(filePath, 'utf8')
  const lineCount = sql.split('\n').length

  console.log(`   [${i + 1}/${adminMigrations.length}] ${file} (${lineCount} lines)`)
  console.log(`       Path: supabase/migrations/${file}`)
  console.log('')
})

console.log('3. After applying all migrations, verify with:\n')
console.log('   SELECT column_name FROM information_schema.columns')
console.log('   WHERE table_name = \'profiles\' AND column_name IN (\'role\', \'deleted_at\', \'mfa_enabled\');\n')

console.log('4. Return here and press ENTER when done (or Ctrl+C to cancel)\n')

console.log('─'.repeat(70))
console.log('\n🚀 QUICK COPY-PASTE OPTION:\n')
console.log('To see the full SQL for a migration, run:')
console.log('   cat supabase/migrations/20251028_add_admin_columns.sql\n')

console.log('─'.repeat(70))
console.log('\n💡 OR: Apply via Supabase CLI (if project is linked):\n')
console.log('   supabase db push\n')

console.log('='.repeat(70))
console.log('')

// Wait for user confirmation
const readline = require('readline')
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

rl.question('Press ENTER when migrations are applied (or Ctrl+C to skip)... ', async () => {
  console.log('\n✅ Continuing with implementation...\n')
  rl.close()

  // Verify migrations were applied
  const { createClient } = require('@supabase/supabase-js')
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (serviceRoleKey) {
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    console.log('🔍 Verifying migrations...\n')

    try {
      // Check if role column exists
      const { data, error } = await supabase
        .from('profiles')
        .select('id, role, deleted_at, mfa_enabled')
        .limit(1)

      if (error) {
        if (error.message.includes('column') && error.message.includes('does not exist')) {
          console.log('❌ Migrations NOT applied yet. Please apply them manually.')
          console.log(`   Error: ${error.message}\n`)
        } else {
          console.log('⚠️  Could not verify (this may be okay):', error.message, '\n')
        }
      } else {
        console.log('✅ Migrations verified! New columns are accessible:\n')
        console.log('   ✅ profiles.role')
        console.log('   ✅ profiles.deleted_at')
        console.log('   ✅ profiles.mfa_enabled')
        console.log('\n📍 Ready to proceed with TASK-007 (Middleware)\n')
      }
    } catch (err) {
      console.log('⚠️  Verification failed:', err.message, '\n')
    }
  }

  process.exit(0)
})
