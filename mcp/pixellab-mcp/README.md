# PixelLab MCP Server

AI-generated pixel art sprites for game development via Model Context Protocol (MCP).

## Features

- **Character Generation**: Multi-directional character sprites (1, 4, or 8 directions)
- **Tile Generation**: Isometric and top-down tiles
- **Async Generation**: Poll-based status checking
- **Auto-Download**: Saves sprites to project directory
- **Integration**: Works with BMAD Phase 4 workflow

## Installation

```bash
cd mcp/pixellab-mcp
pip3 install -r requirements.txt
```

## Configuration

Set environment variables:

```bash
export PIXELLAB_TOKEN="fcb0392b15e9-4c8a-936d-15e05ec8b7e6"
export PIXELLAB_OUTPUT_DIR="/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/commisocial/public/assets/sprites"
```

Or configure in Claude Code MCP config:

```json
{
  "mcpServers": {
    "pixellab": {
      "command": "python3",
      "args": ["/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/mcp/pixellab-mcp/server.py"],
      "env": {
        "PIXELLAB_TOKEN": "fcb0392b15e9-4c8a-936d-15e05ec8b7e6",
        "PIXELLAB_OUTPUT_DIR": "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/commisocial/public/assets/sprites"
      }
    }
  }
}
```

## MCP Tools

### 1. `health()`
Check API connectivity and token validity.

```python
mcp__pixellab__health()
# → {"ok": true, "message": "PixelLab API is accessible", "token_valid": true}
```

### 2. `generate_character(description, name, size, n_directions)`
Start character sprite generation.

**Args:**
- `description` (str): Character description (e.g., "blue wizard with staff")
- `name` (str): Character name for filenames (default: "Character")
- `size` (int): Sprite size - 16, 32, 48, or 64 (default: 32)
- `n_directions` (int): Number of views - 1, 4, or 8 (default: 4)

**Returns:**
```json
{
  "ok": true,
  "character_id": "abc123",
  "status": "generating",
  "message": "Use get_character_status('abc123') to check progress."
}
```

### 3. `get_character_status(character_id)`
Check generation progress.

**Args:**
- `character_id` (str): ID from generate_character

**Returns (in progress):**
```json
{
  "ok": true,
  "character_id": "abc123",
  "status": "generating",
  "message": "Still generating... Status: generating"
}
```

**Returns (completed):**
```json
{
  "ok": true,
  "character_id": "abc123",
  "status": "completed",
  "sprites": [
    {"direction": "north", "image_url": "https://..."},
    {"direction": "south", "image_url": "https://..."}
  ],
  "message": "Character ready! 4 sprites available."
}
```

### 4. `download_character_sprites(character_id, output_dir, name)`
Download completed sprites.

**Args:**
- `character_id` (str): ID from generate_character
- `output_dir` (str, optional): Output directory (default: configured path)
- `name` (str, optional): Character name for filenames

**Returns:**
```json
{
  "ok": true,
  "character_id": "abc123",
  "character_name": "wizard",
  "sprites_saved": 4,
  "directory": "/path/to/sprites/wizard",
  "files": [
    "/path/to/sprites/wizard/wizard_north.png",
    "/path/to/sprites/wizard/wizard_south.png"
  ]
}
```

### 5. `generate_and_download_character(description, name, size, n_directions, max_wait)`
All-in-one: Generate → Wait → Download.

**Args:** Same as generate_character, plus:
- `max_wait` (int): Max seconds to wait (default: 60)

**Returns:** Same as download_character_sprites

**Example:**
```python
mcp__pixellab__generate_and_download_character(
  description="blue wizard with staff",
  name="wizard",
  size=48,
  n_directions=4,
  max_wait=90
)
```

### 6. `generate_tile(description, name, size)`
Generate isometric or top-down tile.

**Args:**
- `description` (str): Tile description (e.g., "grass block with flowers")
- `name` (str): Tile name (default: "Tile")
- `size` (int): Tile size - 16, 32, or 64 (default: 32)

**Returns:**
```json
{
  "ok": true,
  "tile_name": "grass",
  "file_path": "/path/to/sprites/tiles/grass.png",
  "size": 32
}
```

## Usage with BMAD Phase 4

During BMAD Phase 4 (Implementation), Builder can generate sprites on-demand:

**Step in plan:** "Generate player character sprite (blue wizard, 48px, 4 directions)"

**Builder executes:**
```python
result = mcp__pixellab__generate_and_download_character(
  description="blue wizard with tall staff and blue robe",
  name="player",
  size=48,
  n_directions=4
)

# Result: Sprites saved to public/assets/sprites/player/
# Files: player_north.png, player_south.png, player_east.png, player_west.png
```

**Import into game:**
```javascript
// Phaser 3 example
this.load.image('player-north', '/assets/sprites/player/player_north.png');
this.load.image('player-south', '/assets/sprites/player/player_south.png');
```

## API Reference

**PixelLab API Base:** `https://api.pixellab.ai`

**Endpoints:**
- `POST /v1/characters/generate` - Start character generation
- `GET /v1/characters/{id}` - Check status
- `POST /v1/images/generate` - Generate tile

**Token:** Configured via `PIXELLAB_TOKEN` environment variable

## Workflow

```
1. Generate → POST /v1/characters/generate
   ↓
2. Poll → GET /v1/characters/{id} (every 5s)
   ↓
3. Download → GET sprite URLs from response
   ↓
4. Save → Write PNG files to output directory
```

**Generation Time:** ~15-45 seconds depending on complexity

## Error Handling

**Invalid Token:**
```json
{"ok": false, "error": "Invalid or expired token", "token_valid": false}
```

**Generation Timeout:**
```json
{"ok": false, "error": "Generation timed out", "character_id": "abc123"}
```

**Not Ready:**
```json
{"ok": false, "error": "Character not ready yet", "current_status": "generating"}
```

## Testing

```bash
# Test health check
npm test

# Or manually
python3 -c "from server import health; print(health())"
```

## Integration with AI Bridge

For Godot game engine integration, combine with AI Bridge MCP:

```python
# 1. Generate sprite with PixelLab
mcp__pixellab__generate_and_download_character(...)

# 2. Import to Godot with AI Bridge
mcp__aibridge__add_sprite(
  path="res://assets/sprites/player/player_north.png",
  node_name="Player",
  position=[400, 300]
)
```

See: `docs/bmad/PIXELLAB-AI-BRIDGE-INTEGRATION.md`

## Status

✅ **Phase 1 Complete** - MCP Server Implementation
- 6 tools implemented
- HTTP-based (no Python package dependency)
- FastMCP pattern
- Environment variable configuration

⏳ **Phase 1 In Progress** - Testing
- Token validation
- Sprite generation test
- Claude Code MCP configuration

📋 **Phase 2 Planned** - AI Bridge Integration (optional)

🎮 **Phase 3 Planned** - BMAD Integration

🚀 **Phase 4 Planned** - Platform Runner Test Game

## Documentation

- [Integration Plan](../../commisocial/docs/bmad/PIXELLAB-AI-BRIDGE-INTEGRATION.md)
- [BMAD Complete Guide](../../commisocial/docs/bmad/BMAD-COMPLETE-GUIDE.md)
- [MCP Tools Status](../../commisocial/docs/bmad/MCP-TOOLS-STATUS.md)

---

**Built with:** FastMCP + PixelLab API
**Pattern:** Async generation with polling
**Status:** ✅ Phase 1 Implementation Complete
