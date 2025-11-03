#!/usr/bin/env node

/**
 * Create Test Super Admin Account
 *
 * This script creates a dedicated test super admin user for automated testing.
 *
 * Credentials:
 *   Email: test-admin@commisocial.local
 *   Password: TestAdmin123!
 *   Role: super_admin
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TEST_ADMIN = {
  email: 'test-admin@commisocial.local',
  password: 'TestAdmin123!',
  username: 'test_admin',
  display_name: 'Test Admin',
  role: 'super_admin'
};

async function createTestAdmin() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('❌ Missing environment variables');
    console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  console.log('🚀 Creating test super admin account...\n');
  console.log('Configuration:');
  console.log('  Supabase URL:', SUPABASE_URL);
  console.log('  Email:', TEST_ADMIN.email);
  console.log('  Username:', TEST_ADMIN.username);
  console.log('  Role:', TEST_ADMIN.role);
  console.log('');

  // Create Supabase admin client
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    // Step 1: Check if user already exists
    console.log('📋 Step 1: Checking if user exists...');

    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users.find(u => u.email === TEST_ADMIN.email);

    if (existingUser) {
      console.log('⚠️  User already exists with ID:', existingUser.id);
      console.log('   Updating role to super_admin...');

      // Update role in profiles table
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: 'super_admin' })
        .eq('id', existingUser.id);

      if (updateError) {
        console.error('❌ Error updating role:', updateError.message);
        process.exit(1);
      }

      console.log('✅ Role updated successfully');
      console.log('');
      console.log('Test admin account ready:');
      console.log('  Email:', TEST_ADMIN.email);
      console.log('  Password:', TEST_ADMIN.password);
      console.log('  User ID:', existingUser.id);
      process.exit(0);
    }

    // Step 2: Create new user
    console.log('📋 Step 2: Creating new user in auth.users...');

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: TEST_ADMIN.email,
      password: TEST_ADMIN.password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        username: TEST_ADMIN.username,
        display_name: TEST_ADMIN.display_name
      }
    });

    if (authError) {
      console.error('❌ Error creating auth user:', authError.message);
      process.exit(1);
    }

    console.log('✅ Auth user created');
    console.log('   User ID:', authData.user.id);

    // Step 3: Wait for profile to be created by trigger
    console.log('📋 Step 3: Waiting for profile creation...');

    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

    // Step 4: Update profile with super_admin role
    console.log('📋 Step 4: Setting super_admin role...');

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        role: 'super_admin',
        username: TEST_ADMIN.username,
        display_name: TEST_ADMIN.display_name
      })
      .eq('id', authData.user.id);

    if (profileError) {
      console.error('❌ Error updating profile:', profileError.message);
      console.log('   Note: User was created but role not set. You can manually update via SQL.');
      process.exit(1);
    }

    console.log('✅ Profile updated with super_admin role');

    // Step 5: Verify
    console.log('📋 Step 5: Verifying account...');

    const { data: profile, error: verifyError } = await supabase
      .from('profiles')
      .select('id, username, role, created_at')
      .eq('id', authData.user.id)
      .single();

    if (verifyError || !profile) {
      console.error('❌ Error verifying profile:', verifyError?.message);
      process.exit(1);
    }

    console.log('✅ Verification successful');
    console.log('');
    console.log('═'.repeat(60));
    console.log('✅ TEST SUPER ADMIN CREATED SUCCESSFULLY');
    console.log('═'.repeat(60));
    console.log('');
    console.log('Account Details:');
    console.log('  Email:', TEST_ADMIN.email);
    console.log('  Username:', profile.username);
    console.log('  Role:', profile.role);
    console.log('  User ID:', profile.id);
    console.log('  Created:', new Date(profile.created_at).toLocaleString());
    console.log('');
    console.log('Login Credentials (for testing):');
    console.log('  Email:', TEST_ADMIN.email);
    console.log('  Password:', TEST_ADMIN.password);
    console.log('');
    console.log('You can now run:');
    console.log('  node scripts/test-authenticated-flow.js');
    console.log('');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

// Run
createTestAdmin();
