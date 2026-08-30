#!/usr/bin/env bash
#
# Deploys both StellarNest contracts to the Stellar Testnet and wires them
# together.
#
# Order matters. The treasury must exist before the savings contract can be
# constructed against it, and the treasury must then be told which savings
# contract is allowed to move funds — until that call lands, every deposit is
# rejected by design.
#
# Usage:
#   ./scripts/deploy/deploy.sh
#   IDENTITY=my-key ./scripts/deploy/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTRACTS="$ROOT/contracts"
NETWORK="${NETWORK:-testnet}"
IDENTITY="${IDENTITY:-stellarnest-deployer}"

TREASURY_WASM="$CONTRACTS/target/wasm32v1-none/release/stellarnest_treasury.wasm"
SAVINGS_WASM="$CONTRACTS/target/wasm32v1-none/release/stellarnest_savings_pool.wasm"

LOG_DIR="$ROOT/scripts/deploy/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/deploy-$(date -u +%Y%m%dT%H%M%SZ).log"

log() {
  echo "$@" | tee -a "$LOG_FILE"
}

log "==> StellarNest deployment"
log "    Network: $NETWORK"
log "    Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ---------------------------------------------------------------- identity
if ! stellar keys address "$IDENTITY" >/dev/null 2>&1; then
  if [[ "$NETWORK" != "testnet" && "$NETWORK" != "futurenet" ]]; then
    echo "error: identity '$IDENTITY' does not exist and cannot be auto-funded on $NETWORK." >&2
    exit 1
  fi
  log "==> Creating and funding identity '$IDENTITY'"
  stellar keys generate "$IDENTITY" --network "$NETWORK" --fund
fi

DEPLOYER="$(stellar keys address "$IDENTITY")"
log "    Deployer: $DEPLOYER"

# ---------------------------------------------------------------- build
if [[ ! -f "$TREASURY_WASM" || ! -f "$SAVINGS_WASM" ]]; then
  log "==> Artifacts missing; building first"
  "$ROOT/scripts/deploy/build.sh"
fi

# ---------------------------------------------------------------- token
# The treasury custodies a token. On Testnet the native XLM Stellar Asset
# Contract is the sensible default.
TOKEN_ID="${TOKEN_ID:-$(stellar contract id asset --asset native --network "$NETWORK")}"
log "    Token (XLM SAC): $TOKEN_ID"

# ---------------------------------------------------------------- treasury
log "==> Deploying treasury"
TREASURY_ID="$(
  stellar contract deploy \
    --wasm "$TREASURY_WASM" \
    --source-account "$IDENTITY" \
    --network "$NETWORK" \
    --alias stellarnest-treasury \
    -- \
    --admin "$DEPLOYER" \
    --token "$TOKEN_ID" \
  | tail -n 1
)"
[[ -n "$TREASURY_ID" ]] || { echo "error: treasury deployment returned no contract ID." >&2; exit 1; }
log "    Treasury: $TREASURY_ID"

# ---------------------------------------------------------------- savings
log "==> Deploying savings pool"
SAVINGS_ID="$(
  stellar contract deploy \
    --wasm "$SAVINGS_WASM" \
    --source-account "$IDENTITY" \
    --network "$NETWORK" \
    --alias stellarnest-savings \
    -- \
    --admin "$DEPLOYER" \
    --treasury "$TREASURY_ID" \
  | tail -n 1
)"
[[ -n "$SAVINGS_ID" ]] || { echo "error: savings deployment returned no contract ID." >&2; exit 1; }
log "    Savings:  $SAVINGS_ID"

# ---------------------------------------------------------------- wiring
# Without this the treasury refuses every deposit, since no savings contract is
# authorised to move funds.
log "==> Authorising the savings contract on the treasury"
stellar contract invoke \
  --id "$TREASURY_ID" \
  --source-account "$IDENTITY" \
  --network "$NETWORK" \
  -- \
  set_savings_contract \
  --savings "$SAVINGS_ID" | tee -a "$LOG_FILE"

# ---------------------------------------------------------------- env
ENV_FILE="$ROOT/frontend/.env"
touch "$ENV_FILE"
# A temp file keeps this portable across GNU and BSD sed.
grep -v -e '^VITE_SAVINGS_CONTRACT_ID=' -e '^VITE_TREASURY_CONTRACT_ID=' \
  "$ENV_FILE" >"$ENV_FILE.tmp" 2>/dev/null || true
mv "$ENV_FILE.tmp" "$ENV_FILE"
{
  echo "VITE_SAVINGS_CONTRACT_ID=$SAVINGS_ID"
  echo "VITE_TREASURY_CONTRACT_ID=$TREASURY_ID"
} >>"$ENV_FILE"

log ""
log "Deployment complete."
log "  Treasury contract: $TREASURY_ID"
log "  Savings contract:  $SAVINGS_ID"
log "  Network:           $NETWORK"
log "  Deployer:          $DEPLOYER"
log "  Written to:        $ENV_FILE"
log "  Log:               $LOG_FILE"
log ""
log "Verify with: ./scripts/deploy/verify.sh"
