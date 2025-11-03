#!/usr/bin/env python3
"""
Generate all sprites for Platform Runner game using PixelLab
"""
import os
from pathlib import Path
import pixellab
import time

# Configuration
PIXELLAB_TOKEN = "fcb0392c-15e9-4c8a-936d-15e05ec8b7e6"
OUTPUT_DIR = Path("/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/platform-runner/public/assets")

# Create client
client = pixellab.Client(secret=PIXELLAB_TOKEN)

print("=" * 70)
print("PLATFORM RUNNER - SPRITE GENERATION")
print("=" * 70)

# Check balance
balance = client.get_balance()
print(f"\n💰 Balance: ${balance.usd} USD")
print(f"📊 Total sprites to generate: 9\n")

sprites_generated = []

def generate_sprite(name, description, size, output_path, view="low top-down", direction="south"):
    """Generate and save a single sprite"""
    print(f"🎨 Generating: {name}")
    print(f"   Description: {description}")
    print(f"   Size: {size}x{size}px")

    try:
        response = client.generate_image_pixflux(
            description=description,
            image_size=dict(width=size, height=size),
            view=view,
            direction=direction,
            no_background=True
        )

        if response.image:
            pil_image = response.image.pil_image()
            output_path.parent.mkdir(parents=True, exist_ok=True)
            pil_image.save(output_path)
            file_size = output_path.stat().st_size
            print(f"   ✅ Saved: {output_path.name} ({file_size:,} bytes)\n")
            sprites_generated.append(name)
            return True
        else:
            print(f"   ❌ No image in response\n")
            return False
    except Exception as e:
        print(f"   ❌ Error: {e}\n")
        return False

# Generate Player Sprites (48x48px)
print("-" * 70)
print("PLAYER SPRITES (48x48px)")
print("-" * 70)

generate_sprite(
    "player-idle",
    "pixel art character, mario-style hero with red cap and blue overalls, standing idle pose, front view, 8-bit retro game style",
    48,
    OUTPUT_DIR / "sprites" / "player-idle.png"
)
time.sleep(2)  # Rate limiting

generate_sprite(
    "player-walk-left",
    "pixel art character, mario-style hero with red cap and blue overalls, walking left, side view, 8-bit retro game style",
    48,
    OUTPUT_DIR / "sprites" / "player-walk-left.png",
    direction="west"
)
time.sleep(2)

generate_sprite(
    "player-walk-right",
    "pixel art character, mario-style hero with red cap and blue overalls, walking right, side view, 8-bit retro game style",
    48,
    OUTPUT_DIR / "sprites" / "player-walk-right.png",
    direction="east"
)
time.sleep(2)

generate_sprite(
    "player-jump",
    "pixel art character, mario-style hero with red cap and blue overalls, jumping mid-air, arms up, 8-bit retro game style",
    48,
    OUTPUT_DIR / "sprites" / "player-jump.png"
)
time.sleep(2)

# Generate Enemy Sprites (32x32px)
print("-" * 70)
print("ENEMY SPRITES (32x32px)")
print("-" * 70)

generate_sprite(
    "enemy-goomba",
    "pixel art enemy creature, small brown mushroom-like monster with angry eyes, goomba style, 8-bit retro game, top-down view",
    32,
    OUTPUT_DIR / "sprites" / "enemy-goomba.png"
)
time.sleep(2)

generate_sprite(
    "enemy-flying",
    "pixel art flying enemy, red winged creature with sharp teeth, flying pose, 8-bit retro game style, side view",
    32,
    OUTPUT_DIR / "sprites" / "enemy-flying.png"
)
time.sleep(2)

# Generate Coin (24x24px)
print("-" * 70)
print("COLLECTIBLE SPRITES (24x24px)")
print("-" * 70)

generate_sprite(
    "coin",
    "pixel art golden coin with shine, simple round shape, 8-bit retro game style, top-down view",
    24,
    OUTPUT_DIR / "sprites" / "coin.png"
)
time.sleep(2)

# Generate Platform Tiles (32x32px)
print("-" * 70)
print("PLATFORM TILES (32x32px)")
print("-" * 70)

generate_sprite(
    "platform-grass",
    "pixel art grass platform tile, green grass on brown dirt, top view, 8-bit retro game style, tileable",
    32,
    OUTPUT_DIR / "tiles" / "platform-grass.png"
)
time.sleep(2)

generate_sprite(
    "platform-stone",
    "pixel art stone platform tile, gray stone bricks, top view, 8-bit retro game style, tileable",
    32,
    OUTPUT_DIR / "tiles" / "platform-stone.png"
)

print("=" * 70)
print("✅ SPRITE GENERATION COMPLETE!")
print("=" * 70)
print(f"\n📊 Successfully generated: {len(sprites_generated)}/9 sprites\n")
print("Generated sprites:")
for sprite in sprites_generated:
    print(f"  ✅ {sprite}")

print(f"\n📁 Output directory: {OUTPUT_DIR}")
print("\nNext step: Update BootScene.ts to load these sprites!")
