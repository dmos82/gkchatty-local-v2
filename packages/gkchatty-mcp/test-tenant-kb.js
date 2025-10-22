#!/usr/bin/env node

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_URL = process.env.GKCHATTY_API_URL || 'http://localhost:3001';
const USERNAME = process.env.GKCHATTY_USERNAME || 'dev';
const PASSWORD = process.env.GKCHATTY_PASSWORD || 'dev123';

async function testTenantKBOperations() {
  console.log('🧪 Testing Tenant KB Operations');
  console.log('================================\n');
  
  try {
    // Step 1: Authenticate
    console.log('1️⃣ Authenticating...');
    const loginResponse = await axios.post(`${API_URL}/api/auth/login`, {
      username: USERNAME,
      password: PASSWORD,
    });
    
    const token = loginResponse.data.token;
    const user = loginResponse.data.user || { role: loginResponse.data.role };
    console.log(`✅ Authenticated as: ${USERNAME} (role: ${user.role})\n`);
    
    const headers = { Authorization: `Bearer ${token}` };
    
    // Step 2: List existing tenant KBs
    console.log('2️⃣ Listing existing tenant KBs...');
    try {
      const listResponse = await axios.get(`${API_URL}/api/admin/tenant-kb`, { headers });
      const kbs = listResponse.data.knowledgeBases || [];
      console.log(`Found ${kbs.length} tenant KB(s):`);
      kbs.forEach(kb => {
        console.log(`  - ${kb.name} (${kb._id})`);
      });
      console.log();
    } catch (error) {
      if (error.response?.status === 403) {
        console.log('⚠️  User is not admin - cannot list tenant KBs\n');
      } else {
        throw error;
      }
    }
    
    // Step 3: Create or find MCP KB (if admin)
    let tenantKBId = null;
    if (user.role === 'admin') {
      console.log('3️⃣ Creating/finding MCP tenant KB...');
      
      // Check if MCP KB exists
      const listResponse = await axios.get(`${API_URL}/api/admin/tenant-kb`, { headers });
      const existingKB = listResponse.data.knowledgeBases?.find(
        kb => kb.name === 'MCP Knowledge Base' || kb.slug === 'mcp-knowledge-base'
      );
      
      if (existingKB) {
        tenantKBId = existingKB._id;
        console.log(`✅ Found existing MCP KB: ${existingKB._id}\n`);
      } else {
        // Create new KB
        const createResponse = await axios.post(`${API_URL}/api/admin/tenant-kb`, {
          name: 'MCP Knowledge Base',
          description: 'Test knowledge base for MCP uploads',
          accessType: 'public',
          color: '#4A90E2',
          icon: '📚',
          shortName: 'MCP'
        }, { headers });
        
        tenantKBId = createResponse.data.knowledgeBase._id;
        console.log(`✅ Created new MCP KB: ${tenantKBId}\n`);
      }
      
      // Step 4: Test upload to tenant KB
      console.log('4️⃣ Testing document upload to tenant KB...');
      
      // Create a test file
      const testContent = `Test Document for MCP Tenant KB
      
This is a test document uploaded at ${new Date().toISOString()}
It contains some sample content to verify the upload functionality.

Key Features:
- Tenant KB support
- Named knowledge bases
- Admin-controlled uploads
- Better organization

This document should be searchable after upload.`;
      
      const testFilePath = path.join(__dirname, 'test-upload.txt');
      fs.writeFileSync(testFilePath, testContent);
      
      // Upload the file
      const formData = new FormData();
      formData.append('file', fs.createReadStream(testFilePath), 'test-upload.txt');
      
      try {
        const uploadResponse = await axios.post(
          `${API_URL}/api/admin/kb/${tenantKBId}/upload`,
          formData,
          {
            headers: {
              ...headers,
              ...formData.getHeaders()
            }
          }
        );
        
        console.log('✅ Document uploaded successfully!');
        console.log(`   Document ID: ${uploadResponse.data.documentId || uploadResponse.data.id || 'N/A'}`);
        console.log(`   Message: ${uploadResponse.data.message || 'Upload complete'}\n`);
      } catch (error) {
        console.log('❌ Upload failed:', error.response?.data?.message || error.message);
        console.log();
      }
      
      // Clean up test file
      fs.unlinkSync(testFilePath);
      
      // Step 5: List documents in the KB
      console.log('5️⃣ Listing documents in the KB...');
      try {
        const docsResponse = await axios.get(
          `${API_URL}/api/admin/tenant-kb/${tenantKBId}/documents`,
          { headers }
        );
        
        const documents = docsResponse.data.documents || [];
        console.log(`Found ${documents.length} document(s) in the KB:`);
        documents.slice(0, 5).forEach(doc => {
          console.log(`  - ${doc.fileName || doc.name || 'Unnamed'} (${doc._id})`);
        });
        console.log();
      } catch (error) {
        console.log('⚠️  Could not list documents:', error.response?.data?.message || error.message);
        console.log();
      }
      
    } else {
      console.log('⚠️  User is not admin - skipping tenant KB operations');
      console.log('   To test admin features, ensure the user has admin role\n');
    }
    
    // Step 6: Test regular user upload
    console.log('6️⃣ Testing regular user document upload...');
    
    const userTestContent = `User Document Test
    
This is a test document uploaded as a regular user at ${new Date().toISOString()}
It should be uploaded to the user's personal document collection.`;
    
    const userTestFilePath = path.join(__dirname, 'user-test-upload.txt');
    fs.writeFileSync(userTestFilePath, userTestContent);
    
    const userFormData = new FormData();
    userFormData.append('files', fs.createReadStream(userTestFilePath), 'user-test-upload.txt');
    userFormData.append('sourceType', 'user');
    
    try {
      const userUploadResponse = await axios.post(
        `${API_URL}/api/documents/upload`,
        userFormData,
        {
          headers: {
            ...headers,
            ...userFormData.getHeaders()
          }
        }
      );
      
      console.log('✅ User document uploaded successfully!');
      console.log(`   Response: ${JSON.stringify(userUploadResponse.data)}\n`);
    } catch (error) {
      console.log('❌ User upload failed:', error.response?.data?.message || error.message);
      console.log();
    }
    
    // Clean up test file
    fs.unlinkSync(userTestFilePath);
    
    console.log('✅ All tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data?.message || error.message);
    process.exit(1);
  }
}

// Run the test
testTenantKBOperations();