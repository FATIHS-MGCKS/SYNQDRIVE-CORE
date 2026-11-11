#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT/frontend"

export VSI_E2E_COMMIT_SHA="${GITHUB_SHA:-$(git -C "$ROOT" rev-parse HEAD)}"
export VSI_ARTIFACTS_DIR="$ROOT/frontend/test-results/vsi-p2395-artifacts"
mkdir -p "$VSI_ARTIFACTS_DIR"

if command -v lsof >/dev/null 2>&1; then
  for pid in $(lsof -t -i:5173 2>/dev/null || true); do
    kill "$pid" 2>/dev/null || true
  done
  sleep 1
fi
export CI=true

npm run test -- --run src/i18n/vsi-v2-native-locale.test.ts
npm run test -- --run src/master/shell/MasterPageTabs.test.tsx
npx tsc -b --pretty false
npm run i18n:check

npx playwright test -c e2e/playwright.config.ts vsi-master-intelligence-v2.spec.ts \
  --project=mobile-390 \
  --project=tablet-768 \
  --project=desktop-1440

npx tsx -e "import { bundleVsiScreenshotArtifactsZip } from './e2e/vsi-master-intelligence-v2-fixtures.ts'; bundleVsiScreenshotArtifactsZip(process.env.VSI_E2E_COMMIT_SHA ?? 'unknown');"

echo "VSI_V2_P2_CLOSEOUT_VERIFY=PASS commit=${VSI_E2E_COMMIT_SHA}"
