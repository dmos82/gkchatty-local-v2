/*
 * Utility helpers to determine whether the API should use local filesystem or S3.
 * Centralising this logic avoids duplicated env-var checks.
 */

export const isLocalStorage = (): boolean => {
  const fileStorageMode = (process.env.FILE_STORAGE_MODE || '').toLowerCase();
  const bucketName = (process.env.AWS_BUCKET_NAME || '').toLowerCase();

  // Explicit LOCAL mode via env OR bucket name set to "local".
  return fileStorageMode === 'local' || bucketName === 'local';
};

export const isS3Storage = (): boolean => !isLocalStorage();
