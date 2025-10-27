#!/usr/bin/env node

/**
 * GKChatty Test User Cleanup Script
 * Deletes all test users and their documents, keeping only davidmorinmusic, dev, and builderpro-bmad
 */

const API_URL = 'http://localhost:4001';
const KEEP_USERS = ['davidmorinmusic', 'dev', 'builderpro-bmad'];

// Admin credentials
const ADMIN_USER = 'dev';
const ADMIN_PASS = 'dev123';

let authToken = '';

async function login() {
  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS })
    });

    const data = await response.json();
    if (data.success) {
      authToken = data.token;
      console.log('✅ Logged in as admin');
      return true;
    }
    console.error('❌ Login failed:', data.message);
    return false;
  } catch (error) {
    console.error('❌ Login error:', error.message);
    return false;
  }
}

async function getUsers() {
  try {
    const response = await fetch(`${API_URL}/api/admin/users`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const data = await response.json();
    if (data.success) {
      return data.users;
    }
    console.error('❌ Failed to get users:', data.message);
    return [];
  } catch (error) {
    console.error('❌ Error getting users:', error.message);
    return [];
  }
}

async function deleteUser(userId, username) {
  try {
    const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const data = await response.json();
    if (data.success || response.status === 200) {
      console.log(`  ✅ Deleted user: ${username}`);
      return true;
    }
    console.error(`  ❌ Failed to delete ${username}:`, data.message);
    return false;
  } catch (error) {
    console.error(`  ❌ Error deleting ${username}:`, error.message);
    return false;
  }
}

async function cleanup() {
  console.log('🧹 GKChatty Test User Cleanup');
  console.log('================================\n');

  // Login
  if (!await login()) {
    console.error('Cannot proceed without admin access');
    process.exit(1);
  }

  // Get all users
  console.log('\n📋 Fetching user list...');
  const users = await getUsers();
  console.log(`Found ${users.length} total users\n`);

  // Categorize users
  const toKeep = users.filter(u => KEEP_USERS.includes(u.username));
  const toDelete = users.filter(u => !KEEP_USERS.includes(u.username));

  console.log(`✅ Keeping ${toKeep.length} users:`);
  toKeep.forEach(u => console.log(`  - ${u.username} (${u.role})`));

  console.log(`\n🗑️  Deleting ${toDelete.length} users:`);

  // Group by type for better reporting
  const e2eUsers = toDelete.filter(u => u.username.startsWith('e2e-test-'));
  const projectUsers = toDelete.filter(u =>
    ['habittracker', 'jamblog', 'minicodereview', 'musicviz', 'redditstyle', 'e2eadmin'].includes(u.username)
  );
  const otherUsers = toDelete.filter(u =>
    !u.username.startsWith('e2e-test-') &&
    !projectUsers.find(p => p.username === u.username)
  );

  console.log(`  - ${e2eUsers.length} E2E test users`);
  console.log(`  - ${projectUsers.length} Project test users`);
  console.log(`  - ${otherUsers.length} Other users\n`);

  // Confirm before deletion
  console.log('Starting deletion in 3 seconds... (Ctrl+C to cancel)');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Delete users
  console.log('\n🚀 Deleting users...\n');

  let deleted = 0;
  let failed = 0;

  for (const user of toDelete) {
    if (await deleteUser(user._id, user.username)) {
      deleted++;
    } else {
      failed++;
    }
  }

  // Summary
  console.log('\n================================');
  console.log('📊 Cleanup Summary:');
  console.log(`  ✅ Deleted: ${deleted} users`);
  if (failed > 0) {
    console.log(`  ❌ Failed: ${failed} users`);
  }
  console.log(`  ✅ Kept: ${toKeep.length} users`);
  console.log('\n✨ Cleanup complete!');
}

// Run cleanup
cleanup().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});