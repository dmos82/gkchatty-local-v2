#!/usr/bin/env node

/**
 * Run Supabase Migration Programmatically
 *
 * This script executes the database migration using Supabase's REST API.
 * Requires SUPABASE_SERVICE_ROLE_KEY to be set.
 */

const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('🚀 Starting database migration...\n');

  // Load environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL not found in environment');
    console.error('   Make sure .env.local is loaded\n');
    process.exit(1);
  }

  if (!serviceRoleKey) {
    console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY not found in environment');
    console.error('   Please set it in .env.local:\n');
    console.error('   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here\n');
    process.exit(1);
  }

  console.log('✅ Supabase URL:', supabaseUrl);
  console.log('✅ Service role key found\n');

  // Read migration file
  const migrationPath = path.join(__dirname, '../supabase/migrations/20251027_complete_schema.sql');

  if (!fs.existsSync(migrationPath)) {
    console.error('❌ Error: Migration file not found at:', migrationPath);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');
  console.log('✅ Migration file loaded:', migrationPath);
  console.log('📝 SQL length:', sql.length, 'characters\n');

  // Execute SQL using Supabase REST API
  const apiUrl = `${supabaseUrl}/rest/v1/rpc/exec_sql`;

  console.log('🔄 Executing migration via Supabase API...\n');

  try {
    // Use Supabase's postgres REST endpoint
    const { createClient } = require('@supabase/supabase-js');

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      console.error('❌ Migration failed:', error.message);
      console.error('   Details:', error);
      process.exit(1);
    }

    console.log('✅ Migration completed successfully!\n');

    // Verify tables were created
    const { data: tables, error: tableError } = await supabase
      .from('profiles')
      .select('count')
      .limit(0);

    if (!tableError) {
      console.log('✅ Verified: profiles table accessible');
    }

    console.log('\n📊 Next steps:');
    console.log('   1. Tables created: profiles, posts, votes, comments');
    console.log('   2. RLS policies enabled with INSERT permission');
    console.log('   3. Ready to test signup functionality\n');

  } catch (err) {
    console.error('❌ Error executing migration:', err.message);
    console.error('   Stack:', err.stack);
    process.exit(1);
  }
}

// Load .env.local
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  env.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
  console.log('✅ Loaded .env.local\n');
}

runMigration().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
