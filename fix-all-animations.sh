#!/bin/bash
cd /workspaces/Flow/Flow-main/components

# Fix all remaining animation patterns more aggressively
for file in *.tsx; do
    # Multi-line pattern: initial={{ ... }} spanning lines
    perl -i -0pe 's/initial=\{\{[^}]+\}\}/initial={false}/gs' "$file"
done

echo "Fixed all animation patterns in components"
