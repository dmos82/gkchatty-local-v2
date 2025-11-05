# Manual Pinecone Re-indexing Instructions

## ⚠️ TEMPORARY ADMIN UTILITY

This script (`trigger-reindex.ts`) is a **temporary utility** for manually triggering the Pinecone re-indexing process on the Staging environment. It is **NOT** part of the production codebase and should **NOT** be committed to any long-term branches.

## Prerequisites

1. Admin access to the GKChatty Staging environment
2. Node.js and npm/npx installed locally
3. Access to the `apps/api` directory in your local development environment

## Step-by-Step Instructions

### 1. Obtain Your JWT Token

1. Open your browser and navigate to: https://app.gkchatty.com/admin
2. Log in with your admin credentials
3. Open Developer Tools (F12 or right-click → Inspect)
4. Go to the **Application** tab (Chrome) or **Storage** tab (Firefox)
5. In the left sidebar, expand **Local Storage** → **https://app.gkchatty.com**
6. Find the key named `token`
7. Copy the entire value (it should be a long string with dots, like: `eyJhbGc...`)
   - ⚠️ Do NOT include the surrounding quotes
   - ⚠️ Make sure you copy the ENTIRE token

### 2. Run the Re-indexing Script

Navigate to the API directory:

```bash
cd ~/gkchatty-project-V4\ copy\ 2/apps/api
```

Then run the script using one of these methods:

**Method 1: Pass token as argument**

```bash
npx ts-node src/scripts/trigger-reindex.ts YOUR_JWT_TOKEN_HERE
```

**Method 2: Use environment variable**

```bash
ADMIN_JWT_TOKEN=YOUR_JWT_TOKEN_HERE npx ts-node src/scripts/trigger-reindex.ts
```

Replace `YOUR_JWT_TOKEN_HERE` with the actual token you copied from the browser.

### 3. Monitor the Output

The script will display:

- Request details being sent
- Response status code
- Response body
- Success/error messages

**Expected Success Output:**

```
🚀 Triggering Pinecone re-indexing on Staging API...

📤 Sending POST request to: https://api.gkchatty.com/api/admin/reindex-system-kb
📦 Request body: {"forceFullCleanup":true,"clearAllNamespaces":false}
🔑 Using JWT token: eyJhbGciOiJIUzI1NiIs...1234567890

📡 Response Status: 200 OK
📋 Response Headers: { ... }

📄 Response Body:
{
  "success": true,
  "message": "System KB re-indexing completed successfully"
}

✅ SUCCESS: Re-indexing triggered successfully!
The process may take a few minutes to complete.
Check the Render logs for detailed progress.
```

### 4. Verify the Re-indexing

1. Check the Render logs for the Staging API to monitor the re-indexing progress
2. Once complete, test the chat functionality to ensure source documents are loading correctly
3. Verify that clicking on source links no longer produces 404 errors

## Troubleshooting

### "JWT token is required!" Error

- Make sure you're passing the token correctly
- Check that you copied the token value without quotes

### "Invalid JWT token format!" Error

- Ensure you copied the ENTIRE token from local storage
- JWT tokens should contain at least two dots (.)

### "401 AUTHENTICATION ERROR"

- Your token may have expired
- Log out and log back into the admin UI to get a fresh token
- Make sure you're using a token from an admin account

### Network Errors

- Verify you have internet connectivity
- Check if api.gkchatty.com is accessible
- Ensure you're not behind a restrictive firewall

## Important Notes

- This script is for **one-time use** to fix the current Pinecone sync issue
- Do **NOT** commit this script to the main branch or any PR
- The re-indexing process may take several minutes depending on the number of documents
- Monitor the Render logs for detailed progress and any errors

## Cleanup

After successfully running the re-indexing:

1. Delete the `trigger-reindex.ts` file from your local environment
2. Delete this instructions file
3. These are temporary utilities and should not remain in the codebase
