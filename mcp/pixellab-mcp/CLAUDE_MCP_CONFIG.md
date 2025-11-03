# PixelLab MCP Configuration for Claude Code

## Step 1: Find Your MCP Config

Claude Code stores MCP server configurations. You need to add PixelLab to your existing config.

### Option A: Via Claude Code Settings (Recommended)
1. Open Claude Code
2. Go to Settings > MCP Servers
3. Click "Add Server" or "Edit Configuration"
4. Add the PixelLab configuration (see below)

### Option B: Manual Config File

If you have an `mcp_config.json` file, add this entry to the `mcpServers` section:

```json
{
  "mcpServers": {
    "pixellab": {
      "command": "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/mcp/pixellab-mcp/venv/bin/python3",
      "args": [
        "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/mcp/pixellab-mcp/server.py"
      ],
      "env": {
        "PIXELLAB_TOKEN": "fcb0392c-15e9-4c8a-936d-15e05ec8b7e6",
        "PIXELLAB_OUTPUT_DIR": "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/commisocial/public/assets/sprites"
      }
    }
  }
}
```

**IMPORTANT:** Must use the venv Python path to ensure dependencies are available.

---

## Step 2: Restart Claude Code

After adding the configuration, restart Claude Code to load the PixelLab MCP server.

---

## Step 3: Test MCP Tools

Once configured, test that the tools are available:

### Test Health Check
```
mcp__pixellab__health()
```

Expected response:
```json
{
  "ok": true,
  "message": "PixelLab API is accessible",
  "token_valid": true,
  "client": "pixellab SDK v1.0.5",
  "balance_usd": 0.0,
  "subscription": "Tier 1 (1000 images/month)"
}
```

### Test Sprite Generation
```javascript
await mcp__pixellab__generate_sprite({
  description: "blue wizard with tall staff",
  name: "wizard_test",
  width: 48,
  height: 48,
  direction: "south"
})
```

Expected: Sprite saved to `public/assets/sprites/wizard_test_south.png`

### Test Character Set (4 directions)
```javascript
await mcp__pixellab__generate_character_set({
  description: "blue wizard with tall staff",
  name: "wizard",
  size: 48
})
```

Expected: 4 sprites generated (north, south, east, west)

### Test Tile Generation
```javascript
await mcp__pixellab__generate_tile({
  description: "grass block with flowers",
  name: "grass",
  size: 32
})
```

Expected: Tile saved to `public/assets/sprites/tiles/grass.png`

---

## Available MCP Tools

### 1. `mcp__pixellab__health()`
Check API status, token validity, and account balance.

### 2. `mcp__pixellab__generate_sprite(description, name, width, height, view, direction, no_background, output_dir)`
Generate a single sprite with specific direction.

**Parameters:**
- `description` (required): Text description of sprite
- `name` (optional): Filename prefix (default: "sprite")
- `width` (optional): Width in pixels (default: 48)
- `height` (optional): Height in pixels (default: 48)
- `view` (optional): "low top-down", "side", "isometric" (default: "low top-down")
- `direction` (optional): "north", "south", "east", "west" (default: "south")
- `no_background` (optional): Transparent background (default: true)
- `output_dir` (optional): Custom output directory

### 3. `mcp__pixellab__generate_character_set(description, name, size, directions, output_dir)`
Generate multiple directional sprites for a character.

**Parameters:**
- `description` (required): Text description of character
- `name` (optional): Character name (default: "character")
- `size` (optional): Sprite size (default: 48)
- `directions` (optional): Array of directions (default: ["north", "south", "east", "west"])
- `output_dir` (optional): Custom output directory

### 4. `mcp__pixellab__generate_tile(description, name, size, isometric, output_dir)`
Generate an isometric or top-down tile.

**Parameters:**
- `description` (required): Text description of tile
- `name` (optional): Tile name (default: "tile")
- `size` (optional): Tile size (default: 32)
- `isometric` (optional): Use isometric projection (default: false)
- `output_dir` (optional): Custom output directory

---

## Troubleshooting

### Tool Not Found
**Error:** `mcp__pixellab__health is not defined`

**Fix:**
1. Verify PixelLab MCP config is added
2. Restart Claude Code
3. Check that venv Python path is correct
4. Verify server.py exists at specified path

### Permission Denied
**Error:** `Permission denied: /Users/davidjmorin/...`

**Fix:**
```bash
chmod +x /Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/mcp/pixellab-mcp/server.py
```

### Module Not Found
**Error:** `ModuleNotFoundError: No module named 'pixellab'`

**Fix:** Ensure using venv Python, not system Python:
```bash
/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/mcp/pixellab-mcp/venv/bin/python3 -m pip list | grep pixellab
```

### Balance $0 Warning
**This is normal!** You have a Tier 1 subscription with 1000 images/month included.

---

## Integration with BMAD

Once configured, BMAD Phase 4 can automatically call PixelLab tools:

**Example in Planning Phase:**
```markdown
Step 5: Generate player character sprite
- Tool: mcp__pixellab__generate_character_set
- Description: "blue wizard with tall staff and blue robe"
- Size: 48px
- Directions: 4 (north, south, east, west)
```

**Example in Implementation Phase:**
```javascript
// BMAD Builder executes this during Phase 4:
const result = await mcp__pixellab__generate_character_set({
  description: "blue wizard with tall staff and blue robe",
  name: "player",
  size: 48
});

console.log(`Generated ${result.sprites_generated} sprites`);
// → Generated 4 sprites
```

---

## Status

✅ **MCP Server:** Implemented and tested
✅ **API Token:** Valid (Tier 1 subscription)
✅ **Tools:** 4 tools available (health, generate_sprite, generate_character_set, generate_tile)
⏳ **Claude Code Integration:** Pending configuration (follow steps above)

**Next:** After configuration, test tools with `/bmad-pro-build` to build Platform Runner game!
