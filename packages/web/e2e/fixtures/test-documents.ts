/**
 * Test document fixtures for E2E tests
 */

import path from 'path';

export interface TestDocument {
  name: string;
  path: string;
  content: string;
  mimeType: string;
  expectedSearchKeywords: string[];
}

/**
 * Test documents for upload and RAG testing
 * These will be created as actual files in the fixtures directory
 */
export const TEST_DOCUMENTS = {
  pdf: {
    name: 'test-document.pdf',
    path: path.join(__dirname, 'files', 'test-document.pdf'),
    content: 'This is a test PDF document for E2E testing. It contains information about software testing methodologies and best practices.',
    mimeType: 'application/pdf',
    expectedSearchKeywords: ['testing', 'methodologies', 'best practices'],
  },

  excel: {
    name: 'test-spreadsheet.xlsx',
    path: path.join(__dirname, 'files', 'test-spreadsheet.xlsx'),
    content: 'Test spreadsheet with sample data',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    expectedSearchKeywords: ['spreadsheet', 'sample data'],
  },

  audio: {
    name: 'test-audio.mp3',
    path: path.join(__dirname, 'files', 'test-audio.mp3'),
    content: 'Test audio transcription content',
    mimeType: 'audio/mpeg',
    expectedSearchKeywords: ['audio', 'transcription'],
  },

  text: {
    name: 'test-document.txt',
    path: path.join(__dirname, 'files', 'test-document.txt'),
    content: 'This is a plain text test document for quick testing. Contains the secret keyword GOLDKEY for easy verification.',
    mimeType: 'text/plain',
    expectedSearchKeywords: ['GOLDKEY', 'quick testing', 'secret keyword'],
  },

  markdown: {
    name: 'test-document.md',
    path: path.join(__dirname, 'files', 'test-document.md'),
    content: 'This is a markdown test document for E2E testing. Contains the secret keyword GOLDKEY for easy verification.',
    mimeType: 'text/markdown',
    expectedSearchKeywords: ['markdown', 'test', 'GOLDKEY'],
  },

  tenantA: {
    name: 'tenant-a-document.txt',
    path: path.join(__dirname, 'files', 'tenant-a-document.txt'),
    content: 'This document belongs exclusively to Tenant A. It contains TENANT_A_SECRET_DATA that should never be visible to Tenant B.',
    mimeType: 'text/plain',
    expectedSearchKeywords: ['TENANT_A_SECRET_DATA', 'Tenant A'],
  },

  tenantB: {
    name: 'tenant-b-document.txt',
    path: path.join(__dirname, 'files', 'tenant-b-document.txt'),
    content: 'This document belongs exclusively to Tenant B. It contains TENANT_B_SECRET_DATA that should never be visible to Tenant A.',
    mimeType: 'text/plain',
    expectedSearchKeywords: ['TENANT_B_SECRET_DATA', 'Tenant B'],
  },
} as const;

/**
 * Helper to create actual test files in the fixtures/files directory
 */
export async function createTestFiles() {
  const fs = require('fs').promises;
  const filesDir = path.join(__dirname, 'files');

  // Create files directory if it doesn't exist
  await fs.mkdir(filesDir, { recursive: true });

  // Create text files
  await fs.writeFile(TEST_DOCUMENTS.text.path, TEST_DOCUMENTS.text.content);
  await fs.writeFile(TEST_DOCUMENTS.tenantA.path, TEST_DOCUMENTS.tenantA.content);
  await fs.writeFile(TEST_DOCUMENTS.tenantB.path, TEST_DOCUMENTS.tenantB.content);

  // Note: PDF, Excel, and Audio files will need to be created separately
  // For now, we'll rely on text files for most E2E tests
}

/**
 * Helper to check if test files exist
 */
export async function testFilesExist(): Promise<boolean> {
  const fs = require('fs').promises;
  try {
    await fs.access(TEST_DOCUMENTS.text.path);
    await fs.access(TEST_DOCUMENTS.tenantA.path);
    await fs.access(TEST_DOCUMENTS.tenantB.path);
    return true;
  } catch {
    return false;
  }
}
