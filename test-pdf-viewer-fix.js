const axios = require('axios');

// Test if documents now include _id field after our fix
async function testPdfViewerFix() {
  const API_URL = 'http://localhost:6002';
  let authToken = null;

  console.log('=== Testing PDF Viewer Fix ===\n');

  try {
    // Step 1: Login
    console.log('1. Logging in as admin...');
    const loginResponse = await axios.post(`${API_URL}/api/auth/login`, {
      username: 'admin',
      password: 'TempPassword123!'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:6004'
      },
      withCredentials: true
    });

    // Extract auth token
    const cookies = loginResponse.headers['set-cookie'];
    if (cookies && cookies.length > 0) {
      const authCookie = cookies[0];
      authToken = authCookie.split('authToken=')[1].split(';')[0];
    }
    console.log('✓ Login successful!');

    // Step 2: Fetch documents list
    console.log('\n2. Fetching documents list...');
    const docsResponse = await axios.get(`${API_URL}/api/documents`, {
      headers: {
        'Cookie': `authToken=${authToken}`,
        'Origin': 'http://localhost:6004'
      }
    });

    if (docsResponse.data.success && docsResponse.data.documents) {
      const documents = docsResponse.data.documents;
      console.log(`✓ Retrieved ${documents.length} documents`);

      if (documents.length > 0) {
        // Check if documents have _id field
        console.log('\n3. Checking document structure:');
        const firstDoc = documents[0];
        console.log('First document fields:', Object.keys(firstDoc));
        console.log('Document details:');
        console.log('  - _id:', firstDoc._id || 'MISSING!');
        console.log('  - originalFileName:', firstDoc.originalFileName);
        console.log('  - status:', firstDoc.status);

        if (firstDoc._id) {
          console.log('\n✅ FIX SUCCESSFUL: Documents now include _id field!');

          // Step 3: Test fetching PDF view URL
          console.log('\n4. Testing PDF view endpoint...');
          const viewResponse = await axios.get(
            `${API_URL}/api/documents/view/${firstDoc._id}`,
            {
              headers: {
                'Cookie': `authToken=${authToken}`,
                'Origin': 'http://localhost:6004'
              }
            }
          );

          if (viewResponse.data.success && viewResponse.data.url) {
            console.log('✅ PDF view endpoint working!');
            console.log('  - Presigned URL generated:', viewResponse.data.url.substring(0, 50) + '...');
          } else {
            console.log('❌ PDF view endpoint returned unexpected format:', viewResponse.data);
          }
        } else {
          console.log('\n❌ FIX FAILED: _id field still missing from documents!');
        }
      } else {
        console.log('\nℹ️ No documents found. Upload a document first to test.');
      }
    } else {
      console.log('❌ Failed to fetch documents:', docsResponse.data);
    }

  } catch (error) {
    console.error('\n❌ Test failed!');
    if (error.response) {
      console.error('Error:', error.response.status, error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

testPdfViewerFix();