#!/bin/bash

# Fix Phase 4 Model Imports Script
# Converts direct model imports to modelFactory imports

echo "=== Fixing Phase 4 Model Imports ==="

# PersonaModel fixes
echo "Fixing PersonaModel imports..."
find backend/src -name "*.ts" -type f ! -name "*.test.ts" ! -path "*/models/*" ! -path "*/utils/*" -exec sed -i.bak \
  -e "s/import PersonaModel from ['\"].*PersonaModel['\"]/import { PersonaModel } from '..\/utils\/modelFactory'/g" \
  -e "s/import { PersonaModel } from ['\"].*PersonaModel['\"]/import { PersonaModel } from '..\/utils\/modelFactory'/g" \
  -e "s/import { default as PersonaModel/import { PersonaModel/g" \
  {} \;

# SettingModel fixes
echo "Fixing SettingModel imports..."
find backend/src -name "*.ts" -type f ! -name "*.test.ts" ! -path "*/models/*" ! -path "*/utils/*" -exec sed -i.bak \
  -e "s/import Setting from ['\"].*SettingModel['\"]/import { SettingModel as Setting } from '..\/utils\/modelFactory'/g" \
  -e "s/import { default as Setting } from ['\"].*SettingModel['\"]/import { SettingModel as Setting } from '..\/utils\/modelFactory'/g" \
  {} \;

# FolderModel fixes
echo "Fixing FolderModel imports..."
find backend/src -name "*.ts" -type f ! -name "*.test.ts" ! -path "*/models/*" ! -path "*/utils/*" -exec sed -i.bak \
  -e "s/import { Folder } from ['\"].*FolderModel['\"]/import { FolderModel as Folder } from '..\/utils\/modelFactory'/g" \
  {} \;

# TenantKnowledgeBase fixes
echo "Fixing TenantKnowledgeBase imports..."
find backend/src -name "*.ts" -type f ! -name "*.test.ts" ! -path "*/models/*" ! -path "*/utils/*" -exec sed -i.bak \
  -e "s/import { TenantKnowledgeBase } from ['\"].*TenantKnowledgeBase['\"]/import { TenantKnowledgeBaseModel as TenantKnowledgeBase } from '..\/utils\/modelFactory'/g" \
  {} \;

# UserSettings fixes
echo "Fixing UserSettings imports..."
find backend/src -name "*.ts" -type f ! -name "*.test.ts" ! -path "*/models/*" ! -path "*/utils/*" -exec sed -i.bak \
  -e "s/import UserSettings from ['\"].*UserSettings['\"]/import { UserSettingsModel as UserSettings } from '..\/utils\/modelFactory'/g" \
  -e "s/import { default as UserSettings } from ['\"].*UserSettings['\"]/import { UserSettingsModel as UserSettings } from '..\/utils\/modelFactory'/g" \
  {} \;

# Feedback fixes
echo "Fixing Feedback imports..."
find backend/src -name "*.ts" -type f ! -name "*.test.ts" ! -path "*/models/*" ! -path "*/utils/*" -exec sed -i.bak \
  -e "s/import Feedback from ['\"].*Feedback\.model['\"]/import { FeedbackModel as Feedback } from '..\/utils\/modelFactory'/g" \
  -e "s/import { default as Feedback } from ['\"].*Feedback\.model['\"]/import { FeedbackModel as Feedback } from '..\/utils\/modelFactory'/g" \
  {} \;

# Remove backup files
echo "Cleaning up backup files..."
find backend/src -name "*.bak" -type f -delete

echo "=== Phase 4 imports fixed! ==="
echo ""
echo "Fixed files count:"
echo "- PersonaModel: $(grep -r "PersonaModel.*from.*modelFactory" backend/src --include="*.ts" | wc -l)"
echo "- SettingModel: $(grep -r "SettingModel.*from.*modelFactory" backend/src --include="*.ts" | wc -l)"
echo "- FolderModel: $(grep -r "FolderModel.*from.*modelFactory" backend/src --include="*.ts" | wc -l)"
echo "- TenantKnowledgeBaseModel: $(grep -r "TenantKnowledgeBaseModel.*from.*modelFactory" backend/src --include="*.ts" | wc -l)"
echo "- UserSettingsModel: $(grep -r "UserSettingsModel.*from.*modelFactory" backend/src --include="*.ts" | wc -l)"
echo "- FeedbackModel: $(grep -r "FeedbackModel.*from.*modelFactory" backend/src --include="*.ts" | wc -l)"
