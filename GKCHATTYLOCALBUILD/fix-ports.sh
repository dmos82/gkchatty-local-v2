#!/bin/bash

# Script to replace all 4001/4003 references with 6001/6004 in LOCALBUILD

echo "Fixing port references in LOCALBUILD..."
echo "Replacing 4001 → 6001 (backend)"
echo "Replacing 4003 → 6004 (frontend)"

# Function to replace in files
replace_in_files() {
    local search="$1"
    local replace="$2"

    # Find and replace in all text files, excluding node_modules and .git
    find . \
        -type f \
        \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \
           -o -name "*.json" -o -name "*.env*" -o -name "*.md" \
           -o -name "*.yml" -o -name "*.yaml" -o -name "*.config.*" \) \
        -not -path "*/node_modules/*" \
        -not -path "*/.git/*" \
        -not -path "*/dist/*" \
        -not -path "*/build/*" \
        -not -path "*/.next/*" \
        -not -name "*.min.js" \
        -exec grep -l "$search" {} \; | while read file; do
        echo "Fixing: $file"
        sed -i.bak "s/$search/$replace/g" "$file"
        # Remove backup file
        rm -f "${file}.bak"
    done
}

# Replace port 4001 with 6001 (backend)
replace_in_files "4001" "6001"

# Replace port 4003 with 6004 (frontend)
replace_in_files "4003" "6004"

echo "Done! All port references have been updated."
echo ""
echo "Summary of changes:"
echo "- Backend port: 4001 → 6001"
echo "- Frontend port: 4003 → 6004"
echo ""
echo "Please restart your services to apply the changes."