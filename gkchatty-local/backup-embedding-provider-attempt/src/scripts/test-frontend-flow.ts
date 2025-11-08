import 'dotenv/config';
import axios from 'axios';

// Create axios instance with cookie support
const axiosInstance = axios.create({
  withCredentials: true,
  timeout: 10000,
});

async function testFrontendFlow() {
  try {
    console.log('[Test Frontend Flow] Starting complete frontend simulation...');

    const baseURL = 'http://localhost:4001';

    // Step 1: Login as admin
    console.log('\n=== STEP 1: Admin Login ===');
    const loginResponse = await axiosInstance.post(`${baseURL}/api/auth/login`, {
      username: 'testadmin',
      password: 'testpassword',
    });

    console.log('Login response:', JSON.stringify(loginResponse.data, null, 2));
    console.log('Login cookies set:', loginResponse.headers['set-cookie']);

    // Step 2: Get OpenAI config (what frontend sees on load)
    console.log('\n=== STEP 2: Get OpenAI Config (Frontend Load) ===');
    const getConfigResponse = await axiosInstance.get(
      `${baseURL}/api/admin/settings/openai-config`
    );

    console.log('Frontend receives on load:', JSON.stringify(getConfigResponse.data, null, 2));

    // Step 3: Save new OpenAI configuration
    console.log('\n=== STEP 3: Save OpenAI Configuration ===');
    const saveConfigResponse = await axiosInstance.post(
      `${baseURL}/api/admin/settings/openai-config`,
      {
        modelId: 'gpt-4o',
        apiKey: 'sk-real-test-key-abcdef123456789',
      }
    );

    console.log('Save response:', JSON.stringify(saveConfigResponse.data, null, 2));

    // Step 4: Get config after saving (reload simulation)
    console.log('\n=== STEP 4: Get Config After Save (Reload Simulation) ===');
    const getAfterSaveResponse = await axiosInstance.get(
      `${baseURL}/api/admin/settings/openai-config`
    );

    console.log(
      'Frontend receives after save:',
      JSON.stringify(getAfterSaveResponse.data, null, 2)
    );

    // Step 5: Clear API key only
    console.log('\n=== STEP 5: Clear API Key Only ===');
    const clearKeyResponse = await axiosInstance.post(
      `${baseURL}/api/admin/settings/openai-config`,
      {
        apiKey: '',
      }
    );

    console.log('Clear key response:', JSON.stringify(clearKeyResponse.data, null, 2));

    // Step 6: Get config after clearing key
    console.log('\n=== STEP 6: Get Config After Clearing Key ===');
    const getAfterClearResponse = await axiosInstance.get(
      `${baseURL}/api/admin/settings/openai-config`
    );

    console.log(
      'Frontend receives after clear:',
      JSON.stringify(getAfterClearResponse.data, null, 2)
    );

    console.log('\n[Test Frontend Flow] Complete! All API endpoints working correctly.');
  } catch (error: any) {
    console.error('[Test Frontend Flow] Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

testFrontendFlow();
