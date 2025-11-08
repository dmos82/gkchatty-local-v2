/**
 * Test Storage Service
 *
 * Quick test to verify SQLite database initialization
 */

const { StorageService } = require('./src/services/storageService');
const path = require('path');

async function testStorageService() {
  console.log('🧪 Testing Storage Service...\n');

  try {
    // Initialize service with test database
    const service = new StorageService({
      dbPath: path.join(__dirname, 'test-gkchatty.db'),
      chromaPath: path.join(__dirname, 'test-chroma')
    });

    console.log('🚀 Initializing storage service...');
    await service.initialize();

    console.log('\n📊 Storage Info:');
    const info = await service.getInfo();
    console.log(JSON.stringify(info, null, 2));

    console.log('\n🏥 Health Check:');
    const health = await service.healthCheck();
    console.log(JSON.stringify(health, null, 2));

    console.log('\n✅ Storage service test complete!');

    // Test results
    console.log('\n📋 Test Results:');
    console.log(`  Mode: ${info.mode}`);
    console.log(`  Database Path: ${info.database.path}`);
    console.log(`  Database Size: ${info.database.size} bytes`);
    console.log(`  Users: ${info.counts.users}`);
    console.log(`  Documents: ${info.counts.documents}`);
    console.log(`  Projects: ${info.counts.projects}`);
    console.log(`  Active Provider: ${info.activeProvider?.name || 'None'}`);
    console.log(`  Health: ${health.healthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`);

    // Cleanup
    await service.close();
    console.log('\n🧹 Cleaned up test database');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run test
testStorageService();
