/**
 * Test Embedding Service
 *
 * Quick test to verify MPS detection and model scanning
 */

const { EmbeddingService } = require('./src/services/embeddingService');

async function testEmbeddingService() {
  console.log('🧪 Testing Embedding Service...\n');

  try {
    // Initialize service
    const service = new EmbeddingService({
      device: 'auto'
    });

    await service.initialize();

    console.log('\n📊 Service Info:');
    const info = service.getInfo();
    console.log(JSON.stringify(info, null, 2));

    console.log('\n⚡ Performance Estimate:');
    const performance = service.estimatePerformance();
    console.log(JSON.stringify(performance, null, 2));

    console.log('\n✅ Embedding service test complete!');

    // Test results
    console.log('\n📋 Test Results:');
    console.log(`  Device: ${info.device}`);
    console.log(`  MPS Enabled: ${info.mpsEnabled ? '✅ YES' : '❌ NO'}`);
    console.log(`  Available Models: ${info.availableModels}`);
    console.log(`  Recommended Model: ${info.recommendedModel || 'None'}`);
    console.log(`  Status: ${info.status}`);

    if (info.mpsEnabled) {
      console.log('\n🚀 M2 MPS acceleration detected!');
      console.log('   Expected performance: 50-100ms per embedding');
    } else {
      console.log('\n⚠️  CPU mode (MPS not available)');
      console.log('   Expected performance: 500ms per embedding');
    }

    if (info.availableModels === 0) {
      console.log('\n⚠️  No embedding models found!');
      console.log('   To download a model:');
      console.log('   1. Install huggingface-cli: pip install huggingface-hub');
      console.log('   2. Download nomic-embed-text: huggingface-cli download nomai-ai/nomic-embed-text-v1.5');
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run test
testEmbeddingService();
