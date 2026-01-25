#!/bin/bash

# Flow Animation Standardization Script
# Ensures consistent animation timing and easing across the app

cd /workspaces/Flow/Flow-main/components

echo "Standardizing animations..."

# Fix transition-colors (quick state changes)
find . -name "*.tsx" -type f -exec sed -i 's/transition-colors duration-[0-9]*ms/transition-colors duration-300/g' {} \;
find . -name "*.tsx" -type f -exec sed -i 's/transition-colors duration-\[.*\]/transition-colors duration-300/g' {} \;

# Fix transition-all (general transitions)
find . -name "*.tsx" -type f -exec sed -i 's/transition-all duration-[0-9]*ms/transition-all duration-400/g' {} \;
find . -name "*.tsx" -type f -exec sed -i 's/transition-all duration-\[.*\]/transition-all duration-400/g' {} \;

# Fix transition-opacity (fades)
find . -name "*.tsx" -type f -exec sed -i 's/transition-opacity duration-[0-9]*ms/transition-opacity duration-400/g' {} \;
find . -name "*.tsx" -type f -exec sed -i 's/transition-opacity duration-\[.*\]/transition-opacity duration-400/g' {} \;

# Fix transition-transform (movement)
find . -name "*.tsx" -type f -exec sed -i 's/transition-transform duration-[0-9]*ms/transition-transform duration-500/g' {} \;
find . -name "*.tsx" -type f -exec sed -i 's/transition-transform duration-\[.*\]/transition-transform duration-500/g' {} \;

# Standardize hover transitions
find . -name "*.tsx" -type f -exec sed -i 's/hover:scale-\[1\.[0-9]*\]/hover:scale-105/g' {} \;

echo "Animation standardization complete!"
echo "Standard durations:"
echo "  - Colors: 300ms"
echo "  - General: 400ms"  
echo "  - Movement: 500ms"
echo "  - Modals: 800ms"
