# GKChatty MCP Credentials

**IMPORTANT:** These credentials are for Claude Code to access GKChatty via MCP tools.

## Admin Account for MCP Access

```
Username: gkchattymcp
Password: Gkchatty1!
Role: admin
```

## Usage

When using GKChatty MCP tools, always authenticate first:

```javascript
await mcp__gkchatty_kb__switch_user({
  username: "gkchattymcp",
  password: "Gkchatty1!"
});
```

## Common Operations

### Upload Document
```javascript
await mcp__gkchatty_kb__upload_to_gkchatty({
  file_path: "/path/to/file",
  description: "Description of document"
});
```

### Search Knowledge Base
```javascript
await mcp__gkchatty_kb__search_gkchatty({
  query: "search terms"
});
```

### Query with RAG
```javascript
await mcp__gkchatty_kb__query_gkchatty({
  query: "What is Step 1 of the plan?"
});
```

## Troubleshooting

1. **Authentication Failed**: Check password case sensitivity (capital G in Gkchatty1!)
2. **500 Errors**: Backend may be unhealthy, check health endpoint
3. **No user selected**: Must call switch_user before uploads

## Security Note

These credentials should be stored securely and not committed to public repositories.

---

Last Updated: 2025-10-27