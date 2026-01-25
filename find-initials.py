#!/usr/bin/env python3
import os
import re
from pathlib import Path

components_dir = Path('/workspaces/Flow/Flow-main/components')
results = []

for tsx_file in components_dir.glob('*.tsx'):
    with open(tsx_file, 'r') as f:
        content = f.read()
        # Find initial={{ patterns
        matches = re.finditer(r'initial=\{\{[^}]+\}\}', content, re.MULTILINE | re.DOTALL)
        for match in matches:
            line_num = content[:match.start()].count('\n') + 1
            snippet = match.group(0)[:80]
            results.append(f"{tsx_file.name}:{line_num}: {snippet}")

if results:
    print(f"Found {len(results)} remaining initial={{}} patterns:\n")
    for r in results:
        print(r)
else:
    print("No remaining initial={{}} patterns found!")
