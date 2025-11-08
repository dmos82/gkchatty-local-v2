#!/usr/bin/env node

/**
 * Script to inject build information into the environment
 * This should be run as part of the build process
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Get the current git commit hash
let gitCommit = 'unknown';
try {
  gitCommit = execSync('git rev-parse HEAD').toString().trim();
  console.log(`[Build Info] Git commit: ${gitCommit}`);
} catch (error) {
  console.warn('[Build Info] Could not get git commit hash:', error);
}

// Get build timestamp
const buildTimestamp = new Date().toISOString();
console.log(`[Build Info] Build timestamp: ${buildTimestamp}`);

// Create or append to .env file with build info
const envPath = path.join(__dirname, '../../.env');
const envContent = `
# Build Information (auto-generated)
BUILD_TIMESTAMP=${buildTimestamp}
BUILD_GIT_COMMIT=${gitCommit}
`;

// Read existing .env content
let existingEnv = '';
try {
  existingEnv = fs.readFileSync(envPath, 'utf8');
} catch (error) {
  console.log('[Build Info] No existing .env file found, creating new one');
}

// Remove any existing build info lines
const cleanedEnv = existingEnv
  .split('\n')
  .filter(line => !line.startsWith('BUILD_TIMESTAMP=') && !line.startsWith('BUILD_GIT_COMMIT='))
  .join('\n');

// Write updated .env
fs.writeFileSync(envPath, cleanedEnv + envContent);
console.log('[Build Info] Build information written to .env file');

// Also write to a separate build-info.json file for reference
const buildInfo = {
  gitCommit,
  buildTimestamp,
  nodeVersion: process.version,
  platform: process.platform,
  arch: process.arch,
};

fs.writeFileSync(path.join(__dirname, '../../build-info.json'), JSON.stringify(buildInfo, null, 2));
console.log('[Build Info] Build information written to build-info.json');
