import mongoose from 'mongoose';
import { config } from 'dotenv';
import * as pathModule from 'path';
import fetch from 'node-fetch';
import { getLogger } from '../utils/logger';
import User from '../models/UserModel';

// Configure environment variables
config({ path: pathModule.resolve(__dirname, '../../../../.env') });

const log = getLogger('verifyPersonaIntegration');

// Test configuration
const API_BASE_URL = 'http://localhost:3001';
const TEST_USER_CREDENTIALS = {
  username: 'testadmin',
  password: 'testpassword',
};

// Test personas with unique identifiers
const CAPTAIN_PERSONA = {
  name: 'Captain Log Test Persona',
  prompt:
    "You are the 'Captain's Log Persona'. Always begin every response with the exact phrase: 'Captain's Log, Stardate 42:' followed by your answer.",
  expectedPrefix: "Captain's Log, Stardate 42:",
};

const NAVIGATOR_PERSONA = {
  name: 'Navigator Test Persona',
  prompt: "You are the Navigator. Start responses with 'Course plotted:' followed by your answer.",
  expectedPrefix: 'Course plotted:',
};

interface TestResult {
  scenario: string;
  passed: boolean;
  details: string;
  response?: string;
}

class PersonaIntegrationVerifier {
  private authToken: string = '';
  private testResults: TestResult[] = [];
  private createdPersonaIds: string[] = [];

  async run(): Promise<void> {
    try {
      await mongoose.connect(process.env.MONGODB_URI!);
      log.info('Connected to MongoDB for verification');

      console.log('\n🧪 PERSONA INTEGRATION VERIFICATION STARTING...\n');

      // Step 1: Authenticate
      await this.authenticate();

      // Step 2: Clean up any existing test personas
      await this.cleanupTestPersonas();

      // Step 3: Run verification scenarios
      await this.runScenario1_ActivePersonaInfluencesResponse();
      await this.runScenario2_NoActivePersonaFallback();
      await this.runScenario3_DeletedActivePersonaFallback();

      // Step 4: Final cleanup
      await this.cleanupTestPersonas();

      // Step 5: Report results
      this.reportResults();
    } catch (error) {
      console.error('❌ VERIFICATION FAILED:', error);
      throw error;
    } finally {
      await mongoose.disconnect();
    }
  }

  private async authenticate(): Promise<void> {
    console.log('🔐 Authenticating as testadmin user...');

    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_USER_CREDENTIALS),
    });

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.status}`);
    }

    const data = (await response.json()) as any;
    if (!data.success) {
      throw new Error('Authentication failed');
    }

    // Extract token from Set-Cookie header
    const setCookieHeader = response.headers.get('set-cookie');
    if (!setCookieHeader) {
      throw new Error('No authentication cookie received');
    }

    // Parse the authToken from the cookie
    const authTokenMatch = setCookieHeader.match(/authToken=([^;]+)/);
    if (!authTokenMatch) {
      throw new Error('Authentication token not found in cookie');
    }

    this.authToken = authTokenMatch[1];
    console.log('✅ Authentication successful');
  }

  private async cleanupTestPersonas(): Promise<void> {
    console.log('🧹 Cleaning up test personas...');

    // Get all personas for the user
    const response = await fetch(`${API_BASE_URL}/api/personas`, {
      headers: { Cookie: `authToken=${this.authToken}` },
    });

    if (response.ok) {
      const data = (await response.json()) as any;
      const personas = data.personas || [];

      // Delete any test personas
      for (const persona of personas) {
        if (persona.name.includes('Test Persona')) {
          await this.deletePersona(persona._id);
        }
      }
    }

    // Also deactivate any active persona
    await this.deactivatePersona();
    console.log('✅ Cleanup completed');
  }

  private async runScenario1_ActivePersonaInfluencesResponse(): Promise<void> {
    console.log('\n📋 SCENARIO 1: Active User Persona Influences AI Response');
    console.log('Setting up Captain Persona...');

    try {
      // Create Captain Persona
      const captainPersonaId = await this.createPersona(
        CAPTAIN_PERSONA.name,
        CAPTAIN_PERSONA.prompt
      );
      this.createdPersonaIds.push(captainPersonaId);

      // Activate Captain Persona
      await this.activatePersona(captainPersonaId);

      // Send chat request
      console.log('Sending chat request with active Captain Persona...');
      const response = await this.sendChatRequest('What is our primary mission?');

      // Verify response starts with expected prefix
      const passed = response.startsWith(CAPTAIN_PERSONA.expectedPrefix);

      this.testResults.push({
        scenario: 'Scenario 1: Active Persona Usage',
        passed,
        details: passed
          ? `Response correctly starts with "${CAPTAIN_PERSONA.expectedPrefix}"`
          : `Response does not start with expected prefix. Got: "${response.substring(0, 50)}..."`,
        response,
      });

      console.log(passed ? '✅ SCENARIO 1 PASSED' : '❌ SCENARIO 1 FAILED');
    } catch (error) {
      this.testResults.push({
        scenario: 'Scenario 1: Active Persona Usage',
        passed: false,
        details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      console.log('❌ SCENARIO 1 FAILED');
    }
  }

  private async runScenario2_NoActivePersonaFallback(): Promise<void> {
    console.log('\n📋 SCENARIO 2: No Active Persona - Fallback to Main KB System Prompt');
    console.log('Deactivating all personas...');

    try {
      // Deactivate all personas
      await this.deactivatePersona();

      // Get main KB system prompt for reference - REMOVED as mainKbPrompt was unused
      // const mainKbPrompt = await this.getMainKbSystemPrompt();
      // console.log('Main KB System Prompt retrieved');

      // Send chat request
      console.log('Sending chat request with no active persona...');
      const response = await this.sendChatRequest('What is our primary mission?');

      // Verify response does NOT start with Captain's Log prefix
      const doesNotHaveCaptainPrefix = !response.startsWith(CAPTAIN_PERSONA.expectedPrefix);
      const doesNotHaveNavigatorPrefix = !response.startsWith(NAVIGATOR_PERSONA.expectedPrefix);
      const passed = doesNotHaveCaptainPrefix && doesNotHaveNavigatorPrefix;

      this.testResults.push({
        scenario: 'Scenario 2: Main KB Fallback',
        passed,
        details: passed
          ? 'Response correctly uses main KB prompt (no persona prefixes detected)'
          : `Response incorrectly contains persona prefix. Got: "${response.substring(0, 50)}..."`,
        response,
      });

      console.log(passed ? '✅ SCENARIO 2 PASSED' : '❌ SCENARIO 2 FAILED');
    } catch (error) {
      this.testResults.push({
        scenario: 'Scenario 2: Main KB Fallback',
        passed: false,
        details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      console.log('❌ SCENARIO 2 FAILED');
    }
  }

  private async runScenario3_DeletedActivePersonaFallback(): Promise<void> {
    console.log('\n📋 SCENARIO 3: Active Persona is Deleted - Fallback to Main KB Prompt');
    console.log('Setting up Navigator Persona...');

    try {
      // Create Navigator Persona
      const navigatorPersonaId = await this.createPersona(
        NAVIGATOR_PERSONA.name,
        NAVIGATOR_PERSONA.prompt
      );
      this.createdPersonaIds.push(navigatorPersonaId);

      // Activate Navigator Persona
      await this.activatePersona(navigatorPersonaId);

      // Verify it's working (quick test)
      console.log('Verifying Navigator Persona is active...');
      const testResponse = await this.sendChatRequest('Test navigation query');
      if (!testResponse.startsWith(NAVIGATOR_PERSONA.expectedPrefix)) {
        throw new Error('Navigator Persona activation verification failed');
      }
      console.log('✅ Navigator Persona confirmed active');

      // Delete the active Navigator Persona
      console.log('Deleting active Navigator Persona...');
      await this.deletePersona(navigatorPersonaId);

      // Verify user's activePersonaId is cleared
      const user = await User.findOne({ username: 'testadmin' });
      const activePersonaCleared = !user?.activePersonaId;

      // Send chat request after deletion
      console.log('Sending chat request after persona deletion...');
      const response = await this.sendChatRequest('What is our primary mission?');

      // Verify response does NOT start with Navigator prefix and falls back to main KB
      const doesNotHaveNavigatorPrefix = !response.startsWith(NAVIGATOR_PERSONA.expectedPrefix);
      const doesNotHaveCaptainPrefix = !response.startsWith(CAPTAIN_PERSONA.expectedPrefix);
      const passed = doesNotHaveNavigatorPrefix && doesNotHaveCaptainPrefix && activePersonaCleared;

      this.testResults.push({
        scenario: 'Scenario 3: Deleted Active Persona Fallback',
        passed,
        details: passed
          ? 'Response correctly falls back to main KB prompt after persona deletion, activePersonaId cleared'
          : `Issues detected - Navigator prefix: ${!doesNotHaveNavigatorPrefix}, Captain prefix: ${!doesNotHaveCaptainPrefix}, ActivePersonaId cleared: ${activePersonaCleared}`,
        response,
      });

      console.log(passed ? '✅ SCENARIO 3 PASSED' : '❌ SCENARIO 3 FAILED');
    } catch (error) {
      this.testResults.push({
        scenario: 'Scenario 3: Deleted Active Persona Fallback',
        passed: false,
        details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      console.log('❌ SCENARIO 3 FAILED');
    }
  }

  private async createPersona(name: string, prompt: string): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/api/personas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `authToken=${this.authToken}`,
      },
      body: JSON.stringify({ name, prompt }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create persona: ${response.status}`);
    }

    const data = (await response.json()) as any;
    if (!data.success || !data.persona?._id) {
      throw new Error('Create persona response missing ID');
    }

    console.log(`✅ Created persona: ${name} (ID: ${data.persona._id})`);
    return data.persona._id;
  }

  private async activatePersona(personaId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/personas/${personaId}/activate`, {
      method: 'PUT',
      headers: { Cookie: `authToken=${this.authToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to activate persona: ${response.status}`);
    }

    console.log(`✅ Activated persona: ${personaId}`);
  }

  private async deactivatePersona(): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/personas/deactivate`, {
      method: 'PUT',
      headers: { Cookie: `authToken=${this.authToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to deactivate persona: ${response.status}`);
    }

    console.log('✅ Deactivated all personas');
  }

  private async deletePersona(personaId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/personas/${personaId}`, {
      method: 'DELETE',
      headers: { Cookie: `authToken=${this.authToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete persona: ${response.status}`);
    }

    console.log(`✅ Deleted persona: ${personaId}`);

    // Remove from tracking array
    this.createdPersonaIds = this.createdPersonaIds.filter(id => id !== personaId);
  }

  private async getMainKbSystemPrompt(): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/api/personas/main-kb-system-prompt`, {
      headers: { Cookie: `authToken=${this.authToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to get main KB system prompt: ${response.status}`);
    }

    const data = (await response.json()) as any;
    return data.systemPrompt || '';
  }

  private async sendChatRequest(query: string): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/api/chats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `authToken=${this.authToken}`,
      },
      body: JSON.stringify({
        query,
        knowledgeBaseTarget: 'unified',
        history: [],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chat request failed: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as any;
    if (!data.success || !data.answer) {
      throw new Error('Chat response missing answer');
    }

    return data.answer;
  }

  private reportResults(): void {
    console.log('\n📊 VERIFICATION RESULTS SUMMARY');
    console.log('================================');

    let allPassed = true;

    for (const result of this.testResults) {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`\n${status} - ${result.scenario}`);
      console.log(`Details: ${result.details}`);

      if (result.response) {
        console.log(
          `Response: "${result.response.substring(0, 100)}${result.response.length > 100 ? '...' : ''}"`
        );
      }

      if (!result.passed) {
        allPassed = false;
      }
    }

    console.log('\n================================');
    if (allPassed) {
      console.log('🎉 ALL VERIFICATION SCENARIOS PASSED!');
      console.log('✅ Enhanced Persona Integration is working correctly');
    } else {
      console.log('❌ SOME VERIFICATION SCENARIOS FAILED');
      console.log('🔧 Review the failed scenarios and fix the integration');
    }
    console.log('================================\n');
  }
}

// Main execution
async function main() {
  const verifier = new PersonaIntegrationVerifier();
  await verifier.run();
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Verification script failed:', error);
    process.exit(1);
  });
}

export default PersonaIntegrationVerifier;
