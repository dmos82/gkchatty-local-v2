const io = require('socket.io-client');

const API_URL = 'http://localhost:4001';

async function main() {
  console.log('=== Socket Disconnect Test ===\n');

  // Step 1: Login to get token
  console.log('1. Logging in as "dev"...');
  const loginRes = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'dev', password: 'dev123' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  console.log(`   Login success: ${loginData.success}`);
  console.log(`   Token: ${token ? token.substring(0, 30) + '...' : 'NULL'}\n`);

  if (!token) {
    console.log('ERROR: No token received');
    process.exit(1);
  }

  // Step 2: Connect socket
  console.log('2. Connecting socket...');
  const socket = io(API_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log(`   Socket connected! ID: ${socket.id}`);
  });

  socket.on('connect_error', (error) => {
    console.log(`   Socket connect error: ${error.message}`);
  });

  socket.on('presence:changed', (data) => {
    console.log(`   >> presence:changed event received:`, JSON.stringify(data));
  });

  // Wait for connection
  await new Promise((resolve) => {
    if (socket.connected) {
      resolve();
    } else {
      socket.once('connect', resolve);
    }
  });

  console.log('\n3. Socket connected. Waiting 2 seconds...\n');
  await new Promise((r) => setTimeout(r, 2000));

  // Step 3: Emit presence:update offline (like the frontend does)
  console.log('4. Emitting presence:update { status: "offline" }...');
  socket.emit('presence:update', { status: 'offline' });

  // Wait a bit for server to process
  await new Promise((r) => setTimeout(r, 500));

  // Step 4: Disconnect socket
  console.log('\n5. Disconnecting socket...');
  socket.disconnect();
  console.log(`   Socket disconnected. Connected: ${socket.connected}`);

  // Wait for backend to process
  console.log('\n6. Waiting 2 seconds for backend to process...\n');
  await new Promise((r) => setTimeout(r, 2000));

  // Step 5: Check presence via API
  console.log('7. Checking presence status via API...');
  const presenceRes = await fetch(`${API_URL}/api/conversations/users/online`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const presenceData = await presenceRes.json();
  console.log('   Online users:', JSON.stringify(presenceData, null, 2));

  console.log('\n=== Test Complete ===');
  console.log('Check backend logs for [Socket DISCONNECT] and [Socket PRESENCE] messages');

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
