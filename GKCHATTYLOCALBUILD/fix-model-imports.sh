#!/bin/bash

# GKCHATTYLOCALBUILD - Automated Model Import Fixer
# Replaces MongoDB model imports with modelFactory imports
# Phase 1: UserModel only (auth system)

set -e  # Exit on error

BACKEND_SRC="/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/GKCHATTYLOCALBUILD/backend/src"

echo "=== GKCHATTYLOCALBUILD Model Import Fixer ==="
echo "Phase 1: Fixing UserModel imports for Auth System"
echo ""

# Backup first
BACKUP_DIR="/Users/davidjmorin/GOLDKEY CHATTY/gkchatty-ecosystem/GKCHATTYLOCALBUILD/backend-backup-$(date +%Y%m%d-%H%M%S)"
echo "Creating backup at: $BACKUP_DIR"
cp -r "$BACKEND_SRC" "$BACKUP_DIR"
echo "✅ Backup created"
echo ""

# Counter for changes
TOTAL_FIXED=0

# Files to fix (auth-related only for Phase 1)
AUTH_FILES=(
  "middleware/authMiddleware.ts"
  "routes/authRoutes.ts"
  "controllers/admin.controller.ts"
  "routes/adminRoutes.ts"
  "routes/userRoutes.ts"
  "routes/chatRoutes.ts"
  "routes/healthRoutes.ts"
  "controllers/userSettingsController.ts"
  "services/personaService.ts"
)

echo "Files to fix:"
for file in "${AUTH_FILES[@]}"; do
  echo "  - $file"
done
echo ""

# Function to fix a file
fix_file() {
  local file="$1"
  local full_path="$BACKEND_SRC/$file"

  if [[ ! -f "$full_path" ]]; then
    echo "⚠️  Skipped (not found): $file"
    return
  fi

  # Check if file has UserModel import
  if ! grep -q "from.*models/UserModel" "$full_path"; then
    echo "⏭️  Skipped (no import): $file"
    return
  fi

  echo "🔧 Fixing: $file"

  # Pattern 1: import User, { IUser } from '../models/UserModel';
  # Replace with: import { UserModel as User, IUser } from '../utils/modelFactory';
  sed -i '' "s|import User, { IUser } from '\.\./models/UserModel';|import { UserModel as User } from '../utils/modelFactory';\nimport { IUser } from '../models/UserModel';|g" "$full_path"

  # Pattern 2: import User from '../models/UserModel';
  # Replace with: import { UserModel as User } from '../utils/modelFactory';
  sed -i '' "s|import User from '\.\./models/UserModel';|import { UserModel as User } from '../utils/modelFactory';|g" "$full_path"

  # Pattern 3: Different path levels (../../models/UserModel)
  sed -i '' "s|import User from '\.\./\.\./models/UserModel';|import { UserModel as User } from '../../utils/modelFactory';|g" "$full_path"

  # Pattern 4: import User, { IUser } from '../../models/UserModel';
  sed -i '' "s|import User, { IUser } from '\.\./\.\./models/UserModel';|import { UserModel as User } from '../../utils/modelFactory';\nimport { IUser } from '../../models/UserModel';|g" "$full_path"

  echo "✅ Fixed: $file"
  TOTAL_FIXED=$((TOTAL_FIXED + 1))
}

# Fix each file
for file in "${AUTH_FILES[@]}"; do
  fix_file "$file"
done

echo ""
echo "=== Summary ==="
echo "Total files fixed: $TOTAL_FIXED"
echo "Backup location: $BACKUP_DIR"
echo ""
echo "Next steps:"
echo "1. Restart backend: npm run dev"
echo "2. Test login:"
echo "   curl -X POST http://localhost:6001/api/auth/login \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"username\":\"admin\",\"password\":\"admin\"}'"
echo ""
echo "If issues occur, restore backup:"
echo "  rm -rf $BACKEND_SRC"
echo "  mv $BACKUP_DIR $BACKEND_SRC"
