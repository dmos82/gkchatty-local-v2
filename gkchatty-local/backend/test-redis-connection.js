const redis = require('redis');
require('dotenv').config();

async function testRedis() {
  console.log('Testing Redis connection...');
  console.log('URL:', process.env.REDIS_URL?.replace(/:[^:@]+@/, ':****@'));

  const client = redis.createClient({
    url: process.env.REDIS_URL
  });

  client.on('error', err => console.error('Redis Client Error:', err));
  client.on('connect', () => console.log('Redis Client Connected'));

  try {
    await client.connect();
    console.log('✅ Successfully connected to Redis Cloud!');

    // Test operations
    await client.set('test:key', 'GKChatty Connected!');
    const value = await client.get('test:key');
    console.log('✅ Test read/write:', value);

    // Test rate limit key pattern
    await client.set('rl:test_user', '1', { EX: 60 });
    const rlValue = await client.get('rl:test_user');
    console.log('✅ Rate limit key test:', rlValue);

    // Clean up
    await client.del('test:key', 'rl:test_user');
    await client.quit();

    console.log('\n🎉 Redis is ready for GKChatty!');
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    process.exit(1);
  }
}

testRedis();