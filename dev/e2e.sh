#!/bin/sh
# Opens a throwaway Obsidian window for a few seconds; your vault and profile are not touched.
export PLAYWRIGHT_CORE=${PLAYWRIGHT_CORE:-$(ls -d ~/.npm/_npx/*/node_modules/playwright-core | head -1)}
exec node "$(dirname "$0")/e2e.cjs"
