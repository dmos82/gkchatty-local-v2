#!/usr/bin/env python3
"""
Test PixelLab MCP tools directly
"""
import os
import sys

# Add current directory to path
sys.path.insert(0, os.path.dirname(__file__))

# Set environment variables
os.environ["PIXELLAB_TOKEN"] = "fcb0392c-15e9-4c8a-936d-15e05ec8b7e6"
os.environ["PIXELLAB_OUTPUT_DIR"] = "/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/mcp/pixellab-mcp/test_output"

# Import server functions
from server import health, generate_sprite, generate_tile

print("=" * 60)
print("PixelLab MCP Tools Test")
print("=" * 60)

# Test 1: Health Check
print("\n1. Testing health()...")
result = health()
print(f"   Result: {result}")
if result.get("ok"):
    print(f"   ✅ Health check passed")
    print(f"   Balance: {result.get('balance_usd')} USD")
    print(f"   Subscription: {result.get('subscription')}")
else:
    print(f"   ❌ Health check failed: {result.get('error')}")
    sys.exit(1)

# Test 2: Generate Test Sprite
print("\n2. Testing generate_sprite()...")
result = generate_sprite(
    description="blue wizard with staff",
    name="test_wizard",
    width=48,
    height=48,
    direction="south"
)
print(f"   Result: {result}")
if result.get("ok"):
    print(f"   ✅ Sprite generated successfully")
    print(f"   File: {result.get('file_path')}")
else:
    print(f"   ❌ Sprite generation failed: {result.get('error')}")

# Test 3: Generate Test Tile
print("\n3. Testing generate_tile()...")
result = generate_tile(
    description="grass block with flowers",
    name="test_grass",
    size=32,
    isometric=False
)
print(f"   Result: {result}")
if result.get("ok"):
    print(f"   ✅ Tile generated successfully")
    print(f"   File: {result.get('file_path')}")
else:
    print(f"   ❌ Tile generation failed: {result.get('error')}")

print("\n" + "=" * 60)
print("Test Complete!")
print("=" * 60)
