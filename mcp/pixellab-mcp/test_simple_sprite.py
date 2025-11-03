#!/usr/bin/env python3
"""
Simple test of PixelLab sprite generation using available SDK methods
"""
import os
from pathlib import Path
import pixellab

# Configuration
PIXELLAB_TOKEN = os.environ.get("PIXELLAB_TOKEN", "fcb0392c-15e9-4c8a-936d-15e05ec8b7e6")
OUTPUT_DIR = Path.home() / "GOLDKEY CHATTY" / "gkchatty-ecosystem" / "commisocial" / "public" / "assets" / "sprites"

# Create client
client = pixellab.Client(secret=PIXELLAB_TOKEN)

print("=" * 60)
print("PixelLab Simple Sprite Test")
print("=" * 60)

# Check balance
print("\n[1/3] Checking balance...")
balance = client.get_balance()
print(f"✅ Balance: ${balance.usd} USD")

# Generate sprite
print("\n[2/3] Generating wizard sprite...")
print("   Description: 'blue wizard with tall staff'")
print("   Size: 48x48px")
print("   View: top-down")

response = client.generate_image_pixflux(
    description="blue wizard character with tall staff and blue robe, pixel art style",
    image_size=dict(width=48, height=48),
    view="low top-down",  # Top-down view
    direction="south",     # Facing south
    no_background=True     # Transparent background
)

# Save image
output_path = OUTPUT_DIR / "test_wizard.png"
output_path.parent.mkdir(parents=True, exist_ok=True)

if response.image:
    # Get PIL Image from Base64Image object
    pil_image = response.image.pil_image()
    pil_image.save(output_path)
    print(f"✅ Sprite generated and saved!")
    print(f"   File: {output_path}")
    print(f"   Size: {pil_image.size}")
else:
    print("❌ No image in response")
    exit(1)

# Verify
print("\n[3/3] Verifying file...")
if output_path.exists():
    size = output_path.stat().st_size
    print(f"✅ File exists: {size:,} bytes")
else:
    print("❌ File not found")
    exit(1)

print("\n" + "=" * 60)
print("✅ TEST COMPLETE!")
print("=" * 60)
print(f"\nGenerated sprite: {output_path}")
print(f"Open the file to view your AI-generated wizard sprite!")
print(f"\nTo generate multiple directions, call generate_image_pixflux")
print(f"with direction='north', 'south', 'east', 'west'")
