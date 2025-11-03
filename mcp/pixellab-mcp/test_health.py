#!/usr/bin/env python3
"""
Quick test of PixelLab API health check
"""
import os
import sys

# Set token
os.environ['PIXELLAB_TOKEN'] = 'fcb0392b15e9-4c8a-936d-15e05ec8b7e6'

# Import health function
from server import health

# Run test
print("Testing PixelLab API token...")
result = health()

import json
print(json.dumps(result, indent=2))

# Exit with appropriate code
if result.get('ok'):
    print("\n✅ PixelLab API token is valid!")
    sys.exit(0)
else:
    print(f"\n❌ PixelLab API token test failed: {result.get('error')}")
    sys.exit(1)
