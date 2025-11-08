# GKCHATTYLOCALBUILD - Testing Plan with Builder Pro

## Overview

Using Builder Pro MCP tools to validate the local desktop agent build.

---

## Phase 1: Dependency Detection

**Tool:** `mcp__builder-pro-mcp__detect_dependencies`

**Test:**
```javascript
await mcp__builder-pro-mcp__detect_dependencies({
  projectPath: "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/GKCHATTYLOCALBUILD",
  autoFix: true
});
```

**Expected Results:**
- Detects missing `@xenova/transformers`
- Detects missing `chromadb`
- Detects missing `electron`
- Detects missing `better-sqlite3`
- Auto-adds to package.json if autoFix enabled

---

## Phase 2: Code Review

**Tool:** `mcp__builder-pro-mcp__review_code`

**Files to Review:**
1. `backend/src/utils/transformersHelper.ts`
2. `backend/src/utils/chromaService.ts`
3. `desktop-agent/src/main.js`
4. `desktop-agent/src/services/mcpServer.js`

**Test:**
```javascript
await mcp__builder-pro-mcp__review_file({
  filePath: "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/GKCHATTYLOCALBUILD/backend/src/utils/transformersHelper.ts"
});
```

**Expected Results:**
- ESLint analysis
- Security vulnerability scan
- Best practices validation
- Suggestions for improvements

---

## Phase 3: Visual Testing (After Build)

**Tool:** `mcp__builder-pro-mcp__run_visual_test`

**Test Desktop Agent UI:**
```javascript
await mcp__builder-pro-mcp__run_visual_test({
  url: "http://localhost:3000", // Frontend Next.js app
  screenshotPath: "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/GKCHATTYLOCALBUILD/test-screenshots/desktop-ui.png",
  actions: [
    { type: "screenshot" },
    { type: "wait", timeout: 2000 },
    { type: "screenshot" }
  ]
});
```

**Expected Results:**
- Frontend loads successfully
- No console errors
- Screenshots captured
- Assets loaded correctly

---

## Phase 4: Complete Build Orchestration

**Tool:** `mcp__builder-pro-mcp__orchestrate_build`

**Full Validation:**
```javascript
await mcp__builder-pro-mcp__orchestrate_build({
  projectPath: "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/GKCHATTYLOCALBUILD",
  config: {
    frontend: { url: "http://localhost:3000" },
    backend: { url: "http://localhost:6001" }
  },
  autoFix: true,
  maxIterations: 3,
  stopOnCritical: false
});
```

**This Runs:**
1. Phase 1: Detect missing dependencies
2. Phase 2: Run visual smoke test
3. Phase 3: Validate config consistency
4. Phase 4: Scan busy ports
5. Phase 5: Categorize bugs + auto-fix

**Expected Output:**
- Comprehensive validation report
- Bug categorization (critical/high/medium/low)
- Auto-fixes applied where possible
- Performance metrics

---

## What Builder Pro CAN Test:

### ✅ Code Quality
- ESLint errors/warnings
- TypeScript compilation issues
- Security vulnerabilities (OWASP)
- Best practices violations

### ✅ Dependencies
- Missing npm packages
- Version conflicts
- Unused dependencies

### ✅ Configuration
- package.json validation
- tsconfig.json consistency
- Port conflicts

### ✅ UI/Frontend (if servers running)
- Page loads successfully
- No console errors
- Asset loading
- Basic interactions

---

## What Builder Pro CANNOT Test:

### ❌ MPS Acceleration
- Cannot verify Metal Performance Shaders work
- Cannot benchmark 50-100ms embedding speed
- Requires manual M2 Mac testing

### ❌ Transformers.js Model Loading
- Cannot verify HuggingFace models load
- Cannot test embedding generation
- Requires actual model files in cache

### ❌ ChromaDB Operations
- Cannot test vector storage/retrieval
- Cannot verify collection creation
- Requires manual integration testing

### ❌ Electron System Tray
- Cannot test system tray appears
- Cannot test menu interactions
- Requires manual desktop testing

### ❌ MCP Server Spawning
- Cannot test child process spawning
- Cannot verify MCP servers start
- Requires manual process testing

---

## Recommended Testing Strategy:

### 1. Use Builder Pro For (Automated):
```bash
# Step 1: Detect dependencies
mcp__builder-pro-mcp__detect_dependencies({
  projectPath: "...",
  autoFix: true
})

# Step 2: Review critical files
mcp__builder-pro-mcp__review_file({
  filePath: ".../transformersHelper.ts"
})

# Step 3: Full orchestration (if servers running)
mcp__builder-pro-mcp__orchestrate_build({
  projectPath: "...",
  autoFix: true
})
```

### 2. Manual Testing For (Cannot Automate):
```bash
# Test MPS detection
cd backend && npm test -- transformersHelper.test.ts

# Test Transformers.js loading
node -e "const { generateEmbeddings } = require('./backend/src/utils/transformersHelper'); generateEmbeddings(['test']).then(console.log)"

# Test ChromaDB
node -e "const { queryVectors } = require('./backend/src/utils/chromaService'); queryVectors([0.1, 0.2, ...]).then(console.log)"

# Test Electron app
cd desktop-agent && npm start

# Test MCP compatibility
# Open Claude Code and try: query_gkchatty, upload_to_gkchatty
```

---

## Testing Workflow:

### Phase A: Pre-Build (Builder Pro)
1. **Detect dependencies** → Auto-fix package.json
2. **Review code** → Find ESLint errors
3. **Validate configs** → Check consistency

### Phase B: Build & Install
```bash
cd backend && npm install
cd ../desktop-agent && npm install
cd ../frontend && npm install
```

### Phase C: Post-Build (Builder Pro)
4. **Start servers** → backend:6001, frontend:3000
5. **Run orchestrate_build** → Full validation
6. **Run visual tests** → Screenshot + console check

### Phase D: Manual Integration Tests
7. **Test MPS** → Verify M2 acceleration
8. **Test embeddings** → Generate and time
9. **Test ChromaDB** → Store and query vectors
10. **Test Electron** → System tray + UI
11. **Test MCP** → Claude Code integration

---

## Builder Pro Test Script:

```javascript
// test-with-builder-pro.js

async function testGKChattyLocalBuild() {
  const projectPath = "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/GKCHATTYLOCALBUILD";

  console.log("🔍 Phase 1: Detecting dependencies...");
  const depResult = await mcp__builder-pro-mcp__detect_dependencies({
    projectPath,
    autoFix: true
  });
  console.log(depResult);

  console.log("\n🔍 Phase 2: Reviewing code...");
  const reviewResult = await mcp__builder-pro-mcp__review_file({
    filePath: `${projectPath}/backend/src/utils/transformersHelper.ts`
  });
  console.log(reviewResult);

  console.log("\n🔍 Phase 3: Full orchestration...");
  // NOTE: Requires servers running
  const orchResult = await mcp__builder-pro-mcp__orchestrate_build({
    projectPath,
    config: {
      frontend: { url: "http://localhost:3000" },
      backend: { url: "http://localhost:6001" }
    },
    autoFix: true,
    maxIterations: 3
  });
  console.log(orchResult);

  console.log("\n✅ Builder Pro testing complete!");
}
```

---

## Summary:

**Builder Pro is EXCELLENT for:**
- 🟢 Static code analysis
- 🟢 Dependency management
- 🟢 Configuration validation
- 🟢 UI smoke tests (if servers running)

**Manual testing REQUIRED for:**
- 🔴 MPS acceleration validation
- 🔴 Transformers.js model loading
- 🔴 ChromaDB vector operations
- 🔴 Electron desktop integration
- 🔴 MCP server functionality

**Recommendation:**
1. Use Builder Pro to validate code quality and dependencies (fast, automated)
2. Use manual tests for integration and hardware-specific features (M2 MPS)
3. Combine both for comprehensive coverage

Would you like me to run Builder Pro tests now?
