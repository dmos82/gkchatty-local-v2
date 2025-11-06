import { getLogger } from '../utils/logger';

const logger = getLogger('admin-api');

/**
 * Admin API Helper for E2E Tests
 *
 * Provides functions to create test users via admin endpoints.
 * Users CANNOT self-register in GKCHATTY - only admins can create accounts.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';

/**
 * Login as admin to get auth token
 */
async function getAdminToken(): Promise<string> {
  const adminUsername = process.env.E2E_ADMIN_USERNAME || 'testadmin';
  const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'testpassword';

  logger.debug('Logging in as admin', { adminUsername });

  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: adminUsername,
      password: adminPassword,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error('Admin login failed', { status: response.status, error });
    throw new Error(`Admin login failed: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.token) {
    throw new Error('No token received from admin login');
  }

  logger.debug('Admin login successful');
  return data.token;
}

export interface CreateUserOptions {
  username: string;
  password: string;
  email?: string; // Optional - will use placeholder if not provided
  role?: 'user' | 'admin';
}

/**
 * Create a test user via admin API
 *
 * Email is optional - if not provided, uses placeholder (user@example.com)
 */
export async function createTestUser(options: CreateUserOptions): Promise<any> {
  const { username, password, email, role = 'user' } = options;

  logger.info({ username, role, hasCustomEmail: !!email }, 'Creating test user');

  const adminToken = await getAdminToken();

  // Build request body - only include email if explicitly provided
  const requestBody: any = {
    username,
    password,
    role,
  };

  // Only add email to request if provided, otherwise let server generate placeholder
  if (email) {
    requestBody.email = email;
  }

  const response = await fetch(`${API_BASE_URL}/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error('User creation failed', { status: response.status, error, username });
    throw new Error(`Failed to create user ${username}: ${response.statusText} - ${error}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(`User creation returned success=false: ${data.message || 'Unknown error'}`);
  }

  logger.info({ userId: data.user?._id, username }, 'Test user created successfully');

  return data.user;
}

/**
 * Delete a test user via admin API (cleanup)
 */
export async function deleteTestUser(userId: string): Promise<void> {
  logger.info({ userId }, 'Deleting test user');

  const adminToken = await getAdminToken();

  const response = await fetch(`${API_BASE_URL}/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    logger.warn({ status: response.status, error, userId }, 'User deletion failed (may already be deleted)');
    // Don't throw - user may already be deleted
    return;
  }

  logger.debug({ userId }, 'Test user deleted successfully');
}

/**
 * Get all users via admin API
 */
export async function getAllUsers(): Promise<any[]> {
  const adminToken = await getAdminToken();

  const response = await fetch(`${API_BASE_URL}/admin/users`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch users: ${response.statusText}`);
  }

  const data = await response.json();
  return data.users || [];
}

/**
 * Delete a test user by username (convenience method)
 */
export async function deleteTestUserByUsername(username: string): Promise<void> {
  logger.debug({ username }, 'Looking up user by username');

  const users = await getAllUsers();
  const user = users.find(u => u.username === username);

  if (user) {
    await deleteTestUser(user._id);
  } else {
    logger.warn({ username }, 'User not found for deletion');
  }
}
