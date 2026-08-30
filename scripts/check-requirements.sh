#!/usr/bin/env bash
# Verifies that the project continues to contain the evidence required for the
# StellarNest delivery checklist. This is intentionally dependency-free so it
# can run locally and in GitHub Actions.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

require_file() {
  [[ -f "$1" ]] || {
    echo "Missing required file: $1" >&2
    exit 1
  }
}

require_text() {
  local file="$1"
  local text="$2"
  grep -Fq -- "$text" "$file" || {
    echo "Missing required evidence in $file: $text" >&2
    exit 1
  }
}

echo "==> Inter-contract communication"
require_file contracts/savings-pool/src/treasury_interface.rs
require_text contracts/savings-pool/src/treasury_interface.rs 'pub trait TreasuryInterface'
require_text contracts/savings-pool/src/lib.rs 'treasury_client(&env)?.deposit'
require_text contracts/savings-pool/src/lib.rs 'treasury_client(&env)?.withdraw'
require_text contracts/treasury/src/lib.rs 'fn require_savings_caller'

echo "==> Event streaming and real-time updates"
require_text frontend/src/hooks/useContractEvents.ts 'window.setInterval'
require_text frontend/src/services/eventService.ts 'getEvents'
require_text frontend/src/components/ActivityFeed.tsx "'Live'"

echo "==> CI/CD and deployment"
require_file .github/workflows/pr.yml
require_file .github/workflows/main.yml
require_text .github/workflows/pr.yml 'cargo test'
require_text .github/workflows/pr.yml 'npm run test:coverage'
require_text .github/workflows/main.yml './scripts/deploy/deploy.sh'
require_text .github/workflows/main.yml './scripts/deploy/verify.sh'
[[ -x scripts/deploy/build.sh && -x scripts/deploy/deploy.sh && -x scripts/deploy/verify.sh ]] || {
  echo 'Deployment scripts must be executable.' >&2
  exit 1
}

echo "==> Responsive UI and resilient UX"
require_text frontend/src/pages/Dashboard.tsx 'sm:grid-cols-4'
require_text frontend/src/App.tsx 'flex flex-wrap'
require_text frontend/src/components/ui/StatusMessage.tsx 'role="alert"'
require_text frontend/src/components/ui/StatusMessage.tsx 'role="status"'
require_text frontend/src/components/RouteFallback.tsx 'Loading page'

echo "==> Automated testing and production architecture"
require_file contracts/savings-pool/src/test.rs
require_file contracts/treasury/src/test.rs
require_file frontend/src/services/contractService.test.ts
require_file frontend/src/pages/Dashboard.test.tsx
require_text frontend/vite.config.ts 'thresholds:'
require_text frontend/vite.config.ts 'codeSplitting:'

echo "==> Documentation and demo"
require_file README.md
require_file docs/architecture/README.md
require_file docs/contracts/README.md
require_file docs/demo.md

echo 'All delivery requirement checks passed.'
