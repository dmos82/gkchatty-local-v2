# GKChatty MCP Server - Tenant KB Support

## Overview

The enhanced GKChatty MCP server now supports uploading documents to **Tenant Knowledge Bases** instead of just user documents. This provides better organization and management of documents uploaded via MCP.

## Key Features

### 1. Automatic Tenant KB Creation
- When authenticated as an admin, the MCP server automatically creates a dedicated "MCP Knowledge Base"
- This KB is reused for all subsequent MCP uploads
- Falls back to regular user uploads if not admin

### 2. Named Knowledge Bases
- Documents are organized into named tenant KBs
- Each KB can have its own access controls and metadata
- Better separation of concerns between different document sources

### 3. Enhanced Upload Capabilities
- **Admin users**: Documents upload to tenant KBs (better organization)
- **Regular users**: Documents upload to personal collection (fallback)
- Automatic detection of user role and appropriate routing

## Setup

### 1. Use the Enhanced MCP Server

```bash
# Make the enhanced version the main version
cp index-tenant-kb.js index.js
```

### 2. Configure Environment Variables

```bash
# Required: GKChatty API URL
export GKCHATTY_API_URL="http://localhost:3001"

# Authentication (use admin credentials for tenant KB support)
export GKCHATTY_USERNAME="admin_username"
export GKCHATTY_PASSWORD="admin_password"

# Or use an API key (if available)
export GKCHATTY_API_KEY="gk_live_..."

# Optional: Custom KB name (defaults to "MCP Knowledge Base")
export GKCHATTY_MCP_KB_NAME="My Custom KB Name"
```

### 3. Configure Claude to Use the MCP Server

In your Claude MCP configuration (`claude_mcp_config.json`):

```json
{
  "mcpServers": {
    "gkchatty-kb": {
      "command": "node",
      "args": ["/path/to/gkchatty-mcp-server/index.js"],
      "env": {
        "GKCHATTY_API_URL": "http://localhost:3001",
        "GKCHATTY_USERNAME": "admin_username",
        "GKCHATTY_PASSWORD": "admin_password",
        "GKCHATTY_MCP_KB_NAME": "MCP Knowledge Base"
      }
    }
  }
}
```

## Available MCP Tools

### 1. `upload_to_gkchatty`
Upload documents to GKChatty with automatic tenant KB support.

**Parameters:**
- `file_path` (required): Absolute path to the file to upload
- `description` (optional): Description of the document
- `kb_name` (optional): Name of specific KB to use (admin only)

**Example:**
```
Upload the file /path/to/document.pdf to GKChatty
```

### 2. `search_gkchatty`
Search across all accessible knowledge bases.

**Parameters:**
- `query` (required): Search query
- `kb_name` (optional): Limit search to specific KB

**Example:**
```
Search GKChatty for "deployment procedures"
```

### 3. `list_tenant_kbs`
List all available tenant knowledge bases (admin only).

**Example:**
```
List all tenant knowledge bases
```

## How It Works

### Upload Flow

1. **Authentication**: MCP server authenticates with GKChatty
2. **Role Detection**: Checks if user has admin privileges
3. **KB Initialization**: 
   - If admin: Creates or finds "MCP Knowledge Base"
   - If not admin: Skips KB initialization
4. **Document Upload**:
   - If admin with KB: Uploads to tenant KB
   - If not admin: Falls back to user document upload
5. **Response**: Returns upload status with location info

### Tenant KB Structure

```
tenant_kb/
├── mcp-knowledge-base/     # Default MCP KB
│   ├── document1.pdf
│   ├── document2.txt
│   └── ...
├── customer/                # Other tenant KBs
├── teams/
└── system-kb/
```

## Testing

Run the test script to verify functionality:

```bash
cd gkchatty-mcp-server
node test-tenant-kb.js
```

This will:
1. Authenticate with GKChatty
2. List existing tenant KBs (if admin)
3. Create/find MCP Knowledge Base
4. Upload a test document to the KB
5. List documents in the KB
6. Test fallback to user uploads

## Benefits of Tenant KB Upload

1. **Better Organization**: Documents grouped by source/purpose
2. **Access Control**: Admin-controlled document management
3. **Namespace Isolation**: Separate vector spaces for different KBs
4. **Scalability**: Better performance with organized collections
5. **Auditability**: Clear tracking of document sources

## Troubleshooting

### "Not authorized" Error
- Ensure you're using admin credentials
- Check that the user has `role: 'admin'` in the database

### "KB not found" Error  
- The MCP KB will be created automatically on first use
- Check server logs for creation status

### Upload Fails Silently
- Check file permissions and path
- Ensure file format is supported
- Verify GKChatty server is running

### Falls Back to User Upload
- This is expected behavior for non-admin users
- To use tenant KBs, ensure admin role is assigned

## Migration from v1.0 to v2.0

The enhanced version is backward compatible:
- Existing user uploads continue to work
- Admin users get automatic tenant KB support
- No changes needed for non-admin users

To migrate:
1. Replace `index.js` with `index-tenant-kb.js`
2. Update environment variables if needed
3. Restart Claude to reload MCP configuration

## Security Considerations

- Tenant KB operations require admin privileges
- Regular users cannot create or modify tenant KBs
- API keys provide better security than username/password
- Document access follows GKChatty's permission model