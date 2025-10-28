/**
 * Apply Supabase Migrations
 *
 * This script reads SQL migration files and executes them against Supabase.
 * Requires SUPABASE_SERVICE_ROLE_KEY or direct database access.
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

async function applyMigrations() {
  // Check for service role key (needed for DDL operations)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in environment')
    console.log('\n📋 To apply migrations, you need to:')
    console.log('1. Go to: https://supabase.com/dashboard/project/usdmnaljflsbkgiejved/settings/api')
    console.log('2. Copy the "service_role" key (not anon key!)')
    console.log('3. Add to .env.local: SUPABASE_SERVICE_ROLE_KEY=your_key_here')
    console.log('4. Run this script again\n')
    console.log('OR manually run the SQL files in Supabase SQL Editor:')
    console.log('   - supabase/migrations/20251027_init_schema.sql')
    console.log('   - supabase/migrations/20251027_vote_triggers.sql')
    console.log('   - supabase/migrations/20251027_complete_schema.sql')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  const migrationsDir = path.join(__dirname, '../supabase/migrations')
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  console.log(`📦 Found ${migrationFiles.length} migration files\n`)

  for (const file of migrationFiles) {
    const filePath = path.join(migrationsDir, file)
    const sql = fs.readFileSync(filePath, 'utf8')

    console.log(`🔵 Applying: ${file}`)

    try {
      // Use Supabase's RPC or raw SQL execution
      // Note: This requires proper permissions
      const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })

      if (error) {
        console.error(`❌ Error in ${file}:`, error.message)
        console.log('\n💡 Alternative: Run this SQL manually in Supabase dashboard:')
        console.log(`   https://supabase.com/dashboard/project/usdmnaljflsbkgiejved/editor\n`)
        console.log(sql)
        process.exit(1)
      }

      console.log(`✅ Success: ${file}\n`)
    } catch (err) {
      console.error(`❌ Exception in ${file}:`, err.message)
      process.exit(1)
    }
  }

  console.log('🎉 All migrations applied successfully!')
}

// Load environment variables
require('dotenv').config({ path: '.env.local' })

applyMigrations().catch(console.error)
