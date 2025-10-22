# BUILDER-PRO MCP Server (Inner Loop)

## Agentic Code Review Workflow Implementation

This MCP (Model Context Protocol) server provides real-time code review, security analysis, and architecture validation for the BUILDER-PRO platform. It represents the "Inner Loop" of our agentic workflow - providing instant developer feedback during the coding process.

## Features

### 1. Code Review (`/review`)
- ESLint-based static analysis
- Security pattern detection
- Code quality suggestions
- Integration with BUILDER-PRO's RAG knowledge base
- Comprehensive issue categorization (critical/warnings)

### 2. Security Scanning (`/security-scan`)
- OWASP Top 10 compliance checking
- Detection of common vulnerabilities:
  - Code injection (eval, Function constructor)
  - XSS vulnerabilities (innerHTML, document.write)
  - SQL injection risks
  - Hardcoded credentials
  - Path traversal vulnerabilities
  - Weak cryptography usage
  - Command injection risks

### 3. Architecture Validation (`/validate-architecture`)
- Project-type specific validation (Node.js, React, etc.)
- Separation of concerns checking
- Error handling patterns
- Environment variable usage validation

## Installation

### Global Installation (Universal - Works from Any Directory) ✅ RECOMMENDED

Install the MCP server globally so it's available in any directory on your system:

```bash
# Navigate to MCP directory
cd /path/to/builder-pro/mcp/builder-pro-mcp

# Install dependencies
npm install --legacy-peer-deps

# Link globally (creates symlink in /opt/homebrew/bin or similar)
npm link
```

Verify the installation:

```bash
which builder-pro-mcp
# Should output: /opt/homebrew/bin/builder-pro-mcp (or similar)

claude mcp list
# Should show: builder-pro-mcp: builder-pro-mcp - ✓ Connected
```

Configure in `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "builder-pro-mcp": {
      "command": "builder-pro-mcp",
      "args": [],
      "env": {
        "BUILDER_PRO_API": "http://localhost:5001"
      }
    }
  }
}
```

Now the MCP server works from **any directory** on your computer! No need for project-specific configuration.

### Local Installation (Project-Specific)

If you prefer to run it locally in this project only:

```bash
# Navigate to MCP directory
cd mcp/builder-pro-mcp

# Install dependencies
npm install --legacy-peer-deps

# Start the server
npm start
```

## Configuration

### Environment Variables

- `BUILDER_PRO_API` (optional): URL to Builder Pro API for RAG context. Defaults to `http://localhost:5001`

**Note:** The old HTTP server on port 5002 is no longer used. The MCP server now uses stdio communication via the Model Context Protocol.

## Usage

### Direct API Usage

```bash
# Health check
curl http://localhost:5002/health

# Code review
curl -X POST http://localhost:5002/review \
  -H "Content-Type: application/json" \
  -d '{
    "code": "your code here",
    "filePath": "file.js",
    "contextQuery": "optional RAG query"
  }'

# Security scan
curl -X POST http://localhost:5002/security-scan \
  -H "Content-Type: application/json" \
  -d '{
    "code": "your code here",
    "filePath": "file.js"
  }'

# Architecture validation
curl -X POST http://localhost:5002/validate-architecture \
  -H "Content-Type: application/json" \
  -d '{
    "code": "your code here",
    "filePath": "file.js",
    "projectType": "node"
  }'
```

### Command Line Interface

Use the included `mcp-commands.js` for easier interaction:

```bash
# Check server health
node mcp-commands.js health

# Review a single file
node mcp-commands.js review src/index.js

# Security scan
node mcp-commands.js scan src/auth.js

# Validate architecture
node mcp-commands.js validate src/server.js node

# Review entire directory
node mcp-commands.js review-dir ./src "*.js"
```

## Integration with Claude Code

The MCP server is globally integrated with Claude Code and works in **any directory**:

1. **Global Configuration** (already done if you followed installation above):
   - MCP server is registered in `~/.claude/settings.json`
   - Available in all Claude Code sessions automatically

2. **Available Tools**:
   - `mcp__builder-pro-mcp__review_code` - Comprehensive code review
   - `mcp__builder-pro-mcp__security_scan` - Security vulnerability scan
   - `mcp__builder-pro-mcp__validate_architecture` - Architecture validation

3. **Usage**:
   - Works from any project directory
   - No project-specific setup required
   - Instant feedback during development
   - Integrates with BUILDER-PRO knowledge base for context-aware reviews

## Response Format

### Review Response
```json
{
  "summary": "Status summary",
  "critical": [/* critical issues */],
  "warnings": [/* warning issues */],
  "suggestions": [/* improvement suggestions */],
  "ragInsights": [/* knowledge base insights */],
  "metadata": {
    "timestamp": "ISO date",
    "filePath": "file path",
    "codeStats": {
      "lines": 100,
      "characters": 2000,
      "functions": 5
    },
    "mcpVersion": "1.0.0"
  }
}
```

### Security Scan Response
```json
{
  "summary": "Security status",
  "vulnerabilities": [/* detected vulnerabilities */],
  "owaspCompliance": {
    "injection": true/false,
    "brokenAuth": true/false,
    "xss": true/false,
    "pathTraversal": true/false
  },
  "recommendations": [/* security recommendations */],
  "metadata": {/* scan metadata */}
}
```

## Architecture

```
┌─────────────────────────┐
│   Developer (You)       │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Claude Code           │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   MCP Server (5002)     │
│   - Code Review         │
│   - Security Scan       │
│   - Architecture Check  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  BUILDER-PRO API (5001) │
│  - RAG Knowledge Base   │
│  - Document Store       │
└─────────────────────────┘
```

## Development Roadmap

### Phase 1 (Complete) ✅
- Basic MCP server implementation
- Code review endpoint
- Security scanning
- Architecture validation
- CLI commands

### Phase 2 (Next)
- GitHub Actions integration (Outer Loop)
- Automated PR reviews
- CI/CD pipeline integration
- Team collaboration features

### Phase 3 (Future)
- Machine learning-based pattern detection
- Custom rule configuration
- Performance profiling
- Test coverage analysis

## Troubleshooting

### Server not starting
- Check if port 5002 is available
- Verify Node.js version (>= 18.0.0)
- Check npm installation logs for errors

### RAG integration not working
- Verify BUILDER-PRO API is running on port 5001
- Check network connectivity
- Ensure proper authentication credentials

### ESLint errors
- Verify eslint package installation
- Check for conflicting eslint configurations
- Review TypeScript parser compatibility

## Contributing

This is part of the BUILDER-PRO platform. For contributions:
1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Submit PR with clear description

## License

Part of BUILDER-PRO platform - proprietary software.

---

**Version:** 1.0.0
**Status:** Active Development
**Support:** Internal use only