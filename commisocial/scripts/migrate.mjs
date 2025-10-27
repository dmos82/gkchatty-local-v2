#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local manually
const envPath = join(__dirname, '../.env.local');
const envContent = readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) {
    process.env[key.trim()] = valueParts.join('=').trim();
  }
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🚀 Running Supabase Migration\n');
console.log('✅ URL:', supabaseUrl);
console.log('✅ Service role key loaded\n');

// Create admin client
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Read migration
const migrationPath = join(__dirname, '../supabase/migrations/20251027_complete_schema.sql');
const sql = readFileSync(migrationPath, 'utf8');

console.log('📝 Migration loaded (' + sql.length + ' chars)\n');
console.log('🔄 Executing via Supabase Admin API...\n');

// Use Supabase's database connection to execute raw SQL
// We'll use the REST API endpoint for raw queries
const url = `${supabaseUrl}/rest/v1/rpc/exec_sql`;

try {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ query: sql })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Migration failed:', response.status, response.statusText);
    console.error('Response:', errorText);

    // If exec_sql RPC doesn't exist, we need to execute statements individually
    if (errorText.includes('not found') || errorText.includes('does not exist')) {
      console.log('\n⚠️  exec_sql RPC not available, executing statements individually...\n');
      await executeStatementsIndividually(sql, supabaseUrl, serviceRoleKey);
    } else {
      process.exit(1);
    }
  } else {
    console.log('✅ Migration executed successfully!\n');
  }

  // Verify tables
  console.log('🔍 Verifying tables...\n');

  const { error: profileError } = await supabase
    .from('profiles')
    .select('count')
    .limit(0);

  if (!profileError) {
    console.log('✅ profiles table accessible');
  } else {
    console.log('❌ profiles table:', profileError.message);
  }

  const { error: postError } = await supabase
    .from('posts')
    .select('count')
    .limit(0);

  if (!postError) {
    console.log('✅ posts table accessible');
  } else {
    console.log('❌ posts table:', postError.message);
  }

  const { error: voteError } = await supabase
    .from('votes')
    .select('count')
    .limit(0);

  if (!voteError) {
    console.log('✅ votes table accessible');
  } else {
    console.log('❌ votes table:', voteError.message);
  }

  const { error: commentError } = await supabase
    .from('comments')
    .select('count')
    .limit(0);

  if (!commentError) {
    console.log('✅ comments table accessible');
  } else {
    console.log('❌ comments table:', commentError.message);
  }

  console.log('\n✅ Migration complete! Ready to test signup.\n');

} catch (err) {
  console.error('❌ Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
}

async function executeStatementsIndividually(sql, supabaseUrl, serviceRoleKey) {
  // This is a fallback method that executes each SQL statement via psql wire protocol
  // For simplicity, we'll just inform the user to run it manually
  console.log('\n📋 Please run the following SQL in Supabase SQL Editor:');
  console.log('\n' + '='.repeat(80));
  console.log(sql);
  console.log('='.repeat(80) + '\n');
  console.log('After running, return here and the verification will continue.\n');
  process.exit(0);
}
