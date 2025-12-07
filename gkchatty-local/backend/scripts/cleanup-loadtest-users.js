const axios = require('axios');

const API_URL = 'https://staging-gk-chatty.onrender.com';
const ADMIN_USERNAME = 'dev';
const ADMIN_PASSWORD = '123123';

async function cleanup() {
  console.log('Authenticating as admin...');
  
  // Login as admin
  const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD
  });
  
  const token = loginRes.data.token;
  console.log('Authenticated successfully');
  
  const api = axios.create({
    baseURL: API_URL,
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  // Get all users
  const usersRes = await api.get('/api/admin/users');
  const users = usersRes.data.users || usersRes.data;
  
  // Filter load test users
  const loadTestUsers = users.filter(u => u.username.startsWith('loadtest_user_'));
  console.log(`Found ${loadTestUsers.length} load test users to delete`);
  
  // Delete each one
  for (const user of loadTestUsers) {
    try {
      await api.delete(`/api/admin/users/${user._id}`);
      console.log(`✓ Deleted: ${user.username}`);
    } catch (err) {
      console.log(`✗ Failed to delete ${user.username}: ${err.message}`);
    }
  }
  
  console.log('\nCleanup complete!');
}

cleanup().catch(console.error);
