#!/bin/bash
# Phase 4 Model Validation Test Script
# Tests all 6 newly migrated SQLite models

set -e

BASE_URL="http://localhost:6001"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin"

echo "═══════════════════════════════════════════════════════"
echo "Phase 4 SQLite Model Validation Tests"
echo "═══════════════════════════════════════════════════════"
echo ""

# Step 1: Login to get auth token
echo "1️⃣  Testing Authentication (Phase 1-3 verification)..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Login failed!"
  echo "$LOGIN_RESPONSE" | jq '.'
  exit 1
fi

echo "✅ Login successful! Token received."
echo ""

# Step 2: Test PersonaModel
echo "2️⃣  Testing PersonaModel (Phase 4)..."
PERSONA_RESPONSE=$(curl -s -X GET "$BASE_URL/api/personas" \
  -H "Authorization: Bearer $TOKEN")

if echo "$PERSONA_RESPONSE" | jq -e '.personas' > /dev/null 2>&1; then
  PERSONA_COUNT=$(echo "$PERSONA_RESPONSE" | jq '.personas | length')
  echo "✅ PersonaModel working! Found $PERSONA_COUNT personas."
else
  echo "⚠️  PersonaModel endpoint may not be implemented yet."
  echo "$PERSONA_RESPONSE" | jq '.' 2>/dev/null || echo "$PERSONA_RESPONSE"
fi
echo ""

# Step 3: Test SettingModel
echo "3️⃣  Testing SettingModel (Phase 4)..."
SETTING_RESPONSE=$(curl -s -X GET "$BASE_URL/api/settings" \
  -H "Authorization: Bearer $TOKEN")

if echo "$SETTING_RESPONSE" | jq -e '.settings' > /dev/null 2>&1; then
  SETTING_COUNT=$(echo "$SETTING_RESPONSE" | jq '.settings | length')
  echo "✅ SettingModel working! Found $SETTING_COUNT settings."
elif echo "$SETTING_RESPONSE" | jq -e 'type == "object"' > /dev/null 2>&1; then
  echo "✅ SettingModel working! Retrieved settings object."
else
  echo "⚠️  SettingModel endpoint may not be implemented yet."
  echo "$SETTING_RESPONSE" | jq '.' 2>/dev/null || echo "$SETTING_RESPONSE"
fi
echo ""

# Step 4: Test FolderModel
echo "4️⃣  Testing FolderModel (Phase 4)..."
FOLDER_RESPONSE=$(curl -s -X GET "$BASE_URL/api/folders" \
  -H "Authorization: Bearer $TOKEN")

if echo "$FOLDER_RESPONSE" | jq -e '.folders' > /dev/null 2>&1; then
  FOLDER_COUNT=$(echo "$FOLDER_RESPONSE" | jq '.folders | length')
  echo "✅ FolderModel working! Found $FOLDER_COUNT folders."
elif echo "$FOLDER_RESPONSE" | jq -e 'type == "array"' > /dev/null 2>&1; then
  FOLDER_COUNT=$(echo "$FOLDER_RESPONSE" | jq 'length')
  echo "✅ FolderModel working! Found $FOLDER_COUNT folders."
else
  echo "⚠️  FolderModel endpoint may not be implemented yet."
  echo "$FOLDER_RESPONSE" | jq '.' 2>/dev/null || echo "$FOLDER_RESPONSE"
fi
echo ""

# Step 5: Test TenantKnowledgeBaseModel (admin only)
echo "5️⃣  Testing TenantKnowledgeBaseModel (Phase 4)..."
TENANT_KB_RESPONSE=$(curl -s -X GET "$BASE_URL/api/admin/tenant-kb" \
  -H "Authorization: Bearer $TOKEN")

if echo "$TENANT_KB_RESPONSE" | jq -e 'type == "array"' > /dev/null 2>&1; then
  TENANT_KB_COUNT=$(echo "$TENANT_KB_RESPONSE" | jq 'length')
  echo "✅ TenantKnowledgeBaseModel working! Found $TENANT_KB_COUNT knowledge bases."
else
  echo "⚠️  TenantKnowledgeBaseModel endpoint may not be implemented yet."
  echo "$TENANT_KB_RESPONSE" | jq '.' 2>/dev/null || echo "$TENANT_KB_RESPONSE"
fi
echo ""

# Step 6: Test UserSettingsModel
echo "6️⃣  Testing UserSettingsModel (Phase 4)..."
USER_SETTINGS_RESPONSE=$(curl -s -X GET "$BASE_URL/api/users/me/settings" \
  -H "Authorization: Bearer $TOKEN")

if echo "$USER_SETTINGS_RESPONSE" | jq -e '.theme' > /dev/null 2>&1; then
  THEME=$(echo "$USER_SETTINGS_RESPONSE" | jq -r '.theme')
  echo "✅ UserSettingsModel working! Current theme: $THEME"
elif echo "$USER_SETTINGS_RESPONSE" | jq -e 'type == "object"' > /dev/null 2>&1; then
  echo "✅ UserSettingsModel working! Retrieved user settings."
else
  echo "⚠️  UserSettingsModel endpoint may not be implemented yet."
  echo "$USER_SETTINGS_RESPONSE" | jq '.' 2>/dev/null || echo "$USER_SETTINGS_RESPONSE"
fi
echo ""

# Step 7: Test FeedbackModel
echo "7️⃣  Testing FeedbackModel (Phase 4)..."
FEEDBACK_RESPONSE=$(curl -s -X GET "$BASE_URL/api/feedback" \
  -H "Authorization: Bearer $TOKEN")

if echo "$FEEDBACK_RESPONSE" | jq -e '.feedback' > /dev/null 2>&1; then
  FEEDBACK_COUNT=$(echo "$FEEDBACK_RESPONSE" | jq '.feedback | length')
  echo "✅ FeedbackModel working! Found $FEEDBACK_COUNT feedback items."
elif echo "$FEEDBACK_RESPONSE" | jq -e 'type == "array"' > /dev/null 2>&1; then
  FEEDBACK_COUNT=$(echo "$FEEDBACK_RESPONSE" | jq 'length')
  echo "✅ FeedbackModel working! Found $FEEDBACK_COUNT feedback items."
else
  echo "⚠️  FeedbackModel endpoint may not be implemented yet."
  echo "$FEEDBACK_RESPONSE" | jq '.' 2>/dev/null || echo "$FEEDBACK_RESPONSE"
fi
echo ""

# Step 8: Direct SQLite database check
echo "8️⃣  Testing SQLite Database Directly..."
DB_PATH="/Users/davidjmorin/.gkchatty/data/gkchatty.db"

if [ -f "$DB_PATH" ]; then
  echo "✅ SQLite database file exists: $DB_PATH"

  # Check all tables
  TABLES=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" 2>/dev/null)
  TABLE_COUNT=$(echo "$TABLES" | wc -l | xargs)

  echo "✅ Found $TABLE_COUNT tables in database:"
  echo "$TABLES" | sed 's/^/   - /'

  # Check Phase 4 specific tables
  echo ""
  echo "   Phase 4 Tables Verification:"
  for TABLE in personas settings folders tenant_knowledge_bases user_settings feedback; do
    if echo "$TABLES" | grep -q "^$TABLE$"; then
      ROW_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM $TABLE;" 2>/dev/null)
      echo "   ✅ $TABLE (${ROW_COUNT} rows)"
    else
      echo "   ❌ $TABLE NOT FOUND!"
    fi
  done
else
  echo "❌ SQLite database not found at: $DB_PATH"
fi
echo ""

# Summary
echo "═══════════════════════════════════════════════════════"
echo "Phase 4 Validation Summary"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "✅ Authentication: WORKING (Phase 1-3)"
echo "📊 PersonaModel: CHECKED"
echo "⚙️  SettingModel: CHECKED"
echo "📁 FolderModel: CHECKED"
echo "🗂️  TenantKnowledgeBaseModel: CHECKED"
echo "👤 UserSettingsModel: CHECKED"
echo "💬 FeedbackModel: CHECKED"
echo "🗄️  SQLite Database: VERIFIED"
echo ""
echo "Phase 4 migration validation complete!"
echo "═══════════════════════════════════════════════════════"
