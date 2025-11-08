# User Custom Prompt Migration Script

## Overview

This script migrates existing `UserSettings.customPrompt` data to the new `PersonaModel` structure as part of the Enhanced Persona Management System implementation.

## Purpose

- Transfer existing user custom prompts from `UserSettings.customPrompt` to new `Persona` documents
- Maintain backward compatibility during the transition to the new persona system
- Ensure data integrity with comprehensive error handling and transaction support

## Features

- **Idempotency**: Safe to run multiple times without creating duplicates
- **Dry Run Mode**: Preview changes without modifying the database
- **Transaction Support**: Atomic operations per user to ensure data consistency
- **Comprehensive Logging**: Detailed progress and error reporting
- **Batch Processing**: Processes all users sequentially with individual error handling

## Usage

### Prerequisites

1. Ensure the API server is stopped to avoid conflicts
2. Verify MongoDB connection is available
3. Ensure all environment variables are properly configured

### Running the Script

#### Dry Run (Recommended First)

```bash
# From the project root
pnpm ts-node apps/api/src/scripts/migrateUserCustomPrompts.ts --dry-run
```

#### Actual Migration

```bash
# From the project root
pnpm ts-node apps/api/src/scripts/migrateUserCustomPrompts.ts
```

### Command Line Options

- `--dry-run`: Preview mode - shows what would be migrated without making changes

## Migration Logic

### Per User Process

1. **Eligibility Check**: User must have:

   - A `UserSettings` document
   - `customPromptMigratedToPersona` flag set to `false` (or not set)
   - Non-empty `customPrompt` content (after trimming)

2. **Duplicate Check**: Verify user doesn't already have a persona named "My Custom Prompt"

3. **Persona Creation**:

   - **Name**: "My Custom Prompt"
   - **Prompt**: Content from `UserSettings.customPrompt`
   - **User ID**: Linked to the respective user
   - **Active Status**: Set to `true` if `User.isPersonaEnabled === true`, otherwise `false`

4. **User Update**: If persona is set as active, update `User.activePersonaId`

5. **Migration Flag**: Set `UserSettings.customPromptMigratedToPersona = true`

### Skipping Scenarios

- **Empty Prompts**: Users with null/empty custom prompts are marked as migrated but no persona is created
- **Already Migrated**: Users with `customPromptMigratedToPersona = true` are skipped
- **Duplicate Names**: Users who already have a "My Custom Prompt" persona are marked as migrated

## Example Output

### Dry Run Example

```
[2025-01-25T10:30:00.000Z] INFO: 🔍 RUNNING IN DRY RUN MODE - No changes will be made to the database
[2025-01-25T10:30:00.100Z] INFO: Found 15 total users
[2025-01-25T10:30:00.150Z] INFO: User alice eligible for migration (prompt length: 245)
[2025-01-25T10:30:00.151Z] INFO: [DRY RUN] Would create persona "My Custom Prompt" for user alice (active: true)
[2025-01-25T10:30:00.200Z] DEBUG: User bob has empty custom prompt. Marking as migrated.
[2025-01-25T10:30:00.250Z] DEBUG: User charlie already migrated. Skipping.

📊 MIGRATION SUMMARY:
Total users found: 15
Eligible for migration: 3
Successfully migrated: 3
Skipped (empty prompt): 8
Skipped (already migrated): 4
Skipped (duplicate name): 0
Errors encountered: 0

🔍 DRY RUN COMPLETE - No changes were made to the database
```

### Actual Migration Example

```
[2025-01-25T10:35:00.000Z] INFO: 🚀 RUNNING MIGRATION - Changes will be made to the database
[2025-01-25T10:35:00.100Z] INFO: Found 15 total users
[2025-01-25T10:35:00.150Z] INFO: User alice eligible for migration (prompt length: 245)
[2025-01-25T10:35:00.151Z] INFO: Processing user alice (507f1f77bcf86cd799439011)
[2025-01-25T10:35:00.200Z] INFO: Created persona "My Custom Prompt" for user alice
[2025-01-25T10:35:00.201Z] INFO: Set persona "My Custom Prompt" as active for user alice
[2025-01-25T10:35:00.202Z] INFO: Successfully migrated custom prompt for user alice

📊 MIGRATION SUMMARY:
Total users found: 15
Eligible for migration: 3
Successfully migrated: 3
Skipped (empty prompt): 8
Skipped (already migrated): 4
Skipped (duplicate name): 0
Errors encountered: 0

✅ MIGRATION COMPLETE
```

## Database Changes

### UserSettings Model Updates

Added new field:

```typescript
customPromptMigratedToPersona?: boolean; // Default: false
```

### Created Documents

For each migrated user:

- New `Persona` document with name "My Custom Prompt"
- Updated `User.activePersonaId` (if persona is activated)
- Updated `UserSettings.customPromptMigratedToPersona = true`

## Error Handling

- **Individual User Errors**: Script continues processing other users if one fails
- **Transaction Rollback**: Database changes for a user are rolled back if any step fails
- **Detailed Error Logging**: All errors are logged with user context
- **Error Summary**: Final report includes error count and details

## Safety Features

- **MongoDB Transactions**: Ensures atomicity per user migration
- **Idempotency**: Safe to re-run without creating duplicates
- **Validation**: Input validation before database operations
- **Dry Run**: Preview mode to verify migration plan

## Post-Migration Verification

After running the migration, verify:

1. **Persona Creation**: Users with custom prompts now have "My Custom Prompt" personas
2. **Migration Flags**: All processed users have `customPromptMigratedToPersona = true`
3. **Active Personas**: Users with `isPersonaEnabled = true` have correct `activePersonaId`
4. **Data Integrity**: Original custom prompt content matches persona prompt content

## Troubleshooting

### Common Issues

1. **MongoDB Connection**: Ensure `MONGODB_URI` environment variable is set
2. **Permission Errors**: Run with appropriate database permissions
3. **Memory Issues**: For large user bases, consider implementing batch processing

### Recovery

If migration fails partway through:

- Re-run the script (idempotency ensures safe re-execution)
- Check error logs for specific user issues
- Use dry run mode to verify remaining work

## Technical Notes

- **Default Persona Name**: "My Custom Prompt" (configurable in script)
- **Transaction Scope**: Per-user (not global) for better error isolation
- **Logging Level**: INFO for progress, DEBUG for detailed operations
- **Memory Usage**: Sequential processing minimizes memory footprint
