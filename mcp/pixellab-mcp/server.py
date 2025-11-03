#!/usr/bin/env python3
"""
PixelLab MCP Server - Working Implementation
Exposes PixelLab API for AI-generated game sprites
Uses pixellab SDK v1.0.5 with generate_image_pixflux
"""

import os
from pathlib import Path
from typing import Optional, Dict, Any, List
import pixellab
from mcp.server.fastmcp import FastMCP

# Configuration
PIXELLAB_TOKEN = os.environ.get("PIXELLAB_TOKEN", "fcb0392c-15e9-4c8a-936d-15e05ec8b7e6")
DEFAULT_OUTPUT_DIR = os.environ.get(
    "PIXELLAB_OUTPUT_DIR",
    str(Path.home() / "GOLDKEY CHATTY" / "gkchatty-ecosystem" / "commisocial" / "public" / "assets" / "sprites")
)

# Create PixelLab client
pixellab_client = pixellab.Client(secret=PIXELLAB_TOKEN)

# Create FastMCP server
mcp = FastMCP("PixelLab MCP")

@mcp.tool()
def health() -> Dict[str, Any]:
    """Check PixelLab API health, token validity, and account balance"""
    try:
        balance = pixellab_client.get_balance()
        usd_balance = balance.usd if hasattr(balance, 'usd') else 0.0

        return {
            "ok": True,
            "message": "PixelLab API is accessible",
            "token_valid": True,
            "client": "pixellab SDK v1.0.5",
            "balance_usd": usd_balance,
            "subscription": "Tier 1 (1000 images/month)" if usd_balance == 0 else f"${usd_balance} USD"
        }
    except Exception as e:
        error_msg = str(e)
        return {
            "ok": False,
            "error": error_msg,
            "token_valid": "401" not in error_msg and "Unauthorized" not in error_msg
        }

@mcp.tool()
def generate_sprite(
    description: str,
    name: str = "sprite",
    width: int = 48,
    height: int = 48,
    view: str = "low top-down",
    direction: str = "south",
    no_background: bool = True,
    output_dir: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generate a single sprite with PixelLab.

    Args:
        description: Description of the sprite (e.g., "blue wizard with staff")
        name: Name for the sprite file (default: "sprite")
        width: Sprite width in pixels (default: 48)
        height: Sprite height in pixels (default: 48)
        view: Camera view - "low top-down", "side", "isometric" (default: "low top-down")
        direction: Facing direction - "north", "south", "east", "west" (default: "south")
        no_background: Transparent background (default: True)
        output_dir: Directory to save sprite (default: project assets)

    Returns:
        Dictionary with file path and generation details
    """
    try:
        # Generate sprite using PixelFlux
        response = pixellab_client.generate_image_pixflux(
            description=f"{description}, pixel art style",
            image_size=dict(width=width, height=height),
            view=view,
            direction=direction,
            no_background=no_background
        )

        if not response.image:
            return {
                "ok": False,
                "error": "No image in response",
                "description": description
            }

        # Save sprite
        output_path = Path(output_dir or DEFAULT_OUTPUT_DIR)
        output_path.mkdir(parents=True, exist_ok=True)

        filename = f"{name.lower().replace(' ', '_')}_{direction}.png"
        file_path = output_path / filename

        pil_image = response.image.pil_image()
        pil_image.save(file_path)

        return {
            "ok": True,
            "file_path": str(file_path),
            "filename": filename,
            "size": f"{width}x{height}",
            "direction": direction,
            "view": view,
            "description": description,
            "message": f"✅ Sprite saved to {file_path}"
        }

    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "description": description
        }

@mcp.tool()
def generate_character_set(
    description: str,
    name: str = "character",
    size: int = 48,
    directions: Optional[List[str]] = None,
    output_dir: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generate multiple directional sprites for a character.

    Args:
        description: Description of the character (e.g., "blue wizard with staff")
        name: Character name (used in filenames)
        size: Sprite size in pixels (default: 48)
        directions: List of directions - ["north", "south", "east", "west"] (default: all 4)
        output_dir: Directory to save sprites (default: project assets)

    Returns:
        Dictionary with all generated file paths
    """
    if directions is None:
        directions = ["north", "south", "east", "west"]

    results = []
    errors = []

    for direction in directions:
        result = generate_sprite(
            description=description,
            name=f"{name}",
            width=size,
            height=size,
            view="low top-down",
            direction=direction,
            no_background=True,
            output_dir=output_dir
        )

        if result.get("ok"):
            results.append(result)
        else:
            errors.append({
                "direction": direction,
                "error": result.get("error")
            })

    if not results:
        return {
            "ok": False,
            "error": "Failed to generate any sprites",
            "errors": errors
        }

    return {
        "ok": True,
        "character_name": name,
        "sprites_generated": len(results),
        "directions": [r["direction"] for r in results],
        "files": [r["file_path"] for r in results],
        "directory": str(Path(results[0]["file_path"]).parent),
        "errors": errors if errors else None,
        "message": f"✅ Generated {len(results)} sprites for {name}"
    }

@mcp.tool()
def generate_tile(
    description: str,
    name: str = "tile",
    size: int = 32,
    isometric: bool = False,
    output_dir: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generate an isometric or top-down tile.

    Args:
        description: Description of the tile (e.g., "grass block with flowers")
        name: Tile name (used in filename)
        size: Tile size in pixels (default: 32)
        isometric: Use isometric projection (default: False)
        output_dir: Directory to save tile (default: project assets/tiles)

    Returns:
        Dictionary with tile file path
    """
    try:
        # Generate tile
        response = pixellab_client.generate_image_pixflux(
            description=f"{description}, pixel art tile",
            image_size=dict(width=size, height=size),
            isometric=isometric,
            no_background=False
        )

        if not response.image:
            return {
                "ok": False,
                "error": "No image in response",
                "description": description
            }

        # Save tile
        output_path = Path(output_dir or DEFAULT_OUTPUT_DIR) / "tiles"
        output_path.mkdir(parents=True, exist_ok=True)

        filename = f"{name.lower().replace(' ', '_')}.png"
        file_path = output_path / filename

        pil_image = response.image.pil_image()
        pil_image.save(file_path)

        return {
            "ok": True,
            "file_path": str(file_path),
            "filename": filename,
            "size": f"{size}x{size}",
            "isometric": isometric,
            "description": description,
            "message": f"✅ Tile saved to {file_path}"
        }

    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "description": description
        }

if __name__ == "__main__":
    # Run the MCP server
    mcp.run()
