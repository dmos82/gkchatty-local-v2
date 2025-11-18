#!/bin/bash
# Test Smart Routing Feature

echo "=== Testing Smart Routing Feature ===="
echo ""

# Step 1: Login
echo "Step 1: Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:4001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "dev", "password": "dev123"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Login failed!"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Login successful. Token: ${TOKEN:0:30}..."
echo ""

# Step 2: Check current smart routing status
echo "Step 2: Checking current feature flags..."
FEATURES=$(curl -s http://localhost:4001/api/features)
SMART_ROUTING=$(echo "$FEATURES" | jq -r '.features.smartRouting')
echo "Smart Routing: $SMART_ROUTING"
echo ""

# Step 3: Test with simple query (smart routing DISABLED)
echo "Step 3: Testing simple query with smart routing DISABLED..."
CHAT_RESPONSE=$(curl -s -X POST http://localhost:4001/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "What is React?", "searchMode": "system-kb"}')

echo "Response received."
echo "$CHAT_RESPONSE" | jq '.message' | head -c 100
echo "..."
echo ""

# Step 4: Enable smart routing
echo "Step 4: Enabling smart routing..."
UPDATE_RESPONSE=$(curl -s -X PUT http://localhost:4001/api/settings/features \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"smartRouting": true}')

NEW_SMART_ROUTING=$(echo "$UPDATE_RESPONSE" | jq -r '.features.smartRouting')
echo "Smart Routing enabled: $NEW_SMART_ROUTING"
echo ""

# Step 5: Test with complex query (smart routing ENABLED)
echo "Step 5: Testing complex query with smart routing ENABLED..."
COMPLEX_QUERY="Analyze and compare the trade-offs between using Redux versus React Context API for state management in a large-scale enterprise application. Consider scalability, performance implications, developer experience, and long-term maintainability. Please provide specific examples and explain the reasoning behind each consideration."

CHAT_RESPONSE_2=$(curl -s -X POST http://localhost:4001/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"$COMPLEX_QUERY\", \"searchMode\": \"system-kb\"}")

echo "Response received."
echo "$CHAT_RESPONSE_2" | jq '.message' | head -c 100
echo "..."
echo ""

# Step 6: Disable smart routing (restore original state)
echo "Step 6: Restoring smart routing to original state ($SMART_ROUTING)..."
curl -s -X PUT http://localhost:4001/api/settings/features \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"smartRouting\": $SMART_ROUTING}" > /dev/null

echo "✅ Smart routing restored to: $SMART_ROUTING"
echo ""
echo "=== Test Complete ==="
echo ""
echo "Check the backend logs for complexity analysis and model routing details."
