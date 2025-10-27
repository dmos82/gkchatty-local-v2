#!/usr/bin/env node

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local
const envPath = join(__dirname, '../.env.local');
const envContent = readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) {
    process.env[key.trim()] = valueParts.join('=').trim();
  }
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.argv[2];

// Extract project ref from URL
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)[1];

// Construct correct postgres connection string
const connectionString = `postgresql://postgres:${dbPassword}@db.${projectRef}.supabase.co:5432/postgres`;

console.log('🚀 Running Supabase Migration via Direct Postgres Connection\n');
console.log('✅ Project:', projectRef);
console.log('✅ Connecting to database...\n');

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

try {
  await client.connect();
  console.log('✅ Connected to Supabase Postgres\n');

  // Read migration
  const migrationPath = join(__dirname, '../supabase/migrations/20251027_complete_schema.sql');
  const sql = readFileSync(migrationPath, 'utf8');

  console.log('📝 Migration loaded (' + sql.length + ' chars)\n');
  console.log('🔄 Executing SQL...\n');

  // Execute the migration
  await client.query(sql);

  console.log('✅ Migration executed successfully!\n');

  // Verify tables
  console.log('🔍 Verifying tables...\n');

  const tables = ['profiles', 'posts', 'votes', 'comments'];
  for (const table of tables) {
    try {
      const result = await client.query(`SELECT COUNT(*) FROM ${table}`);
      console.log(`✅ ${table} table accessible (${result.rows[0].count} rows)`);
    } catch (err) {
      console.log(`❌ ${table} table:`, err.message);
    }
  }

  // Check policies
  console.log('\n🔍 Verifying RLS policies...\n');

  const policiesQuery = `
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE tablename IN ('profiles', 'posts', 'votes', 'comments')
    ORDER BY tablename, policyname
  `;

  const policies = await client.query(policiesQuery);

  if (policies.rows.length > 0) {
    console.log('✅ RLS Policies:');
    policies.rows.forEach(row => {
      console.log(`   - ${row.tablename}: ${row.policyname}`);
    });
  }

  console.log('\n✅ Migration complete! Ready to test signup.\n');

  await client.end();
} catch (err) {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  try {
    await client.end();
  } catch (e) {
    // Ignore cleanup errors
  }
  process.exit(1);
}
