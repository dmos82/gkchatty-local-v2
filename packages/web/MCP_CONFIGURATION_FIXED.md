# MCP Server Configuration - Fixed January 20, 2025

## Changes Made to `~/.claude/settings.json`

### 1. Fixed GKCHATTY-KB Server Configuration

**BEFORE** (Broken path):
```json
"gkchatty-kb": {
  "command": "node",
  "args": [
    "/Users/davidjmorin/GK CHATTY STAGING/gkchatty-mcp-server/server.js"  ❌ PATH DOESN'T EXIST
  ],
  "env": {
    "GKCHATTY_API_URL": "http://localhost:4001",
    "GKCHATTY_USERNAME": "dev",
    "GKCHATTY_PASSWORD": "dev123"
  }
}
```

**AFTER** (Fixed - uses global executable):
```json
"gkchatty-kb": {
  "command": "gkchatty-mcp",  ✅ Uses /opt/homebrew/bin/gkchatty-mcp
  "args": [],
  "env": {
    "GKCHATTY_API_URL": "http://localhost:4001",
    "GKCHATTY_USERNAME": "dev",
    "GKCHATTY_PASSWORD": "dev123"
  }
}
```

### 2. Cleaned Builder-Pro-MCP Configuration

**BEFORE**:
```json
"builder-pro-mcp": {
  "command": "node",
  "args": [
    "/Users/davidjmorin/GOLDKEY CHATTY/builder-pro/mcp/builder-pro-mcp/server.js"
  ],
  "env": {
    "BUILDER_PRO_API": "http://localhost:4001"  ❌ Incorrect env var
  }
}
```

**AFTER**:
```json
"builder-pro-mcp": {
  "command": "node",
  "args": [
    "/Users/davidjmorin/GOLDKEY CHATTY/builder-pro/mcp/builder-pro-mcp/server.js"
  ],
  "env": {}  ✅ Server doesn't need special env vars
}
```

---

## Expected MCP Tools After Restart

Once you **restart Claude Code**, these tools should appear:

### GKCHATTY-KB Tools:
- `mcp__gkchatty-kb__search_gkchatty` - Search GKCHATTY knowledge base
- `mcp__gkchatty-kb__upload_to_gkchatty` - Upload documents to GKCHATTY KB

### Builder-Pro-MCP Tools:
- `mcp__builder-pro-mcp__review_code` - Code quality review
- `mcp__builder-pro-mcp__security_scan` - Security vulnerability scan
- `mcp__builder-pro-mcp__validate_architecture` - Architecture validation
- `mcp__builder-pro-mcp__read_file` - File operations
- `mcp__builder-pro-mcp__scan_directory` - Directory scanning
- `mcp__builder-pro-mcp__test_ui` - UI testing validation
- `mcp__builder-pro-mcp__auto_fix` - Automatic code fixes

---

## How to Verify

1. **Restart Claude Code** (close and reopen the terminal)
2. In the new session, ask: "What MCP tools do you have available?"
3. You should see tools with prefixes:
   - `mcp__gkchatty-kb__*`
   - `mcp__builder-pro-mcp__*`

---

## Why They Weren't Working Before

1. **Wrong Path**: GKCHATTY MCP was pointing to non-existent directory
   - `/Users/davidjmorin/GK CHATTY STAGING/gkchatty-mcp-server/server.js` ❌
   - Should use: `gkchatty-mcp` (global executable) ✅

2. **Not Connected to Claude Code**: MCP servers configured in:
   - `~/.claude/mcp/servers.json` - Used by **Claude Desktop** only
   - `~/.claude/settings.json` - Used by **Claude Code** ✅ (just fixed)

3. **Never Restarted**: Settings changes require Claude Code restart to take effect

---

## Testing the Fix

After restarting Claude Code, test with:

```bash
# In new Claude Code session, I should be able to:

# 1. Search GKCHATTY KB
mcp__gkchatty-kb__search_gkchatty(
  query: "authentication patterns"
)

# 2. Upload to GKCHATTY KB
mcp__gkchatty-kb__upload_to_gkchatty(
  filePath: "/path/to/plan.md",
  projectId: "gkckb"
)

# 3. Review code with Builder-Pro
mcp__builder-pro-mcp__review_code(
  filePath: "/path/to/file.ts",
  contextQuery: "security best practices"
)
```

---

## Next Steps

1. ✅ Settings updated
2. ⏳ **RESTART CLAUDE CODE** (required for changes to take effect)
3. ⏳ Verify MCP tools appear in new session
4. ⏳ Test `/scout-plan-build` workflow again
5. ⏳ Planner should now successfully upload plans to GKCHATTY
6. ⏳ Builder should retrieve plans and implement correctly

---

**Configuration Fixed**: January 20, 2025
**Action Required**: Restart Claude Code for changes to take effect
**Expected Result**: Both MCP servers available with all tools in new sessions

