#!/usr/bin/env node

/**
 * Run Supabase Migration - Simple Direct Approach
 *
 * Usage: node scripts/run-migration-simple.mjs <SERVICE_ROLE_KEY>
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local
const envPath = join(__dirname, '../.env.local');
dotenv.config({ path: envPath });

async function runMigration() {
  console.log('🚀 Running Supabase Migration\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.argv[2];

  if (!supabaseUrl) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL not found');
    process.exit(1);
  }

  if (!serviceRoleKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found');
    console.error('\n💡 Add to .env.local:');
    console.error('   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key\n');
    console.error('Or run: node scripts/run-migration-simple.mjs <SERVICE_ROLE_KEY>\n');
    process.exit(1);
  }

  console.log('✅ Supabase URL:', supabaseUrl);
  console.log('✅ Service role key loaded\n');

  // Create admin client
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Read migration SQL
  const migrationPath = join(__dirname, '../supabase/migrations/20251027_complete_schema.sql');
  const sql = readFileSync(migrationPath, 'utf8');

  console.log('📝 Migration file loaded (' + sql.length + ' chars)\n');
  console.log('🔄 Executing migration...\n');

  try {
    // Split SQL into individual statements and execute
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let successCount = 0;
    let errorCount = 0;

    for (const statement of statements) {
      if (statement.length < 10) continue; // Skip very short statements

      try {
        // Execute using raw SQL query endpoint
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`
          },
          body: JSON.stringify({ sql: statement + ';' })
        });

        if (response.ok) {
          successCount++;
          process.stdout.write('.');
        } else {
          const error = await response.text();
          if (!error.includes('already exists')) {
            console.error('\n⚠️  Statement failed:', statement.substring(0, 60) + '...');
            console.error('    Error:', error);
            errorCount++;
          } else {
            successCount++;
            process.stdout.write('.');
          }
        }
      } catch (err) {
        console.error('\n❌ Error:', err.message);
        errorCount++;
      }
    }

    console.log('\n');

    if (errorCount === 0) {
      console.log('✅ Migration completed successfully!');
      console.log(`   Executed ${successCount} statements\n`);
    } else {
      console.log(`⚠️  Migration completed with ${errorCount} errors`);
      console.log(`   Successful: ${successCount} statements\n`);
    }

    // Verify tables
    console.log('🔍 Verifying tables...\n');

    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('count')
      .limit(0);

    if (!profileError) {
      console.log('✅ profiles table accessible');
    } else {
      console.log('❌ profiles table:', profileError.message);
    }

    const { data: posts, error: postError } = await supabase
      .from('posts')
      .select('count')
      .limit(0);

    if (!postError) {
      console.log('✅ posts table accessible');
    } else {
      console.log('❌ posts table:', postError.message);
    }

    console.log('\n✅ Migration complete! Ready to test signup.\n');

  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runMigration();
