#!/bin/bash
cd /workspaces/Flow
git add -A
git commit -m "Fix PWA install: enable manifest and service worker"
git push origin main
rm -- "$0"
