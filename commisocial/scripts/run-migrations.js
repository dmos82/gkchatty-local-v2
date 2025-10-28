#!/usr/bin/env node

/**
 * Run Supabase Migrations
 *
 * Executes SQL migration files against the Supabase Postgres database
 */

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../.env.local') })

async function runMigrations() {
  // Extract connection details from Supabase URL
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const projectRef = supabaseUrl.match(/https:\/\/(.+?)\.supabase\.co/)[1]

  // Get service role key
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in .env.local')
    process.exit(1)
  }

  // Construct database connection string
  // Supabase format: postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
  const connectionString = `postgresql://postgres.${projectRef}:${serviceRoleKey}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`

  console.log(`🔗 Connecting to database: ${projectRef}`)

  const client = new Client({ connectionString })

  try {
    await client.connect()
    console.log('✅ Connected to database\n')

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
        await client.query(sql)
        console.log(`✅ Success: ${file}\n`)
      } catch (err) {
        console.error(`❌ Error in ${file}:`, err.message)
        throw err
      }
    }

    console.log('🎉 All migrations applied successfully!')

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    console.log('\n💡 If connection failed, try running the SQL manually:')
    console.log('   https://supabase.com/dashboard/project/usdmnaljflsbkgiejved/editor')
    process.exit(1)
  } finally {
    await client.end()
  }
}

runMigrations()
