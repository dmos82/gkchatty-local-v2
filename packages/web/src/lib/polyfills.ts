// Polyfill for Promise.withResolvers() - required for Node.js < 22
// This is needed for pdfjs-dist@4.8.69 to work on Node.js v20
// @ts-ignore - withResolvers not in standard TypeScript lib yet
if (typeof Promise.withResolvers === 'undefined') {
  // @ts-expect-error - Adding polyfill to Promise prototype
  Promise.withResolvers = function <T>() {
    let resolve: (value: T | PromiseLike<T>) => void;
    let reject: (reason?: unknown) => void;

    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    // @ts-expect-error - resolve and reject will be assigned by the Promise constructor
    return { promise, resolve, reject };
  };
}

export {};
