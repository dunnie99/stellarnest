#!/usr/bin/env bash
#
# Builds and tests both StellarNest contracts.
#
# Usage: ./scripts/deploy/build.sh [--skip-tests]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTRACTS="$ROOT/contracts"
SKIP_TESTS="${1:-}"

echo "==> Checking toolchain"
command -v stellar >/dev/null 2>&1 || {
  echo "error: the 'stellar' CLI is not installed." >&2
  echo "       Install it with: cargo install --locked stellar-cli" >&2
  exit 1
}

# Soroban targets wasm32v1-none on any modern toolchain. Without it the build
# fails with a confusing "can't find crate for core".
if ! rustup target list --installed | grep -q '^wasm32v1-none$'; then
  echo "==> Installing wasm32v1-none target"
  rustup target add wasm32v1-none
fi

if [[ "$SKIP_TESTS" != "--skip-tests" ]]; then
  echo "==> Checking formatting"
  # `--all` is required: the workspace root is a virtual manifest with no
  # targets of its own, and cargo fmt otherwise reports "Failed to find targets".
  cargo fmt --manifest-path "$CONTRACTS/Cargo.toml" --all --check

  echo "==> Running clippy"
  cargo clippy --manifest-path "$CONTRACTS/Cargo.toml" --all-targets -- -D warnings

  echo "==> Running contract tests"
  cargo test --manifest-path "$CONTRACTS/Cargo.toml"
fi

echo "==> Building contracts"
stellar contract build --manifest-path "$CONTRACTS/Cargo.toml"

TREASURY_WASM="$CONTRACTS/target/wasm32v1-none/release/stellarnest_treasury.wasm"
SAVINGS_WASM="$CONTRACTS/target/wasm32v1-none/release/stellarnest_savings_pool.wasm"

for artifact in "$TREASURY_WASM" "$SAVINGS_WASM"; do
  if [[ ! -f "$artifact" ]]; then
    echo "error: expected artifact not found at $artifact" >&2
    exit 1
  fi
  echo "    $(basename "$artifact"): $(wc -c <"$artifact" | tr -d ' ') bytes"
done

echo
echo "Build complete."
