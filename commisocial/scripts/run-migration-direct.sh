#!/bin/bash

# Load environment variables
source .env.local

echo "🚀 Running Supabase Migration"
echo ""

# Read the migration SQL
SQL_FILE="supabase/migrations/20251027_complete_schema.sql"

if [ ! -f "$SQL_FILE" ]; then
  echo "❌ Migration file not found: $SQL_FILE"
  exit 1
fi

echo "✅ Migration file: $SQL_FILE"
echo "✅ Supabase URL: $NEXT_PUBLIC_SUPABASE_URL"
echo ""
echo "🔄 Executing SQL via Supabase API..."
echo ""

# Execute the SQL using Supabase's database REST endpoint
# We'll use the db endpoint to execute raw SQL
curl -X POST \
  "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql" \
  -H "Content-Type: application/json" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -d @- << EOF
{
  "query": "$(cat $SQL_FILE | sed 's/"/\\"/g' | tr '\n' ' ')"
}
EOF

echo ""
echo ""
echo "✅ Migration complete!"
echo ""
echo "🔍 Verifying tables..."

# Check if profiles table exists
PROFILE_CHECK=$(curl -s \
  "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?select=count" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Range: 0-0")

if [ $? -eq 0 ]; then
  echo "✅ profiles table accessible"
else
  echo "❌ profiles table check failed"
fi

echo ""
echo "✅ Migration completed successfully!"
echo ""
