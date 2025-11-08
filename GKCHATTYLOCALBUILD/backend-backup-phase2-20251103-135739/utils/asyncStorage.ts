import { AsyncLocalStorage } from 'async_hooks';

interface AppAsyncStore extends Map<string, any> {}

export const als = new AsyncLocalStorage<AppAsyncStore>();
