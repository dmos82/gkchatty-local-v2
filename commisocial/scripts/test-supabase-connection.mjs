#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

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
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('🧪 Testing Supabase Connection\n');
console.log('URL:', supabaseUrl);
console.log('Anon key:', anonKey.substring(0, 20) + '...\n');

// Create client using ANON key (same as browser)
const supabase = createClient(supabaseUrl, anonKey);

console.log('Testing query: SELECT username FROM profiles WHERE username = \'testuser\'\n');

try {
  const { data, error } = await supabase
    .from('profiles')
    .select('username')
    .eq('username', 'testuser');

  if (error) {
    console.error('❌ Query error:', error);
    console.error('   Code:', error.code);
    console.error('   Message:', error.message);
    console.error('   Details:', error.details);
    console.error('   Hint:', error.hint);
  } else {
    console.log('✅ Query successful!');
    console.log('   Result:', data);
    console.log('   Length:', data.length);
  }

  // Test auth.signUp
  console.log('\n🧪 Testing auth.signUp with test credentials...\n');

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: 'connectiontest@example.com',
    password: 'TestPass123!'
  });

  if (authError) {
    console.error('❌ Auth error:', authError.message);
  } else {
    console.log('✅ Auth signup successful!');
    console.log('   User ID:', authData.user?.id);

    if (authData.user) {
      // Try to insert profile
      console.log('\n🧪 Testing profile insert...\n');

      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          username: 'connectiontest',
          display_name: 'Connection Test'
        });

      if (profileError) {
        console.error('❌ Profile insert error:', profileError.message);
      } else {
        console.log('✅ Profile insert successful!');
      }
    }
  }

} catch (err) {
  console.error('❌ Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
}

console.log('\n✅ Connection test complete\n');
