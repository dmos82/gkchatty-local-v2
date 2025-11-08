import 'dotenv/config';
import axios from 'axios';

async function testFrontendFlowSimple() {
  try {
    console.log('[Test Frontend Flow Simple] Starting...');

    const baseURL = 'http://localhost:4001';

    // Step 1: Login as admin
    console.log('\n=== STEP 1: Admin Login ===');
    const loginResponse = await axios.post(`${baseURL}/api/auth/login`, {
      username: 'testadmin',
      password: 'testpassword',
    });

    console.log('Login successful:', loginResponse.data.success);

    // Extract the authToken cookie
    const setCookieHeader = loginResponse.headers['set-cookie'];
    let authToken = '';
    if (setCookieHeader) {
      const authCookie = setCookieHeader.find(cookie => cookie.startsWith('authToken='));
      if (authCookie) {
        authToken = authCookie.split(';')[0]; // Get just the "authToken=value" part
        console.log('Extracted auth cookie:', authToken.substring(0, 50) + '...');
      }
    }

    if (!authToken) {
      throw new Error('No auth token found in login response');
    }

    // Step 2: Get OpenAI config (what frontend sees on load)
    console.log('\n=== STEP 2: Get OpenAI Config (Frontend Load) ===');
    const getConfigResponse = await axios.get(`${baseURL}/api/admin/settings/openai-config`, {
      headers: {
        Cookie: authToken,
      },
    });

    console.log('Frontend receives on load:');
    console.log(JSON.stringify(getConfigResponse.data, null, 2));

    // Step 3: Save new OpenAI configuration
    console.log('\n=== STEP 3: Save OpenAI Configuration ===');
    const saveConfigResponse = await axios.put(
      `${baseURL}/api/admin/settings/openai-config`,
      {
        modelId: 'gpt-4o',
        apiKey: 'sk-real-test-key-abcdef123456789',
      },
      {
        headers: {
          Cookie: authToken,
        },
      }
    );

    console.log('Save response:');
    console.log(JSON.stringify(saveConfigResponse.data, null, 2));

    // Step 4: Get config after saving (reload simulation)
    console.log('\n=== STEP 4: Get Config After Save (Reload Simulation) ===');
    const getAfterSaveResponse = await axios.get(`${baseURL}/api/admin/settings/openai-config`, {
      headers: {
        Cookie: authToken,
      },
    });

    console.log('Frontend receives after save:');
    console.log(JSON.stringify(getAfterSaveResponse.data, null, 2));

    console.log('\n[Test Frontend Flow Simple] ✅ SUCCESS! All API endpoints working correctly.');
  } catch (error: any) {
    console.error('[Test Frontend Flow Simple] ❌ ERROR:', error.response?.data || error.message);
    process.exit(1);
  }
}

testFrontendFlowSimple();
