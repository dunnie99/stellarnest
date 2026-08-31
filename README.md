# StellarNest

Decentralised savings and thrift platform on the **Stellar Testnet**, built with two
Soroban smart contracts, a mobile-responsive React frontend, real-time event streaming, and
a full CI/CD pipeline.

Members create savings circles, join them, contribute periodically, and withdraw their own
balances. Membership logic and fund custody live in **separate contracts** so the money can
be audited independently of the bookkeeping.

---

## Features

| Area | What it does |
|---|---|
| Savings pools | Create circles with a contribution amount, cycle length, and member cap |
| Membership | Join pools, with duplicate and capacity limits enforced on-chain |
| Contributions | Funds move to the treasury via a genuine cross-contract call |
| Withdrawals | Members withdraw their own balance; the contract prevents draining others' |
| Live activity | Real-time feed of all four contract events, polled from Soroban RPC |
| Responsive UI | Dashboard, pool details, and activity feed across mobile, tablet and desktop |
| Testing | 45 contract tests (98.2% lines) and 131 frontend tests (>70% on all metrics) |
| CI/CD | PR checks plus a main-branch build → test → deploy → verify pipeline |

---

## Deployed contracts

Live on the **Stellar Testnet**:

| | Savings Pool | Treasury |
|---|---|---|
| **Address** | `CCFOC4U7OAABRXJQXLVRZ7FL5UMQ5T6BXJ53WNCYJXKE7SVHS3I55R2R` | `CDKVSTRN77GA344RTH6IE7HJZZFAZZFJI3KASTFCU3AENS2XMDOLDJP5` |
| **Explorer** | [view](https://stellar.expert/explorer/testnet/contract/CCFOC4U7OAABRXJQXLVRZ7FL5UMQ5T6BXJ53WNCYJXKE7SVHS3I55R2R) | [view](https://stellar.expert/explorer/testnet/contract/CDKVSTRN77GA344RTH6IE7HJZZFAZZFJI3KASTFCU3AENS2XMDOLDJP5) |

Deployer `GAG5VOLHAUVOXJTUFTUZGF3HGFQPRB6JEVFOOVAVDGM57FSMBSZXVZMO`; custodied token is the
XLM SAC. The two contracts are mutually wired — verified in both directions.

A full savings cycle has been executed against them on-chain: pool created, two members
joined, 125 XLM contributed, 40 XLM withdrawn, final state **85 XLM** reconciling exactly
between both contracts. All four required events were emitted and decoded. The security
properties were also confirmed live: a direct user call to the treasury is rejected, and a
member cannot withdraw beyond their own balance.

Full record, including every transaction hash, in [DEPLOYMENTS.md](../DEPLOYMENTS.md).

## Quick start

```bash
cd frontend && npm install && npm run dev
```

`frontend/.env` is already populated with both addresses.

To deploy your own instance:

```bash
./scripts/deploy/build.sh                          # build, lint, test
IDENTITY=dunddeploy ./scripts/deploy/deploy.sh     # deploy both + wire them
IDENTITY=dunddeploy ./scripts/deploy/verify.sh     # confirm the link both ways
```

**The app also runs without a deployment.** Routing, layout and forms all work, and a banner
explains what to run — only on-chain actions are unavailable.

### Requirements

- Rust with the `wasm32v1-none` target (`build.sh` installs it if missing)
- `stellar` CLI 27+ — `cargo install --locked stellar-cli`
- Node.js 20+
- `cargo-llvm-cov` for contract coverage — `cargo install cargo-llvm-cov`

### Frontend bundle strategy

The frontend keeps the initial route lean by loading each page on demand. Production builds
also isolate the React runtime, Stellar SDK, and wallet kit into stable, content-hashed vendor
chunks; modules shared by multiple routes are emitted as a separate `shared-app` chunk. This
keeps every generated JavaScript file below Vite's 500 kB warning threshold while preserving
long-term browser caching for dependencies that change infrequently.

Verify the generated chunk sizes locally with:

```bash
cd frontend && npm run build
```

---

## Project structure

```
stellarnest/
├── contracts/
│   ├── savings-pool/     membership and per-member accounting
│   └── treasury/         fund custody and per-pool accounting
├── frontend/
│   └── src/
│       ├── components/   UI, with reusable primitives in ui/
│       ├── hooks/        orchestration
│       ├── pages/        Dashboard · PoolDetails · Activity
│       ├── services/     the only modules that touch network or wallet
│       ├── store/        Zustand application state
│       └── utils/        formatting, error mapping, logging
├── scripts/deploy/       build.sh · deploy.sh · verify.sh
├── docs/
│   ├── architecture/     system design and data flow
│   └── contracts/        full contract reference
└── .github/workflows/    pr.yml · main.yml
```

---

## Architecture in one paragraph

The **savings-pool** contract knows who is in a pool and what they are owed; it holds no
funds. The **treasury** holds funds and knows how much each pool has; it knows nothing about
membership. The treasury refuses `deposit` and `withdraw` from anyone except the one
registered savings contract, so a user calling it directly is rejected — that is the trust
boundary the two-contract split exists to create.

The savings contract calls the treasury through a `#[contractclient]` trait declared
locally. That generates a typed client with **no exported functions**, so the treasury's
`#[contractimpl]` exports are not linked into the savings Wasm, and neither contract is a
build-time dependency of the other. The build output confirms it: savings-pool exports
exactly its own 13 functions.

Full detail in [docs/architecture](docs/architecture/README.md) and
[docs/contracts](docs/contracts/README.md).

---

## Environment configuration

Three environment files, per the deployment target:

| File | Purpose | Committed |
|---|---|---|
| `.env` | Local development; written by `deploy.sh` | No |
| `.env.test` | Test runs — structurally valid dummy contract IDs, silent logging | Yes |
| `.env.production` | Production builds, including Vercel; contains the public Testnet contract IDs | Yes |

| Variable | Default | Purpose |
|---|---|---|
| `VITE_SAVINGS_CONTRACT_ID` | — | Deployed savings contract |
| `VITE_TREASURY_CONTRACT_ID` | — | Deployed treasury contract |
| `VITE_SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` | Soroban RPC endpoint |
| `VITE_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | Network |
| `VITE_EVENT_POLL_MS` | `5000` | Activity feed poll interval |
| `VITE_LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` \| `silent` |

`.env.test` holds no secrets — its contract IDs are valid strkeys pointing at nothing, so
tests exercise the configured code paths rather than the setup banner. Every test stubs the
service layer, so no request is ever made.

### Vercel

Set the Vercel project root directory to `frontend`. The committed
`frontend/.env.production` contains the public Testnet addresses, so Vercel uses the live
contracts by default. If you deploy replacement contracts, configure these variables in
**Project Settings → Environment Variables** for Production and redeploy; Vite embeds them
in the build:

```text
VITE_SAVINGS_CONTRACT_ID=CCFOC4U7OAABRXJQXLVRZ7FL5UMQ5T6BXJ53WNCYJXKE7SVHS3I55R2R
VITE_TREASURY_CONTRACT_ID=CDKVSTRN77GA344RTH6IE7HJZZFAZZFJI3KASTFCU3AENS2XMDOLDJP5
```

---

## Testing

```bash
# Contracts — 45 tests
cd contracts && cargo test
cargo llvm-cov --summary-only --fail-under-lines 70    # 98.2% lines

# Frontend — 131 tests
cd frontend && npm test
npm run test:coverage                                  # thresholds enforced at 70%
```

Contract tests register **both** contracts against a real Stellar Asset Contract, so
contributions and withdrawals exercise genuine cross-contract calls and real token movement
rather than mocks. Coverage: savings-pool 97.2%, treasury 95.5%.

Frontend tests cover the four required areas — wallet connect/disconnect, dashboard
rendering, the contribution workflow including failure handling, and the live event feed —
plus event decoding, error mapping, state management, and the UI primitives. Coverage
thresholds (70% on lines, functions, branches and statements) are enforced by
`vite.config.ts` and fail the build when missed.

The wallet kit is mocked globally in `src/test/setup.ts`, because it reads `localStorage` at
module load and cannot be imported under jsdom at all.

### Live verification

```bash
cd frontend
VERIFY_SOURCE_ACCOUNT=GAG5VOLHAUVOXJTUFTUZGF3HGFQPRB6JEVFOOVAVDGM57FSMBSZXVZMO npm run verify
```

Runs the **shipped service modules** against the deployed contracts: loads pools, checks
that the savings-side and treasury-side balances reconcile, and decodes the real emitted
events with the same code the activity feed uses — asserting all four required events
appear and are attributed to the correct contract.

A source account is needed because contract reads are simulations, which require one.

---

## CI/CD

**`pr.yml`** — on every pull request, in parallel:

- *Contracts*: `cargo fmt --check`, `clippy -D warnings`, `cargo test`, coverage gated at
  70%, then `stellar contract build` with the Wasm uploaded as an artifact.
- *Frontend*: lint, typecheck, tests with coverage, and a production build.

**`main.yml`** — on pushes to `main`:

```
verify (lint · test · coverage)
   ↓
deploy (build → deploy both contracts → wire them → verify)
   ↓
build-frontend (against the freshly deployed addresses)
```

The deploy job needs a funded Testnet key in the `STELLAR_DEPLOYER_SECRET` repository
secret. **Without it the job is skipped rather than failed**, so a fork or a fresh clone
still gets a green pipeline. Contract addresses are published to the run summary and
deployment logs are uploaded as artifacts.

The CLI accepts a raw `S…` secret key wherever an identity name is expected, so CI needs no
`stellar keys add` step and no OS credential store.

---

## Deployment

`scripts/deploy/deploy.sh` performs the whole sequence, and **order matters**:

1. Create and fund a Testnet identity if one does not exist (Friendbot; guarded to test
   networks only).
2. Build both contracts if artifacts are missing.
3. Resolve the XLM Stellar Asset Contract as the custodied token.
4. Deploy the **treasury** — it must exist before the savings contract can name it.
5. Deploy the **savings pool**, constructed against the treasury's address.
6. Call `treasury.set_savings_contract(savings)`. **Until this lands every contribution is
   rejected**, which is the design working as intended.
7. Write both IDs into `frontend/.env` and log the run to `scripts/deploy/logs/`.

`verify.sh` checks the link in both directions — savings → treasury and treasury → savings —
because a deployment that skipped step 6 looks healthy until the first contribution fails.

---

## Logging

`utils/logger.ts` routes all diagnostics through one levelled logger controlled by
`VITE_LOG_LEVEL`, so verbosity is configuration rather than scattered `console.log` calls,
and there is a single place to forward errors to a reporting service later. Deployment runs
are logged to `scripts/deploy/logs/`; event and error logging runs through the same logger
in the browser.

---

## Error handling

Every failure maps onto a closed set of user-facing messages, so no path collapses into a
generic error:

| Condition | Message |
|---|---|
| No wallet connected | `Please connect your wallet.` |
| Balance too low | `Insufficient balance.` |
| Not permitted | `You are not authorized to perform this action.` |
| Contract rejected the call | `Transaction failed.` |
| RPC unreachable | `Unable to connect to Stellar network.` |
| Signature declined | `Transaction was rejected.` |

Loading states use the specified wording: `Connecting Wallet...`, `Loading Savings Pool...`,
`Processing Contribution...`, `Processing Withdrawal...`.

---

## Known constraints

These are properties of the platform, surfaced rather than hidden.

**The activity feed covers recent ledgers, not full history.** Two separate RPC limits apply.
Retention is a rolling ~7-day window (measured at 120,959 ledgers), and a request older than
`oldestLedger` is an error rather than an empty result. Independently, `getEvents` scans
*forward* across a bounded number of ledgers per request, so an over-long lookback returns
**zero events even when recent ones exist** — measured live, a 17,280-ledger lookback found
nothing while 6,000 found everything. Hence `DEFAULT_LOOKBACK_LEDGERS = 6_000` plus bounded
catch-up paging in `useContractEvents`. Full history would require indexing events into a
store as they arrive.

**Pools are capped at 100 members.** Member lists are read and rewritten whole, so an
unbounded list would eventually exceed the invocation budget.

**Reads require a connected wallet.** Contract reads are simulations, and a simulation needs
a source account. Without a wallet there is nothing to simulate from, so the UI prompts for
a connection instead of erroring.
