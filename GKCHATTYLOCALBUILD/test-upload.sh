#!/bin/bash

# Test document upload via API
# Login and get token first

echo "=== GKChatty Upload Test ==="
echo "1. Logging in..."

# Login to get auth token
TOKEN=$(curl -s -X POST http://localhost:6001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' \
  | jq -r '.token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ Login failed"
  exit 1
fi

echo "✅ Login successful"
echo "2. Uploading test document..."

# Create a simple test file
echo "This is a test document for GKChatty local upload verification." > /tmp/gkchatty-test.txt

# Upload the file
RESPONSE=$(curl -s -X POST http://localhost:6001/api/documents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/tmp/gkchatty-test.txt")

echo "Response:"
echo "$RESPONSE" | jq '.'

# Check if upload succeeded
DOC_ID=$(echo "$RESPONSE" | jq -r '.document._id // .document.id // empty')

if [ -n "$DOC_ID" ]; then
  echo "✅ Upload initiated with ID: $DOC_ID"
  echo "3. Waiting 5 seconds for processing..."
  sleep 5

  echo "4. Checking document status..."
  curl -s -X GET "http://localhost:6001/api/documents/$DOC_ID" \
    -H "Authorization: Bearer $TOKEN" \
    | jq '.status, .processingError, .errorCode'
else
  echo "❌ Upload failed"
fi

# Cleanup
rm -f /tmp/gkchatty-test.txt
