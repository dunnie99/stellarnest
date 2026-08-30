# StellarNest Demo Guide

This five-minute walkthrough demonstrates the complete savings-circle flow on
Stellar Testnet. Use the deployed addresses in the project README, or deploy a
fresh instance with the scripts below.

## 1. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Connect a Testnet wallet funded with XLM. The dashboard confirms the configured
Savings Pool and Treasury contract addresses.

## 2. Create and fund a savings circle

1. Select **Create Pool**, give the circle a name, amount, cycle, and member limit.
2. Connect a second Testnet account and join the pool.
3. Make contributions from both accounts.

The wallet signs one transaction per contribution. In that transaction the Savings Pool
validates membership, calls Treasury `deposit`, and the treasury transfers XLM through the
Stellar Asset Contract. The dashboard's Live Activity Feed shows the contribution events.

## 3. Demonstrate a protected withdrawal

1. Withdraw an amount no larger than the connected member's contribution.
2. Attempt a larger amount to show the member-balance protection and friendly error state.
3. Confirm the remaining member balance and pool total update in the UI.

The Treasury records the matching withdrawal and cannot be called directly by a user; only
the registered Savings Pool contract has authority to move custody funds.

## 4. Verify independently

```bash
cd frontend
VERIFY_SOURCE_ACCOUNT=<funded-testnet-address> npm run verify
```

The verification script reads both contracts and decodes their recent events. It confirms
that savings-side totals reconcile with treasury balances and that all event types are present.

## 5. Show the delivery safeguards

```bash
./scripts/check-requirements.sh
cd contracts && cargo test
cd ../frontend && npm test && npm run build
```

The requirements check validates the project evidence for every assessed area; the test and
build commands demonstrate the contract, frontend, and production bundle safeguards.
