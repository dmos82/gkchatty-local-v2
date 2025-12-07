const { io } = require('socket.io-client');

const API_URL = process.env.API_URL || 'http://localhost:4001';

// Admin credentials - use 'dev' as a known admin user
const ADMIN_USER = { username: 'dev', password: 'dev123' };

// Test users to create and log in
const testUsers = [
  { username: 'imtest1', password: 'Password123!' },
  { username: 'imtest2', password: 'Password123!' },
  { username: 'imtest3', password: 'Password123!' },
  { username: 'imtest4', password: 'Password123!' },
  { username: 'imtest5', password: 'Password123!' },
];

const sockets = [];
let adminToken = null;

async function loginAdmin() {
  console.log('Logging in as admin...');
  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ADMIN_USER),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Admin login failed');
    }

    const data = await response.json();
    console.log('  Admin logged in successfully');
    return data.token;
  } catch (error) {
    console.error('  Admin login error:', error.message);
    return null;
  }
}

async function createUserViaAdmin(token, username, password) {
  try {
    const response = await fetch(`${API_URL}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        username,
        password,
        email: `${username}@test.local`,
        role: 'user',
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`  Created user ${username}`);
      return true;
    } else if (data.message && data.message.includes('already exists')) {
      console.log(`  User ${username} already exists`);
      return true; // User exists, can proceed to login
    } else {
      console.log(`  Failed to create ${username}:`, data.message || data.error);
      return false;
    }
  } catch (error) {
    console.error(`  Error creating ${username}:`, error.message);
    return false;
  }
}

async function loginUser(username, password) {
  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Login failed');
    }

    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error(`  Login error for ${username}:`, error.message);
    return null;
  }
}

async function connectSocket(token, username) {
  return new Promise((resolve, reject) => {
    const socket = io(API_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log(`  ${username} connected (socket: ${socket.id})`);
      // Set presence to online
      socket.emit('presence:update', { status: 'online' });
      sockets.push({ socket, username });
      resolve(socket);
    });

    socket.on('connect_error', (err) => {
      console.error(`  ${username} connection error:`, err.message);
      reject(err);
    });

    // Timeout after 10 seconds
    setTimeout(() => reject(new Error('Connection timeout')), 10000);
  });
}

async function main() {
  console.log('=== Test Online Users Script ===\n');
  console.log(`Connecting to: ${API_URL}\n`);

  // Step 1: Login as admin
  adminToken = await loginAdmin();
  if (!adminToken) {
    console.error('Failed to login as admin. Exiting.');
    process.exit(1);
  }

  // Step 2: Create test users via admin API
  console.log('\nCreating test users via admin API...');
  for (const user of testUsers) {
    await createUserViaAdmin(adminToken, user.username, user.password);
  }

  // Step 3: Login each user and connect socket
  console.log('\nLogging in test users and connecting sockets...');
  for (const user of testUsers) {
    console.log(`Logging in ${user.username}...`);
    const token = await loginUser(user.username, user.password);

    if (token) {
      try {
        await connectSocket(token, user.username);
      } catch (err) {
        console.error(`  Failed to connect socket for ${user.username}:`, err.message);
      }
    }
  }

  console.log(`\n=== ${sockets.length} users now online ===`);
  console.log('Users:', sockets.map(s => s.username).join(', '));
  console.log('\nKeeping connections open. Press Ctrl+C to disconnect and exit.\n');

  // Vary presence status for some users after a delay
  if (sockets.length >= 3) {
    setTimeout(() => {
      sockets[1]?.socket.emit('presence:update', { status: 'away' });
      console.log(`${sockets[1]?.username} set to AWAY`);
    }, 3000);

    setTimeout(() => {
      sockets[2]?.socket.emit('presence:update', { status: 'busy' });
      console.log(`${sockets[2]?.username} set to BUSY`);
    }, 4000);
  }

  // Keep the script running
  process.on('SIGINT', () => {
    console.log('\nDisconnecting all users...');
    sockets.forEach(({ socket, username }) => {
      socket.disconnect();
      console.log(`  ${username} disconnected`);
    });
    process.exit(0);
  });
}

main().catch(console.error);
