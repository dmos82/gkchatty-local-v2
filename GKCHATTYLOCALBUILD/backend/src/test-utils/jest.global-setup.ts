// apps/api/src-test-utils/jest.global-setup.ts
/* eslint-disable no-trailing-spaces */
// Start an in-memory MongoDB server before Jest test run and expose its URI via environment variable.
import { MongoMemoryServer } from 'mongodb-memory-server';

export default async function globalSetup(): Promise<void> {
  const instance = await MongoMemoryServer.create();
  // Store the instance on the Node global object so we can access it in globalTeardown.
  (global as any).__MONGOINSTANCE = instance;
  process.env.MONGO_URI = instance.getUri();
  // eslint-disable-next-line no-console -- Helpful log during CI runs
  console.log(`Jest GlobalSetup: In-memory MongoDB started at ${process.env.MONGO_URI}`);
}
