#!/usr/bin/env python3
"""
Test PixelLab sprite generation with Tier 1 subscription
Generates a test character sprite to verify everything works
"""
import os
import time
from pathlib import Path
import pixellab
import httpx

# Configuration
PIXELLAB_TOKEN = os.environ.get("PIXELLAB_TOKEN", "fcb0392c-15e9-4c8a-936d-15e05ec8b7e6")
OUTPUT_DIR = Path.home() / "GOLDKEY CHATTY" / "gkchatty-ecosystem" / "commisocial" / "public" / "assets" / "sprites"

# Create client
client = pixellab.Client(secret=PIXELLAB_TOKEN)

print("=" * 60)
print("PixelLab Sprite Generation Test")
print("=" * 60)

# Step 1: Check balance
print("\n[1/5] Checking account balance...")
try:
    balance = client.get_balance()
    print(f"✅ Balance: ${balance.usd} USD")
    print(f"   Subscription: Tier 1 (1000 images/month)")
except Exception as e:
    print(f"❌ Balance check failed: {e}")
    exit(1)

# Step 2: Generate character
print("\n[2/5] Generating test character sprite...")
print("   Description: 'blue wizard with tall staff'")
print("   Size: 48px")
print("   Directions: 4 (north, south, east, west)")

try:
    response = client.generate_character_pixflux(
        description="blue wizard with tall staff and blue robe",
        name="wizard_test",
        size=48,
        n_directions=4,
        view="low top-down"
    )

    character_id = response.character_id
    print(f"✅ Generation started!")
    print(f"   Character ID: {character_id}")
except Exception as e:
    print(f"❌ Generation failed: {e}")
    exit(1)

# Step 3: Wait for completion
print("\n[3/5] Waiting for generation to complete...")
max_wait = 90  # 90 seconds max
waited = 0
poll_interval = 5

while waited < max_wait:
    time.sleep(poll_interval)
    waited += poll_interval

    try:
        character = client.get_character(character_id)

        if character.rotations:
            print(f"✅ Generation complete! (took {waited}s)")
            print(f"   Generated {len(character.rotations)} directional sprites")
            break
        else:
            print(f"   ⏳ Still generating... ({waited}s elapsed)")
    except Exception as e:
        print(f"❌ Status check failed: {e}")
        exit(1)

if waited >= max_wait:
    print(f"❌ Generation timed out after {max_wait}s")
    exit(1)

# Step 4: Download sprites
print("\n[4/5] Downloading sprites...")
output_path = OUTPUT_DIR / "wizard_test"
output_path.mkdir(parents=True, exist_ok=True)

saved_files = []
try:
    with httpx.Client(timeout=30.0) as http_client:
        for rotation in character.rotations:
            direction = rotation.direction
            image_url = rotation.image_url

            # Download image
            img_response = http_client.get(image_url)
            img_response.raise_for_status()

            # Save to file
            filename = f"wizard_test_{direction}.png"
            file_path = output_path / filename
            file_path.write_bytes(img_response.content)
            saved_files.append(str(file_path))
            print(f"   ✅ {filename} ({len(img_response.content)} bytes)")

    print(f"\n✅ Downloaded {len(saved_files)} sprites to:")
    print(f"   {output_path}")
except Exception as e:
    print(f"❌ Download failed: {e}")
    exit(1)

# Step 5: Verify files
print("\n[5/5] Verifying downloaded files...")
for file_path in saved_files:
    path = Path(file_path)
    if path.exists():
        size = path.stat().st_size
        print(f"   ✅ {path.name} - {size:,} bytes")
    else:
        print(f"   ❌ {path.name} - Missing!")

print("\n" + "=" * 60)
print("✅ TEST COMPLETE - Sprite generation working!")
print("=" * 60)
print(f"\nGenerated sprites saved to:")
print(f"{output_path}")
print(f"\nNext steps:")
print("1. Open sprites in image viewer to verify quality")
print("2. Configure Claude Code MCP to use these tools")
print("3. Integrate with BMAD Phase 4 workflow")
print("4. Build Platform Runner game with AI sprites!")
