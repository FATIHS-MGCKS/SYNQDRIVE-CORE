#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

bash "$ROOT/scripts/audits/test-audit-dependencies-baseline-resolution.sh"
bash "$ROOT/scripts/audits/test-dependency-audit-baseline-regression.sh"

echo "AUDIT_DEPENDENCIES_EXEC_HARNESS=PASS"
