#!/usr/bin/env bash
#
# Confirms a StellarNest deployment is live and correctly wired.
#
# The critical check is the last one: the treasury must name the savings
# contract as its authorised caller. A deployment where that step was missed
# looks fine until the first contribution fails.
#
# Usage: ./scripts/deploy/verify.sh [SAVINGS_ID TREASURY_ID]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NETWORK="${NETWORK:-testnet}"
IDENTITY="${IDENTITY:-stellarnest-deployer}"
ENV_FILE="$ROOT/frontend/.env"

SAVINGS_ID="${1:-}"
TREASURY_ID="${2:-}"

if [[ -z "$SAVINGS_ID" || -z "$TREASURY_ID" ]] && [[ -f "$ENV_FILE" ]]; then
  SAVINGS_ID="${SAVINGS_ID:-$(grep '^VITE_SAVINGS_CONTRACT_ID=' "$ENV_FILE" | cut -d= -f2- || true)}"
  TREASURY_ID="${TREASURY_ID:-$(grep '^VITE_TREASURY_CONTRACT_ID=' "$ENV_FILE" | cut -d= -f2- || true)}"
fi

if [[ -z "$SAVINGS_ID" || -z "$TREASURY_ID" ]]; then
  echo "usage: $0 <SAVINGS_ID> <TREASURY_ID>" >&2
  echo "       (or run ./scripts/deploy/deploy.sh first)" >&2
  exit 1
fi

echo "==> Verifying deployment on $NETWORK"
echo "    Savings:  $SAVINGS_ID"
echo "    Treasury: $TREASURY_ID"

invoke() {
  local id="$1"
  shift
  stellar contract invoke \
    --id "$id" \
    --source-account "$IDENTITY" \
    --network "$NETWORK" \
    --send=no \
    -- "$@"
}

echo
echo "--> savings.pool_count"
POOL_COUNT="$(invoke "$SAVINGS_ID" pool_count)"
echo "    $POOL_COUNT"

echo "--> treasury.total_held"
TOTAL_HELD="$(invoke "$TREASURY_ID" total_held)"
echo "    $TOTAL_HELD"

echo "--> savings.treasury (should point at the treasury contract)"
LINKED_TREASURY="$(invoke "$SAVINGS_ID" treasury | tr -d '"')"
echo "    $LINKED_TREASURY"

echo "--> treasury.savings_contract (should point back at the savings contract)"
LINKED_SAVINGS="$(invoke "$TREASURY_ID" savings_contract | tr -d '"')"
echo "    $LINKED_SAVINGS"

echo
FAILED=0

if [[ "$LINKED_TREASURY" != "$TREASURY_ID" ]]; then
  echo "FAIL: savings contract points at '$LINKED_TREASURY', expected '$TREASURY_ID'" >&2
  FAILED=1
else
  echo "PASS: savings → treasury link is correct"
fi

if [[ "$LINKED_SAVINGS" != "$SAVINGS_ID" ]]; then
  echo "FAIL: treasury authorises '$LINKED_SAVINGS', expected '$SAVINGS_ID'" >&2
  echo "      Contributions will be rejected. Re-run set_savings_contract." >&2
  FAILED=1
else
  echo "PASS: treasury → savings authorisation is correct"
fi

echo
if [[ "$FAILED" -eq 0 ]]; then
  echo "Deployment verified: both contracts are live and mutually wired."
else
  echo "Deployment verification failed." >&2
  exit 1
fi
