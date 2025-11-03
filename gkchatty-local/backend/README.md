# GKCHATTY API

This service powers document processing, embeddings, and chat for GKCHATTY.

---

## Local Development Storage Modes

The API can operate in two storage modes:

1. **AWS S3 (default for production)**  
   Provide valid `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and set `AWS_BUCKET_NAME` to your bucket.

2. **Local Filesystem (simple local dev, no AWS creds required)**  
   Set `AWS_BUCKET_NAME=local` **or** omit the AWS credential variables.  
   The helper will automatically read & write files to `LOCAL_FILE_STORAGE_DIR`.

```bash
# .env (local dev) - minimal example
AWS_BUCKET_NAME=local
LOCAL_FILE_STORAGE_DIR=./apps/api/system_kb_uploads
```

### `LOCAL_FILE_STORAGE_DIR`

- Path (absolute or relative) where PDF/text files are stored.
- If left blank the code defaults to:

```ts
path.resolve(process.cwd(), 'apps', 'api', 'system_kb_uploads');
```

> ℹ️ This is safe when you run `pnpm --filter @gkchatty/api dev` from the monorepo root **or** `pnpm dev` from `apps/api`.

### How it works

The storage helper in `src/utils/s3Helper.ts` decides at runtime whether to call AWS SDK or the local filesystem:

```ts
const shouldUseLocal = (bucket?: string) => useLocalFileStorage || bucket === 'local';
```

- Missing AWS creds **or** `bucket === 'local'` triggers the local fallback.
- Upload / download / delete operations transparently hit the directory above.

---

## Quick Verification Checklist

```bash
# 1. Seed your DB so doc.s3Bucket === 'local' and s3Key matches a file below system_kb_uploads

# 2. Start API
pnpm --filter @gkchatty/api dev

# 3. Hit the download endpoint
curl -I http://localhost:3001/api/system-kb/download/<doc_id>
# Expect: HTTP/1.1 200 OK & Content-Type: application/pdf
```

Check the API logs—you should see:

```text
[S3 Helper] AWS credentials missing – falling back to local file storage at ...
[Local Storage] Reading file from .../system_kb_uploads/<s3Key>
```

Open the web client (`http://localhost:3003`), click a source link, and confirm the PDF viewer loads.

---

## Further Reading

- `src/routes/systemKbRoutes.ts` – PDF download route.
- `src/utils/s3Helper.ts` – storage abstraction.
- `API_KEY_INTEGRATION.md` – external services setup.

## Environment Variables

### Required Environment Variables

The following environment variables must be set for the API to function correctly:

#### Security

- `ENCRYPTION_KEY` - **CRITICAL**: A 64-character hexadecimal string (32 bytes) used for AES-256 encryption of sensitive data like API keys stored in the database.
  - Example: `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`
  - Generate a secure key: `openssl rand -hex 32`
  - **WARNING**: Never use the default fallback key in production!

#### Database

- `MONGODB_URI` - MongoDB connection string
- `MONGODB_DB_NAME` - Database name (optional, defaults to connection string DB)

#### OpenAI

- `OPENAI_API_KEY` - OpenAI API key (can be overridden via admin panel)
- `OPENAI_PRIMARY_CHAT_MODEL` - Primary chat model (default: gpt-4o-mini)
- `OPENAI_FALLBACK_CHAT_MODEL` - Fallback chat model (default: gpt-3.5-turbo)
- `OPENAI_EMBEDDING_MODEL` - Embedding model (default: text-embedding-3-small)

#### Pinecone (Vector Database)

- `PINECONE_API_KEY` - Pinecone API key
- `PINECONE_ENVIRONMENT` - Pinecone environment
- `PINECONE_INDEX_NAME` - Pinecone index name

#### Storage

- `AWS_ACCESS_KEY_ID` - AWS access key (for S3 storage)
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `AWS_REGION` - AWS region
- `AWS_BUCKET_NAME` - S3 bucket name
- `IS_LOCAL_STORAGE` - Set to 'true' for local file storage (development)

#### Authentication

- `JWT_SECRET` - JWT secret for authentication tokens
- `JWT_REFRESH_SECRET` - JWT secret for refresh tokens

#### CORS

- `CORS_ALLOWED_ORIGINS` - Comma-separated list of allowed origins

### Setting Environment Variables for Production

For OnRender or similar platforms:

1. Navigate to your service's environment variables section
2. Add each required variable with its value
3. Ensure `ENCRYPTION_KEY` is a properly generated 64-character hex string
4. Save and redeploy the service

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## API Documentation

The API provides the following main endpoints:

- `/api/auth` - Authentication endpoints
- `/api/chats` - Chat functionality
- `/api/documents` - Document management
- `/api/admin` - Admin functionality
- `/api/personas` - Persona management
- `/api/settings` - User settings

For detailed API documentation, see the route files in `src/routes/`.
