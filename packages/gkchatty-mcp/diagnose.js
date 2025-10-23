#!/usr/bin/env node

const axios = require('axios');
const { execSync } = require('child_process');

const API_URL = process.env.GKCHATTY_API_URL || 'http://localhost:4001';
const API_KEY = process.env.GKCHATTY_API_KEY;
const USERNAME = process.env.GKCHATTY_USERNAME || 'dev';
const PASSWORD = process.env.GKCHATTY_PASSWORD || 'dev123';

console.log('🔍 GKChatty MCP Diagnostics');
console.log('============================\n');

async function diagnose() {
  let status = {
    server: false,
    auth: false,
    search: false,
    mcp: false
  };

  // Check 1: Server connectivity
  console.log('1️⃣  Checking server connectivity...');
  try {
    await axios.get(`${API_URL}/health`, { timeout: 2000 });
    console.log(`   ✅ Server is running at ${API_URL}`);
    status.server = true;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log(`   ❌ Server is NOT running at ${API_URL}`);
      console.log('   📝 Start GKChatty with: cd /path/to/gkchatty && npm start');
    } else {
      console.log(`   ⚠️  Server might be running (no health endpoint)`);
      status.server = true;
    }
  }
  console.log();

  // Check 2: Authentication
  if (status.server) {
    console.log('2️⃣  Checking authentication...');
    
    if (API_KEY) {
      console.log(`   🔑 Using API Key: ${API_KEY.slice(0, 10)}...`);
      try {
        const response = await axios.post(`${API_URL}/api/chat`, {
          message: 'test',
          mode: 'search',
          stream: false
        }, {
          headers: { 'X-API-Key': API_KEY },
          timeout: 5000
        });
        console.log('   ✅ API Key authentication successful');
        status.auth = true;
      } catch (error) {
        console.log(`   ❌ API Key authentication failed: ${error.response?.status || error.message}`);
      }
    } else {
      console.log(`   👤 Using username/password: ${USERNAME}/****`);
      try {
        const response = await axios.post(`${API_URL}/api/auth/login`, {
          username: USERNAME,
          password: PASSWORD
        }, {
          timeout: 5000
        });
        console.log('   ✅ Username/password authentication successful');
        status.auth = true;
      } catch (error) {
        console.log(`   ❌ Authentication failed: ${error.response?.status || error.message}`);
        if (error.response?.status === 401) {
          console.log('   📝 Check GKCHATTY_USERNAME and GKCHATTY_PASSWORD');
        }
      }
    }
    console.log();
  }

  // Check 3: Search functionality
  if (status.auth) {
    console.log('3️⃣  Testing search functionality...');
    try {
      const token = API_KEY || (await axios.post(`${API_URL}/api/auth/login`, {
        username: USERNAME,
        password: PASSWORD
      })).data.token;

      const headers = API_KEY 
        ? { 'X-API-Key': token }
        : { Authorization: `Bearer ${token}` };

      const response = await axios.post(`${API_URL}/api/chat`, {
        message: 'test query',
        mode: 'search',
        stream: false
      }, {
        headers,
        timeout: 5000
      });
      
      console.log('   ✅ Search endpoint is working');
      status.search = true;
    } catch (error) {
      console.log(`   ❌ Search failed: ${error.message}`);
    }
    console.log();
  }

  // Check 4: MCP installation
  console.log('4️⃣  Checking MCP installation...');
  try {
    execSync('which gkchatty-mcp', { stdio: 'ignore' });
    console.log('   ✅ gkchatty-mcp is installed globally');
    status.mcp = true;
  } catch {
    console.log('   ❌ gkchatty-mcp is NOT installed');
    console.log('   📝 Install with: npm install -g .');
  }
  console.log();

  // Summary
  console.log('📊 Summary');
  console.log('----------');
  const allGood = Object.values(status).every(v => v);
  
  if (allGood) {
    console.log('✅ Everything is working! GKChatty MCP is ready to use.');
    console.log('\nTest in Claude Code:');
    console.log('  "Search gkchatty for [your query]"');
  } else {
    console.log('⚠️  Some issues need to be fixed:\n');
    
    if (!status.server) {
      console.log('1. Start GKChatty server:');
      console.log('   cd /path/to/gkchatty && npm start\n');
    }
    
    if (status.server && !status.auth) {
      console.log('2. Fix authentication:');
      if (!API_KEY) {
        console.log('   Option A: Set correct username/password:');
        console.log('     export GKCHATTY_USERNAME="your_username"');
        console.log('     export GKCHATTY_PASSWORD="your_password"\n');
        console.log('   Option B: Use API key:');
        console.log('     export GKCHATTY_API_KEY="gk_live_..."\n');
      } else {
        console.log('   Your API key might be invalid. Generate a new one.\n');
      }
    }
    
    if (!status.mcp) {
      console.log('3. Install MCP server globally:');
      console.log('   cd gkchatty-mcp-server && npm install -g .\n');
    }
  }
}

diagnose().catch(error => {
  console.error('Diagnostic failed:', error.message);
  process.exit(1);
});