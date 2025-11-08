// apps/api/src-test-utils/jest.global-teardown.ts
/* eslint-disable no-console, no-trailing-spaces */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

export default async function globalTeardown(): Promise<void> {
  console.log('🔧 [Teardown] Global teardown script initiated...');

  // Force close ALL mongoose connections before stopping the server
  try {
    console.log('🔧 [Teardown] Mongoose connection state:', mongoose.connection.readyState);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('✅ [Teardown] Mongoose disconnected successfully.');
    } else {
      console.log('ℹ️ [Teardown] Mongoose was already disconnected.');
    }
  } catch (error) {
    console.warn('⚠️ [Teardown] Error disconnecting mongoose:', error);
  }

  const instance = (global as any).__MONGOINSTANCE as MongoMemoryServer | undefined;
  if (instance) {
    try {
      await instance.stop();
      console.log('✅ [Teardown] In-memory MongoDB server stopped successfully.');
    } catch (error) {
      console.warn('⚠️ [Teardown] Error stopping MongoDB server:', error);
    }
  } else {
    console.log('ℹ️ [Teardown] No MongoDB instance found to stop.');
  }

  console.log('🏁 [Teardown] Global teardown script finished.');

  // Force exit after a short delay to ensure cleanup
  setTimeout(() => {
    console.log('🔚 [Teardown] Force exit timeout - ensuring clean process termination.');
    process.exit(0);
  }, 1000);
}
