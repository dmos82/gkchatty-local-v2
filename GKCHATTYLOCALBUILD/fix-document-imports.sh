#!/bin/bash

# Fix Document Model Imports for SQLite Migration Phase 2
# Changes direct MongoDB imports to use modelFactory

echo "=== Fixing Document Model Imports ==="

# Backup directory
BACKUP_DIR="./backend-backup-phase2-$(date +%Y%m%d-%H%M%S)"
echo "Creating backup at: $BACKUP_DIR"
cp -r backend/src "$BACKUP_DIR"

# Files to fix (core files only - skipping scripts for Phase 4)
FILES=(
  "backend/src/services/userDocumentProcessor.ts"
  "backend/src/services/ragService.ts"
  "backend/src/utils/documentProcessor.ts"
  "backend/src/controllers/admin.controller.ts"
  "backend/src/controllers/adminSystemKbController.ts"
  "backend/src/controllers/folderController.ts"
  "backend/src/routes/searchRoutes.ts"
  "backend/src/routes/systemKbRoutes.ts"
  "backend/src/routes/adminRoutes.ts"
  "backend/src/routes/healthRoutes.ts"
)

echo ""
echo "Fixing UserDocument imports..."
for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "Processing: $file"

    # Fix UserDocument import
    sed -i '' "s|from '../models/UserDocument'|from '../utils/modelFactory'|g" "$file"
    sed -i '' "s|from '../../models/UserDocument'|from '../../utils/modelFactory'|g" "$file"
    sed -i '' "s|from './models/UserDocument'|from './utils/modelFactory'|g" "$file"

    # Fix the import statement to use UserDocumentModel
    sed -i '' "s|import { UserDocument|import { UserDocumentModel as UserDocument|g" "$file"

    # Keep IUserDocument import from model
    # (If import was combined, we need to separate them)
    # This is a simplified approach - may need manual review

  else
    echo "File not found: $file"
  fi
done

echo ""
echo "Fixing SystemKbDocument imports..."
for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "Processing: $file"

    # Fix SystemKbDocument import
    sed -i '' "s|from '../models/SystemKbDocument'|from '../utils/modelFactory'|g" "$file"
    sed -i '' "s|from '../../models/SystemKbDocument'|from '../../utils/modelFactory'|g" "$file"
    sed -i '' "s|from './models/SystemKbDocument'|from './utils/modelFactory'|g" "$file"

    # Fix the import statement to use SystemKbDocumentModel
    sed -i '' "s|import { SystemKbDocument|import { SystemKbDocumentModel as SystemKbDocument|g" "$file"

  fi
done

echo ""
echo "=== Import fixing complete! ==="
echo "Backup created at: $BACKUP_DIR"
echo ""
echo "Next steps:"
echo "1. Review changes: git diff backend/src"
echo "2. Test the backend: npm run dev (in backend directory)"
echo "3. If there are issues, restore from backup: rm -rf backend/src && mv $BACKUP_DIR backend/src"
