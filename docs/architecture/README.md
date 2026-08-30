# StellarNest Architecture

## System overview

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React + Vite + TypeScript)                   │
│  pages → hooks → store (Zustand)                        │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│  Service layer                                          │
│  contractService · eventService · walletService         │
│  (the only modules that touch the network or the wallet)│
└───────────┬───────────────────────────┬─────────────────┘
            │ invoke / simulate         │ getEvents
┌───────────▼───────────┐               │
│  Savings Pool         │               │
│  membership + accounting              │
└───────────┬───────────┘               │
            │ deposit / withdraw        │
┌───────────▼───────────┐               │
│  Treasury             │               │
│  custody + fund accounting            │
└───────────┬───────────┘               │
            │ transfer                  │
┌───────────▼───────────┐               │
│  Stellar Asset Contract (XLM)         │
└───────────┬───────────┘               │
            │                           │
┌───────────▼───────────────────────────▼─────────────────┐
│  Stellar Testnet — ledger + Soroban RPC                 │
└─────────────────────────────────────────────────────────┘
```

## Why two contracts

The split is a trust boundary, not organisation for its own sake.

**Savings Pool** knows *who* is in a pool and *what* they are owed. It holds no funds.

**Treasury** holds funds and knows *how much* each pool has. It knows nothing about
membership.

Neither can act alone in a way that loses money:

- The treasury refuses `deposit` and `withdraw` from anyone except the one registered
  savings contract. A user calling it directly is rejected.
- The savings contract has no token balance to misplace — it can only ask the treasury to
  move funds, and only after its own membership and balance checks pass.

This means the fund accounting can be audited independently of the membership logic, and
the savings contract can be replaced (via `set_savings_contract`) without moving custody of
anyone's money.

## The contribution flow

```
User signs one transaction
        │
        ▼
savings.contribute(pool_id, member, amount)
        │  member.require_auth()
        │  pool exists? active? member enrolled? amount > 0?
        ▼
treasury.deposit(pool_id, member, amount)          ← cross-contract call
        │  savings.require_auth()  ← satisfied by contract invoker auth
        │  amount > 0?
        ▼
token.transfer(member → treasury, amount)          ← nested call
        │  covered by the member's root authorisation
        ▼
Treasury records the pool balance   → DepositRecorded
Savings records the member balance  → ContributionMade
```

The user signs exactly once. The member's `require_auth()` at the root of
`savings.contribute` covers the nested token transfer through Soroban's authorisation tree,
so there is no separate approve step.

**One consequence worth knowing:** when the treasury is called *directly* in isolation (as
its own unit tests do), the depositor's authorisation is no longer root-tied, and tests must
use `mock_all_auths_allowing_non_root_auth()`. In the real flow, through the savings
contract, plain root authorisation is correct.

## How the contracts are linked

The savings contract calls the treasury through a typed client generated from a locally
declared trait:

```rust
#[contractclient(name = "TreasuryClient")]
pub trait TreasuryInterface {
    fn deposit(env: Env, pool_id: u32, from: Address, amount: i128) -> i128;
    fn withdraw(env: Env, pool_id: u32, to: Address, amount: i128) -> i128;
    fn balance(env: Env, pool_id: u32) -> i128;
}
```

Two alternatives were rejected:

- **Depending on the treasury crate directly** would link its `#[contractimpl]` exports into
  the savings Wasm. The SDK warns about this explicitly: contract function exports are
  global and unnamespaced, so the savings contract would end up exporting `deposit` and
  `balance` too.
- **`contractimport!` of the built Wasm** works, but makes the treasury a *compile-time*
  dependency — its Wasm would have to exist before the savings crate could compile at all.

`#[contractclient]` generates only a client, no exports, and needs nothing built first. The
treasury crate remains a **dev**-dependency so the integration tests can register the real
implementation and exercise genuine cross-contract calls.

This is verifiable in the build output: the savings contract exports exactly its own 13
functions, with none of the treasury's among them.

## Frontend layering

| Layer | Responsibility | Rule |
|---|---|---|
| `services/` | Network and wallet access | The only place the Stellar SDK is imported |
| `store/` | What the UI is currently showing | Plain state; no network access |
| `hooks/` | Orchestration between the two | Where loading and error state is set |
| `components/`, `pages/` | Rendering | No SDK imports, no direct network calls |

Keeping services and store apart is what allows tests to drive the UI by seeding state
directly, and to stub the network at exactly one boundary per test.

`walletService` matters especially: `@creit.tech/stellar-wallets-kit` reads `localStorage`
at module load, so a static import anywhere would crash Node and jsdom. Every kit import is
dynamic and confined to that one module, which is therefore the single mock point in tests.

## Event streaming

Soroban RPC offers no subscriptions, so the frontend polls `getEvents` and merges results
into the store, de-duplicated by event id.

Three RPC constraints shape the implementation:

1. **Retention is a rolling window** — measured at 120,959 ledgers (~7.0 days) on Testnet.
   Requesting a start ledger older than `oldestLedger` is an *error*, not an empty result,
   so every start point is clamped to `oldestLedger + 1`.
2. **`startLedger` and `cursor` are mutually exclusive.** The first poll uses a clamped start
   ledger; subsequent polls use the returned cursor, which is exclusive.
3. **The forward scan is bounded.** RPC scans forward from `startLedger` across a limited
   number of ledgers per request, so an over-long lookback exhausts the budget in old
   ledgers and returns **zero events even when recent ones exist**. Measured against the
   deployed contracts: a 17,280-ledger lookback returned nothing while 6,000 returned
   everything. Hence `DEFAULT_LOOKBACK_LEDGERS = 6_000` (~8 hours), plus bounded catch-up
   paging — a page can come back empty while still advancing its cursor, so the hook follows
   up to six such pages per poll rather than leaving the feed blank on first load.

This third constraint is invisible to mocked tests; it only appeared once the contracts were
live and emitting real events.

If RPC ages out a held cursor, it is dropped and the next poll re-establishes a valid start
ledger rather than failing permanently.

Because of retention, the activity feed is a *recent activity* view, not full contract
history. A production deployment wanting complete history would index events into its own
store as they arrive.

## Data model

**Savings Pool**

| Key | Durability | Holds |
|---|---|---|
| `Admin`, `Treasury`, `PoolCount` | instance | Configuration and the id counter |
| `Pool(u32)` | persistent | The pool record |
| `Members(u32)` | persistent | Ordered member list |
| `MemberBalance(u32, Address)` | persistent | Net contributed per member |

**Treasury**

| Key | Durability | Holds |
|---|---|---|
| `Admin`, `Token`, `Savings`, `TotalHeld` | instance | Configuration and the running total |
| `PoolBalance(u32)` | persistent | Funds held for one pool |

Persistent entries expire unless extended, so every write extends the TTL of the entries it
touched: topped up when below 30 days remaining, extended to 90 days.

Member lists are read and rewritten whole, which is why `max_members` is capped at 100 — an
unbounded list would eventually exceed the invocation budget.
