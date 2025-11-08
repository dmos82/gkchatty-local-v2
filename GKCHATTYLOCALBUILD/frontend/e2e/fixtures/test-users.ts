/**
 * Test user fixtures for E2E tests
 * All test users are prefixed with 'e2e-test-' for easy cleanup
 *
 * IMPORTANT: Users CANNOT self-register in GKCHATTY.
 * Only admins can create user accounts via the admin dashboard.
 * Tests must use setupTestUsers() to pre-create users before test execution.
 */

import { createTestUser, deleteTestUserByUsername } from './admin-api';

export interface TestUser {
  username: string;
  email: string;
  password: string;
  role?: 'user' | 'admin';
}

export const TEST_USERS = {
  regularUser: {
    username: 'e2e-test-user',
    email: 'e2e-test-user@example.com',
    password: 'Test123!@#',
    role: 'user' as const,
  },

  adminUser: {
    username: 'e2e-test-admin',
    email: 'e2e-test-admin@example.com',
    password: 'Admin123!@#',
    role: 'admin' as const,
  },

  tenantA: {
    username: 'e2e-test-tenant-a',
    email: 'e2e-test-tenant-a@example.com',
    password: 'TenantA123!@#',
    role: 'user' as const,
  },

  tenantB: {
    username: 'e2e-test-tenant-b',
    email: 'e2e-test-tenant-b@example.com',
    password: 'TenantB123!@#',
    role: 'user' as const,
  },

  newUser: {
    username: 'e2e-test-new-user',
    email: 'e2e-test-new-user@example.com',
    password: 'NewUser123!@#',
    role: 'user' as const,
  },
} as const;

/**
 * Get a unique test user for parallel test execution
 * Appends timestamp to avoid conflicts
 */
export function getUniqueTestUser(baseUser: TestUser): TestUser {
  const timestamp = Date.now();
  return {
    ...baseUser,
    username: `${baseUser.username}-${timestamp}`,
    email: `${baseUser.username}-${timestamp}@example.com`,
  };
}

/**
 * Setup test users via admin API
 * Creates all standard test users before test execution
 *
 * Call this in test.beforeAll() to prepare users for testing
 */
export async function setupTestUsers(): Promise<void> {
  console.log('[Setup] Creating test users via admin API...');

  const usersToCreate = [
    TEST_USERS.regularUser,
    TEST_USERS.adminUser,
    TEST_USERS.tenantA,
    TEST_USERS.tenantB,
  ];

  for (const user of usersToCreate) {
    try {
      // Try to delete existing user first (cleanup from previous runs)
      await deleteTestUserByUsername(user.username);
    } catch (error) {
      // Ignore errors - user may not exist
    }

    try {
      await createTestUser({
        username: user.username,
        password: user.password,
        email: user.email,
        role: user.role,
      });
      console.log(`[Setup] Created user: ${user.username} (${user.role})`);
    } catch (error: any) {
      console.error(`[Setup] Failed to create user ${user.username}:`, error.message);
      throw error; // Re-throw to fail the test setup
    }
  }

  console.log('[Setup] Test users created successfully');
}

/**
 * Cleanup test users via admin API
 * Deletes all standard test users after test execution
 *
 * Call this in test.afterAll() to clean up test data
 */
export async function cleanupTestUsers(): Promise<void> {
  console.log('[Cleanup] Deleting test users...');

  const usersToDelete = [
    TEST_USERS.regularUser,
    TEST_USERS.adminUser,
    TEST_USERS.tenantA,
    TEST_USERS.tenantB,
    TEST_USERS.newUser,
  ];

  for (const user of usersToDelete) {
    try {
      await deleteTestUserByUsername(user.username);
      console.log(`[Cleanup] Deleted user: ${user.username}`);
    } catch (error) {
      // Ignore errors - user may not exist
      console.warn(`[Cleanup] Could not delete ${user.username} (may not exist)`);
    }
  }

  console.log('[Cleanup] Test users cleanup complete');
}
