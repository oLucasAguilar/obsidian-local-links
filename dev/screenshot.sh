#!/bin/sh
# Regenerates docs/demo-dark.png and docs/demo-light.png. Opens a throwaway Obsidian window twice.
export PLAYWRIGHT_CORE=${PLAYWRIGHT_CORE:-$(ls -d ~/.npm/_npx/*/node_modules/playwright-core | head -1)}
exec node "$(dirname "$0")/screenshot.cjs"
