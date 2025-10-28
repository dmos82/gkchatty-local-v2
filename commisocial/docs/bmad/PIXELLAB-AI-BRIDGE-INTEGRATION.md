# PixelLab + AI Bridge Integration with Builder Pro

**Discovery Date:** 2025-10-28
**Status:** 🚧 Planning Phase
**Priority:** HIGH (Game Development Acceleration)

---

## Executive Summary

Discovered existing PixelLab and AI Bridge codebases that can be integrated into Builder Pro BMAD workflow to enable **AI-generated game asset creation** during the development process.

**Value Proposition:**
- Generate pixel art sprites on-demand during BMAD Phase 4 (Implementation)
- Integrate with Godot game engine via AI Bridge
- Automate asset creation → import → scene setup
- Perfect for rapid game prototyping

---

## Components Discovered

### 1. PixelLab API Integration

**Location:** `/Users/davidjmorin/AI_Bridge_Demo/gemini_pixellab_bridge.py`

**Capabilities:**
- Generate character sprites (4 directional views)
- Generate isometric tiles
- Save to Godot project directory
- Cloud-based AI generation (PixelFlux model)

**API:**
```python
# Character generation
pixellab_client.generate_character_pixflux(
    description="blue wizard with staff",
    name="Wizard",
    size=32,
    n_directions=4,
    view="low top-down"
)

# Tile generation
pixellab_client.generate_image_pixflux(
    description="grass block with flowers",
    image_size=dict(width=32, height=32)
)
```

**Token:** `fcb0392b15e9-4c8a-936d-15e05ec8b7e6` (needs validation)

---

### 2. AI Bridge (Godot Integration)

**Location:** `/Users/davidjmorin/AI_Bridge_Demo/ai_bridge_mcp_server.py`

**Capabilities:**
- Control Godot editor via HTTP API
- Create/modify scenes programmatically
- Add sprites, nodes, configure properties
- Take screenshots
- Save scenes

**MCP Tools:**
```python
@mcp.tool()
def health() -> dict:
    """Ping the Godot AI Bridge plugin."""

@mcp.tool()
def bridge_tool(name: str, args_json: str) -> dict:
    """Call any AI Bridge tool by name."""

@mcp.tool()
def screenshot(scale: float, outfile: str) -> dict:
    """Take Godot editor screenshot."""

@mcp.tool()
def save_scene_as(path: str) -> dict:
    """Save current scene."""
```

**HTTP Endpoint:** `http://127.0.0.1:17865/tool`

---

### 3. Integration Example

**Location:** `/Users/davidjmorin/AI_Bridge_Demo/pixellab_integration_example.py`

**Workflow:**
1. Generate character with PixelLab → `assets/wizard.png`
2. Generate tiles with PixelLab → `assets/grass_tile.png`
3. Create new Godot scene via AI Bridge
4. Add sprites to scene at positions
5. Configure properties (z-index, animations, etc.)
6. Save scene

**Example Code:**
```python
# Create scene
ai_bridge_request("new_scene", {"root_type": "Node2D"})

# Add wizard sprite
ai_bridge_request("bridge_tool", {
    "name": "seed_sprite_quick",
    "args_json": json.dumps({
        "path": "res://assets/wizard.png",
        "node_name": "Wizard",
        "position": [400, 300]
    })
})

# Add isometric tiles in grid
for i in range(5):
    for j in range(5):
        x = 300 + (j - i) * 32
        y = 200 + (j + i) * 16
        ai_bridge_request("bridge_tool", {
            "name": "seed_sprite_quick",
            "args_json": json.dumps({
                "path": "res://assets/grass_tile.png",
                "node_name": f"Tile_{i}_{j}",
                "position": [x, y]
            })
        })
```

---

## Proposed Integration with Builder Pro

### Architecture

```
┌─────────────┐
│ BMAD PHASE 4│
│Implementation│
└──────┬──────┘
       │
       ↓
┌──────────────────────────────────────┐
│  Builder Pro BMAD (RAG Pattern)      │
│                                       │
│  Step 5: "Generate player sprite"    │
│    ↓                                  │
│  Query GKChatty: "What sprite needed?"│
│    ↓                                  │
│  Response: "Blue wizard, 48px, 4-dir" │
└──────┬───────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────┐
│  PixelLab MCP Server                 │
│                                       │
│  mcp__pixellab__generate_character   │
│    description: "blue wizard"        │
│    size: 48                          │
│    n_directions: 4                   │
│                                       │
│  → Returns: character_id             │
│  → Polls until ready (30s)           │
│  → Downloads sprites                 │
│  → Saves to project/public/assets/   │
└──────┬───────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────┐
│  AI Bridge MCP Server (Optional)     │
│                                       │
│  mcp__aibridge__add_sprite           │
│    path: "/assets/wizard.png"        │
│    position: [400, 300]              │
│                                       │
│  → Creates Godot scene               │
│  → Adds sprite node                  │
│  → Configures animations             │
└──────────────────────────────────────┘
```

---

## Integration Plan

### Phase 1: PixelLab MCP Server Setup (2-3 hours)

**Goal:** Create standalone PixelLab MCP server that works with Claude Code

**Tasks:**

1. **Create MCP Server** (`/mcp/pixellab-mcp/server.js`)
   ```javascript
   // Node.js MCP server wrapping PixelLab Python client
   // Uses FastMCP pattern similar to builder-pro-mcp
   ```

2. **Implement Tools:**
   - `mcp__pixellab__generate_character(description, name, size, n_directions)`
   - `mcp__pixellab__generate_tile(description, size, tile_shape)`
   - `mcp__pixellab__get_character_status(character_id)`
   - `mcp__pixellab__download_sprites(character_id, output_dir)`

3. **Configure Claude Code MCP:**
   - Add to `mcp_config.json`
   - Test with manual calls
   - Verify sprite generation + download

4. **Validate Token:**
   - Test PixelLab API token
   - Update if needed
   - Handle rate limits

**Deliverables:**
- ✅ `mcp/pixellab-mcp/server.js`
- ✅ `mcp/pixellab-mcp/package.json`
- ✅ Claude Code MCP config updated
- ✅ Test results documented

---

### Phase 2: AI Bridge MCP Server Setup (1-2 hours)

**Goal:** Expose AI Bridge HTTP API as MCP server

**Tasks:**

1. **Copy Existing MCP Server** (`/mcp/ai-bridge-mcp/`)
   - Based on: `/Users/davidjmorin/AI_Bridge_Demo/ai_bridge_mcp_server.py`
   - Convert to Node.js or keep Python with wrapper

2. **Implement Core Tools:**
   - `mcp__aibridge__health()` - Ping Godot
   - `mcp__aibridge__new_scene(root_type)`
   - `mcp__aibridge__add_sprite(path, name, position)`
   - `mcp__aibridge__screenshot(scale, outfile)`
   - `mcp__aibridge__save_scene(path)`

3. **Test with Godot:**
   - Start Godot with AI Bridge plugin
   - Verify HTTP endpoint running
   - Test scene creation
   - Test sprite import

**Deliverables:**
- ✅ `mcp/ai-bridge-mcp/server.js` (or `.py`)
- ✅ Claude Code MCP config updated
- ✅ Test results documented
- ✅ Godot setup instructions

---

### Phase 3: BMAD Integration (1 hour)

**Goal:** Update BMAD workflow to support game asset generation

**Tasks:**

1. **Update Phase 4 Prompts:**
   - Add PixelLab tool usage to implementation steps
   - Include asset generation in task breakdown

2. **Create Game Development Templates:**
   - User story template for games
   - Architecture template for games (Phaser, Godot, etc.)
   - Planning template with asset generation steps

3. **Update Documentation:**
   - Add PixelLab MCP to MCP-TOOLS-STATUS.md
   - Add AI Bridge MCP to MCP-TOOLS-STATUS.md
   - Create GAME-DEVELOPMENT-WORKFLOW.md guide

**Deliverables:**
- ✅ Updated BMAD-COMPLETE-GUIDE.md (game dev section)
- ✅ MCP-TOOLS-STATUS.md (2 new tools)
- ✅ GAME-DEVELOPMENT-WORKFLOW.md

---

### Phase 4: Platform Runner Test (4-6 hours)

**Goal:** Build complete Mario-style game using BMAD + PixelLab + AI Bridge

**Workflow:**
```
/bmad-pro-build "Build 'Platform Runner' - Mario-style platformer with AI-generated pixel art sprites using PixelLab, implemented in Phaser 3 + Next.js 15"

Phase 0: Requirements
  → 8 user stories for platformer

Phase 1: Architecture
  → Phaser 3 + Next.js setup
  → Asset generation strategy (PixelLab)
  → Optional: Godot export (AI Bridge)

Phase 2: Discovery
  → Find Phaser examples in GKChatty
  → Find PixelLab usage patterns

Phase 3: Planning
  → 18 tasks including:
    - Task 5: "Generate player sprite with PixelLab"
    - Task 6: "Generate enemy sprites with PixelLab"
    - Task 7: "Generate tile sprites with PixelLab"
  → Upload plan to GKChatty

Phase 4: Implementation (RAG Pattern)
  → Query: "What is step 5?"
  → Response: "Generate player sprite..."
  → Execute: mcp__pixellab__generate_character(...)
  → Wait for generation (30s)
  → Download sprites to public/assets/
  → Import into Phaser scene
  → Test player movement
  → Mark step complete

Phase 5: QA Review
  → Playwright tests with game interactions
  → orchestrate_build validation
  → User approval
```

**Deliverables:**
- ✅ Working Platform Runner game
- ✅ AI-generated sprites
- ✅ Complete BMAD workflow demonstration
- ✅ Session documentation

---

## Technical Requirements

### PixelLab MCP Server

**Dependencies:**
```json
{
  "dependencies": {
    "pixellab": "latest",
    "httpx": "latest",
    "fastmcp": "latest"
  }
}
```

**Environment Variables:**
```bash
PIXELLAB_TOKEN=fcb0392b15e9-4c8a-936d-15e05ec8b7e6
PIXELLAB_OUTPUT_DIR=/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/commisocial/public/assets
```

**MCP Config:**
```json
{
  "mcpServers": {
    "pixellab": {
      "command": "node",
      "args": ["/path/to/mcp/pixellab-mcp/server.js"],
      "env": {
        "PIXELLAB_TOKEN": "fcb0392b15e9-4c8a-936d-15e05ec8b7e6"
      }
    }
  }
}
```

---

### AI Bridge MCP Server

**Dependencies:**
- Godot 4.x with AI Bridge plugin
- Python 3.9+ or Node.js 18+
- httpx or axios

**Environment Variables:**
```bash
AI_BRIDGE_URL=http://127.0.0.1:17865
AI_BRIDGE_TIMEOUT=30.0
GODOT_PROJECT=/Users/davidjmorin/AI_Bridge_Demo
```

**MCP Config:**
```json
{
  "mcpServers": {
    "ai-bridge": {
      "command": "python3",
      "args": ["/path/to/mcp/ai-bridge-mcp/server.py"]
    }
  }
}
```

---

## Use Cases

### Use Case 1: Rapid Game Prototyping
```
User: "Build a roguelike dungeon crawler"

BMAD Phase 4:
  - Step 3: Generate player sprite (PixelLab)
  - Step 4: Generate 3 enemy sprites (PixelLab)
  - Step 5: Generate dungeon tiles (PixelLab)
  - Step 6: Implement Phaser scene with generated assets
  - Step 7: Test gameplay

Result: Playable prototype in 4-6 hours with custom AI art
```

---

### Use Case 2: Godot + Phaser Hybrid
```
User: "Build platformer, prototype in Godot, deploy as web game in Phaser"

BMAD Phase 4:
  - Generate sprites with PixelLab
  - Create Godot scene with AI Bridge (rapid prototyping)
  - Test mechanics in Godot
  - Export sprites
  - Rebuild in Phaser for web deployment

Result: Fast prototyping + production-ready web game
```

---

### Use Case 3: Asset Iteration During Development
```
User: "The wizard sprite doesn't look right, make him taller"

BMAD Phase 4 (Mid-Implementation):
  - Re-generate wizard sprite (PixelLab)
    Description: "tall blue wizard with long staff"
  - Replace sprite in game
  - Update animations
  - Re-test

Result: Real-time asset iteration during development
```

---

## Benefits

### For Builder Pro BMAD:
1. **Asset Generation Automation** - No manual sprite creation
2. **Faster Prototyping** - AI-generated art in 30 seconds
3. **Consistency** - All sprites match art style
4. **Iteration Speed** - Regenerate assets with description changes

### For Game Development:
1. **Rapid Prototyping** - Test gameplay before investing in art
2. **AI-Powered Workflow** - Describe → Generate → Integrate
3. **Godot Integration** - Scene building automation
4. **Web + Desktop** - Deploy to multiple platforms

### For AI Bridge:
1. **MCP Integration** - Works with any MCP-compatible AI
2. **Godot Automation** - Scene creation, sprite import, property config
3. **Screenshot Verification** - Visual testing during development

---

## Risks & Mitigation

### Risk 1: PixelLab API Token Invalid
**Mitigation:**
- Validate token before integration
- Update token if needed
- Document token refresh process

### Risk 2: 30-Second Generation Time
**Mitigation:**
- Async generation with polling
- Progress tracking in BMAD Phase 4
- Batch generate assets upfront

### Risk 3: Godot Dependency for AI Bridge
**Mitigation:**
- Make AI Bridge optional
- Focus on Phaser for web games
- Use AI Bridge for prototyping only

### Risk 4: MCP Server Complexity
**Mitigation:**
- Start with minimal viable MCP servers
- Add features incrementally
- Document thoroughly

---

## Success Metrics

**Phase 1 Success:**
- ✅ PixelLab MCP generates character sprite
- ✅ Sprites download to project directory
- ✅ No errors in Claude Code

**Phase 2 Success:**
- ✅ AI Bridge MCP creates Godot scene
- ✅ Sprite imported successfully
- ✅ Screenshot taken

**Phase 3 Success:**
- ✅ BMAD workflow includes asset generation
- ✅ Documentation complete
- ✅ MCP tools listed in status doc

**Phase 4 Success:**
- ✅ Complete game built with BMAD
- ✅ AI-generated sprites in game
- ✅ Playwright tests pass
- ✅ User approves

---

## Next Steps

1. **Immediate (Now):**
   - Create PixelLab MCP server skeleton
   - Test PixelLab API token
   - Document file structure

2. **Short-term (Today):**
   - Implement PixelLab MCP tools
   - Test sprite generation
   - Add to Claude Code MCP config

3. **Medium-term (This Week):**
   - Implement AI Bridge MCP
   - Test with Godot
   - Integrate with BMAD

4. **Long-term (Next Week):**
   - Build Platform Runner with full workflow
   - Document lessons learned
   - Create game development guide

---

## Files to Create

```
mcp/
├── pixellab-mcp/
│   ├── server.js (or server.py)
│   ├── package.json
│   ├── README.md
│   └── test/
│       └── test-pixellab.js
│
└── ai-bridge-mcp/
    ├── server.js (or server.py)
    ├── package.json
    ├── README.md
    └── test/
        └── test-ai-bridge.js

docs/bmad/
├── GAME-DEVELOPMENT-WORKFLOW.md (new)
├── PIXELLAB-AI-BRIDGE-INTEGRATION.md (this file)
└── MCP-TOOLS-STATUS.md (update)
```

---

## Resources

**PixelLab:**
- API: https://api.pixellab.ai
- Docs: https://docs.pixellab.ai
- Token: Environment variable

**AI Bridge:**
- Repo: /Users/davidjmorin/AI_Bridge_Demo
- HTTP API: http://127.0.0.1:17865
- Godot Plugin: Required

**Builder Pro:**
- BMAD Workflow: /bmad-pro-build
- MCP Tools: docs/bmad/MCP-TOOLS-STATUS.md
- Complete Guide: docs/bmad/BMAD-COMPLETE-GUIDE.md

---

**Status:** 📋 Plan Complete → Ready for Implementation
**Priority:** HIGH
**Estimated Time:** 4-6 hours (Phases 1-3), then 4-6 hours (Phase 4 test)
**Owner:** SuperClaude + User
**Date:** 2025-10-28
