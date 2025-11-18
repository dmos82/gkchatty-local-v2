# Netlify Deployment Guide - GKChatty Local

**Last Updated:** 2025-11-14
**Target Platform:** Netlify
**Repository:** https://github.com/dmos82/gkchatty-local-v2

---

## Overview

This guide covers deploying GKChatty Local to Netlify for staging/production environments. The deployment uses:

- **Serverless Backend:** Netlify Functions
- **Static Frontend:** Next.js static export (SSG)
- **Cloud Services:** MongoDB Atlas + Pinecone + OpenAI

---

## Prerequisites

### Required Accounts

1. **Netlify Account** (free or paid)
2. **MongoDB Atlas** (free M0 cluster or higher)
3. **Pinecone** (free tier or paid)
4. **OpenAI** (API access with billing enabled)
5. **GitHub** (repository access)

### Required Tools

- Git (for pushing code)
- Node.js 18+ (for local testing)
- MongoDB Compass (optional, for database management)

---

## Initial Setup

### 1. MongoDB Atlas Configuration

**Create Production Database:**

```bash
# 1. Sign in to MongoDB Atlas
https://cloud.mongodb.com

# 2. Create new cluster (or use existing)
- Cluster Name: gkchatty-production
- Provider: AWS
- Region: us-east-1 (match Pinecone region)
- Tier: M0 (free) or higher

# 3. Create database user
- Username: gkchatty-app
- Password: <generate strong password>
- Role: readWrite on gkchatty database

# 4. Configure Network Access
- Add IP: 0.0.0.0/0 (allow all - Netlify uses dynamic IPs)
- Or use Netlify's IP ranges if available

# 5. Get connection string
mongodb+srv://gkchatty-app:<password>@gkchatty-production.xxxxx.mongodb.net/gkchatty?retryWrites=true&w=majority
```

**Initialize Collections:**

```javascript
// Connect with Compass or mongosh
use gkchatty

// Collections will be auto-created by Mongoose
// But you can create indexes manually:
db.users.createIndex({ email: 1 }, { unique: true })
db.users.createIndex({ username: 1 }, { unique: true })
db.documents.createIndex({ userId: 1 })
db.chatsessions.createIndex({ userId: 1 })
```

### 2. Pinecone Configuration

**Create Production Index:**

```bash
# 1. Sign in to Pinecone
https://app.pinecone.io

# 2. Create new index
- Name: gkchatty-production
- Dimensions: 1536 (for OpenAI text-embedding-3-small)
- Metric: cosine
- Pod Type: p1.x1 (starter) or higher
- Region: us-east-1 (match MongoDB)

# 3. Get API credentials
- API Key: pc-xxxxxxxxxxxx
- Environment: us-east-1
- Index Name: gkchatty-production
```

### 3. OpenAI Configuration

**Set Up API Access:**

```bash
# 1. Sign in to OpenAI
https://platform.openai.com

# 2. Create API key
- Navigate to API Keys
- Create new secret key
- Copy: sk-xxxxxxxxxxxxxxxxxxxxx

# 3. Enable billing
- Add payment method
- Set usage limits (recommended)

# 4. Verify access to required models
- gpt-4o-mini (chat)
- gpt-3.5-turbo (fallback)
- text-embedding-3-small (embeddings)
```

---

## Repository Configuration

### Branch Strategy

```
main          → Production deployment (Netlify)
staging       → Staging deployment (Netlify)
local-ollama-dev → Local development (NOT for deployment)
```

**CRITICAL:** Do NOT deploy `local-ollama-dev` to Netlify - it contains local-only features (Ollama) that won't work in serverless environment.

### Netlify Configuration File

Ensure `netlify.toml` exists at repo root:

```toml
[build]
  base = "gkchatty-local"
  command = "cd backend && npm install && cd ../frontend && npm install && npm run build"
  publish = "frontend/out"

[build.environment]
  NODE_VERSION = "18"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

**Key Settings:**
- `base`: Directory containing the app
- `command`: Build command (install deps + build frontend)
- `publish`: Static files directory
- `redirects`: API routes to serverless functions

### Package.json Scripts

Ensure `frontend/package.json` has:

```json
{
  "scripts": {
    "dev": "next dev -p 4003",
    "build": "next build && next export",
    "start": "next start",
    "lint": "next lint"
  }
}
```

**Note:** `next export` creates static files for Netlify.

---

## Netlify Deployment

### Option 1: Deploy via Netlify Dashboard

**Step 1: Connect Repository**

```bash
# 1. Sign in to Netlify
https://app.netlify.com

# 2. Click "Add new site" → "Import an existing project"

# 3. Choose GitHub

# 4. Authorize Netlify to access your repo

# 5. Select repository: dmos82/gkchatty-local-v2
```

**Step 2: Configure Build Settings**

```bash
# Base directory: gkchatty-local
# Build command: cd backend && npm install && cd ../frontend && npm install && npm run build
# Publish directory: frontend/out
# Production branch: main
```

**Step 3: Set Environment Variables**

Navigate to **Site settings → Environment variables** and add:

```bash
# Core
NODE_ENV=production
PORT=4001
JWT_SECRET=<generate-strong-secret>

# MongoDB Atlas
MONGODB_URI=mongodb+srv://gkchatty-app:<password>@gkchatty-production.xxxxx.mongodb.net/gkchatty

# Pinecone
PINECONE_API_KEY=pc-xxxxxxxxxxxx
PINECONE_ENVIRONMENT=us-east-1
PINECONE_INDEX_NAME=gkchatty-production

# OpenAI
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxx
OPENAI_PRIMARY_CHAT_MODEL=gpt-4o-mini
OPENAI_FALLBACK_CHAT_MODEL=gpt-3.5-turbo
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Storage
GKCHATTY_STORAGE=cloud

# AWS S3 (if using)
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=<your-key>
AWS_SECRET_ACCESS_KEY=<your-secret>
AWS_BUCKET_NAME=<your-bucket>
```

**Step 4: Deploy**

```bash
# Click "Deploy site"
# Netlify will:
# 1. Clone your repo
# 2. Run npm install in backend and frontend
# 3. Run npm run build (Next.js build + export)
# 4. Deploy static files to CDN
# 5. Create serverless functions for API routes

# Monitor build logs in real-time
```

**Step 5: Verify Deployment**

```bash
# 1. Check build logs for errors
# 2. Visit your site URL: https://your-site.netlify.app
# 3. Test health endpoint: https://your-site.netlify.app/api/health
# 4. Try logging in with test account
```

### Option 2: Deploy via Netlify CLI

**Install Netlify CLI:**

```bash
npm install -g netlify-cli
```

**Login and Deploy:**

```bash
# 1. Login to Netlify
netlify login

# 2. Link repository
cd /path/to/gkchatty-local
netlify init

# Follow prompts:
# - Connect to Git remote
# - Choose team
# - Choose site name
# - Set build command
# - Set publish directory

# 3. Set environment variables
netlify env:set NODE_ENV production
netlify env:set JWT_SECRET your-secret
netlify env:set MONGODB_URI "mongodb+srv://..."
netlify env:set PINECONE_API_KEY "pc-..."
netlify env:set OPENAI_API_KEY "sk-..."
# ... (repeat for all env vars)

# 4. Deploy
netlify deploy --prod
```

---

## Environment-Specific Configurations

### Staging Environment

```bash
# Create staging branch
git checkout -b staging

# Push to GitHub
git push -u origin staging

# In Netlify Dashboard:
# 1. Site settings → Build & deploy → Deploy contexts
# 2. Branch deploys: staging
# 3. Set staging-specific env vars (if different from production)

# Staging URL: https://staging--your-site.netlify.app
```

### Production Environment

```bash
# Production deploys from main branch automatically

# To promote staging to production:
git checkout main
git merge staging
git push origin main

# Netlify auto-deploys main branch
```

---

## Post-Deployment Verification

### 1. Health Check

```bash
curl https://your-site.netlify.app/api/health
# Expected:
{
  "status": "healthy",
  "timestamp": "2025-11-14T20:00:00Z",
  "services": {
    "mongodb": "connected",
    "pinecone": "connected",
    "openai": "connected"
  }
}
```

### 2. Authentication Flow

```bash
# 1. Visit homepage
https://your-site.netlify.app

# 2. Register new account
- Click "Sign Up"
- Enter username, email, password
- Verify redirect to chat page

# 3. Logout
- Click profile → Logout
- Verify redirect to login page

# 4. Login
- Enter credentials
- Verify redirect to chat page
```

### 3. Document Upload

```bash
# 1. Upload test PDF
- Navigate to Documents
- Upload small PDF file
- Verify upload success message
- Check document appears in list

# 2. Verify in MongoDB Atlas
- Connect to database
- Check documents collection has new entry

# 3. Verify in Pinecone
- Check index stats show new vectors
```

### 4. Chat Functionality

```bash
# 1. Send simple message (no RAG)
- Open chat
- Type "Hello, how are you?"
- Verify response from GPT-4o-mini

# 2. Send message with RAG
- Upload document
- Ask question about document content
- Verify response includes context from document
```

---

## Troubleshooting

### Build Fails

**Error:** `MODULE_NOT_FOUND`

```bash
# Solution: Ensure all dependencies in package.json
cd backend
npm install
cd ../frontend
npm install

# Commit package-lock.json files
git add backend/package-lock.json frontend/package-lock.json
git commit -m "Update package-lock files"
git push
```

**Error:** `Next.js build failed`

```bash
# Check TypeScript errors
cd frontend
npm run lint

# Fix any errors, then rebuild
npm run build
```

### Deployment Succeeds but Site Shows 404

**Check:**
1. Publish directory is correct: `frontend/out`
2. Build command runs `next export`
3. Redirects configured in `netlify.toml`

**Fix:**

```toml
# Ensure this redirect exists in netlify.toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### API Endpoints Return 500

**Check Environment Variables:**

```bash
# In Netlify dashboard:
# Site settings → Environment variables

# Verify all required variables are set:
- MONGODB_URI
- PINECONE_API_KEY
- OPENAI_API_KEY
- JWT_SECRET

# Check function logs:
# Netlify dashboard → Functions → View logs
```

**Common Issues:**
- MongoDB URI has special characters not URL-encoded
- Pinecone API key is invalid or expired
- OpenAI API key lacks billing enabled

### MongoDB Connection Timeout

**Error:** `MongooseServerSelectionError: connection timed out`

**Solutions:**

```bash
# 1. Check MongoDB Atlas Network Access
- Add 0.0.0.0/0 to IP whitelist
- Or add Netlify IP ranges

# 2. Verify connection string format
mongodb+srv://username:password@cluster.xxxxx.mongodb.net/database?retryWrites=true&w=majority

# 3. URL-encode password if it contains special characters
# Example: p@ssw0rd → p%40ssw0rd
```

### Pinecone Errors

**Error:** `PineconeConfigurationError`

```bash
# Verify environment variables:
PINECONE_API_KEY=pc-xxxxx (not just xxxxx)
PINECONE_ENVIRONMENT=us-east-1
PINECONE_INDEX_NAME=gkchatty-production (exact match)

# Check index exists:
# 1. Login to Pinecone dashboard
# 2. Verify index name matches exactly
# 3. Verify dimensions = 1536
```

### OpenAI Rate Limits

**Error:** `Rate limit exceeded`

```bash
# Solutions:
# 1. Enable billing in OpenAI account
# 2. Increase rate limits in OpenAI dashboard
# 3. Implement request queuing in backend (future)
# 4. Use cheaper models (gpt-3.5-turbo instead of gpt-4o-mini)
```

---

## Performance Optimization

### CDN Configuration

```bash
# Netlify automatically uses CDN for static files
# No additional configuration needed

# To verify:
curl -I https://your-site.netlify.app
# Look for: x-nf-request-id (Netlify CDN header)
```

### Function Timeout

```bash
# Default: 10 seconds
# To increase (in netlify.toml):

[functions]
  timeout = 30  # Max 30 seconds for Pro plan
```

### Caching Strategy

```bash
# Static assets cached automatically by Netlify CDN

# API responses: Implement in code
# backend/src/middleware/cache.ts (future)
```

---

## Monitoring & Logging

### Netlify Analytics

```bash
# Enable in dashboard:
# Site settings → Analytics → Enable

# Provides:
# - Page views
# - Unique visitors
# - Bandwidth usage
# - Top pages
```

### Function Logs

```bash
# View in dashboard:
# Functions → [function-name] → Logs

# Or via CLI:
netlify functions:log api-chat
```

### External Monitoring (Recommended)

**Uptime Monitoring:**
- [UptimeRobot](https://uptimerobot.com) (free)
- [Pingdom](https://www.pingdom.com)
- [StatusCake](https://www.statuscake.com)

**Application Monitoring:**
- [Sentry](https://sentry.io) (error tracking)
- [LogRocket](https://logrocket.com) (session replay)
- [Datadog](https://www.datadoghq.com) (full APM)

---

## Security Best Practices

### Environment Variables

```bash
# ✅ DO:
- Use Netlify environment variables (encrypted at rest)
- Rotate JWT_SECRET regularly
- Use different secrets for staging vs production

# ❌ DON'T:
- Commit .env files to Git
- Share API keys in chat/email
- Use same secrets across environments
```

### HTTPS

```bash
# Netlify provides free HTTPS via Let's Encrypt
# Automatically enabled - no configuration needed

# To verify:
curl -I https://your-site.netlify.app
# Look for: strict-transport-security header
```

### Authentication

```bash
# Current: JWT with httpOnly cookies
# Future improvements:
- [ ] Add CSRF protection
- [ ] Implement rate limiting
- [ ] Add two-factor authentication
- [ ] Session timeout warnings
```

---

## Rollback Procedure

### If Deployment Fails

```bash
# Option 1: Rollback via Dashboard
# 1. Deploys → Select previous deploy
# 2. Click "Publish deploy"

# Option 2: Rollback via Git
git revert HEAD
git push origin main

# Option 3: Deploy specific commit
netlify deploy --prod --message "Rollback to stable version"
```

### If Deployment Succeeds but Site Broken

```bash
# 1. Check function logs for errors
# 2. Verify environment variables
# 3. Test health endpoint
# 4. If critical: rollback to previous deploy
# 5. Fix issue locally, then redeploy
```

---

## Cost Estimation

### Netlify

- **Free Tier:** 100GB bandwidth, 300 build minutes/month
- **Pro:** $19/month - 1TB bandwidth, unlimited build minutes
- **Recommended:** Start with free, upgrade if needed

### MongoDB Atlas

- **M0 (Free):** 512MB storage - Good for development/staging
- **M10:** $57/month - 10GB storage - Minimum for production
- **Recommended:** M0 for staging, M10+ for production

### Pinecone

- **Starter:** Free - 1M vectors, 1 pod
- **Standard:** $70/month - 10M vectors, 1 pod
- **Recommended:** Free for development, Standard for production

### OpenAI

- **Pay-as-you-go:**
  - gpt-4o-mini: $0.15/1M input tokens, $0.60/1M output tokens
  - text-embedding-3-small: $0.02/1M tokens
- **Typical cost:** $20-100/month depending on usage

**Total Monthly Cost (Production):**
- Minimal: $0 (all free tiers, usage-based OpenAI)
- Recommended: $146/month (Netlify Free, MongoDB M10, Pinecone Standard, OpenAI ~$20)
- Enterprise: $500+/month (higher tiers + increased usage)

---

## Custom Domain Setup

### Add Custom Domain

```bash
# 1. Purchase domain (Namecheap, GoDaddy, etc.)

# 2. In Netlify dashboard:
# Site settings → Domain management → Add custom domain

# 3. Enter your domain: gkchatty.com

# 4. Configure DNS:
# Option A: Use Netlify DNS (recommended)
# - Update nameservers at domain registrar
# - Netlify handles everything

# Option B: External DNS
# - Add A record: 75.2.60.5
# - Add CNAME: www → your-site.netlify.app

# 5. Enable HTTPS (automatic)
```

### Verify Custom Domain

```bash
curl https://gkchatty.com/api/health
# Should return health check response
```

---

## CI/CD Pipeline

### Automatic Deployments

```bash
# Already configured by default:
# 1. Push to main → Auto-deploy to production
# 2. Push to staging → Auto-deploy to staging
# 3. Pull request → Deploy preview

# No additional configuration needed
```

### Deploy Previews

```bash
# Netlify creates preview URL for each PR
# Example: https://deploy-preview-123--your-site.netlify.app

# Use for:
# - Testing features before merge
# - QA reviews
# - Client previews
```

### Build Notifications

```bash
# Configure in dashboard:
# Site settings → Build & deploy → Deploy notifications

# Options:
# - Email on deploy success/failure
# - Slack integration
# - GitHub commit status
# - Webhook to custom endpoint
```

---

## Backup Strategy

### MongoDB Backups

```bash
# MongoDB Atlas auto-backups (M10+ clusters):
# - Continuous backups (point-in-time recovery)
# - Snapshots every 6 hours
# - Retention: 2 days (configurable)

# Manual backup:
mongodump --uri="mongodb+srv://..." --out=/backups/gkchatty-$(date +%Y%m%d)
```

### Pinecone Backups

```bash
# No built-in backup feature
# Strategy: Store document embeddings in MongoDB as fallback
# Can re-index from MongoDB if Pinecone data lost
```

### Code Backups

```bash
# Already backed up in GitHub
# Additional: Regular Git bundles

git bundle create gkchatty-local-$(date +%Y%m%d).bundle --all
```

---

## Related Documentation

- **Architecture:** `docs/architecture/CURRENT-STACK.md`
- **Development:** `docs/development/LOCAL-DEVELOPMENT.md`
- **Version Audit:** `../../TRUTH-VERSION-AUDIT.md`

---

**Last Updated:** 2025-11-14
**Maintainer:** David Morin
**Support:** Check Netlify build logs and function logs for deployment issues
