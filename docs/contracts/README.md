# Contract Reference

Both contracts are built with soroban-sdk 27.0.6 and target `wasm32v1-none`.

| Contract | Crate | Size (optimised) | Deployed address (Testnet) |
|---|---|---|---|
| Savings Pool | `stellarnest-savings-pool` | ~12.4 KB | `CCFOC4U7OAABRXJQXLVRZ7FL5UMQ5T6BXJ53WNCYJXKE7SVHS3I55R2R` |
| Treasury | `stellarnest-treasury` | ~6.9 KB | `CDKVSTRN77GA344RTH6IE7HJZZFAZZFJI3KASTFCU3AENS2XMDOLDJP5` |

See [DEPLOYMENTS.md](../../../DEPLOYMENTS.md) for transaction hashes and the on-chain
verification record.

---

# Savings Pool

Manages savings circles. Holds no funds — all value movement is delegated to the treasury.

## Functions

### `__constructor(admin: Address, treasury: Address)`
Runs at deploy. Records the administrator and the treasury this contract will call.

### `create_pool(creator, name, contribution_amount, cycle_seconds, max_members) -> u32`
Creates a pool and enrols the creator as its first member. Returns the pool id.

- **Auth**: `creator`
- **Errors**: `InvalidPoolConfig` — empty or over-long name (>64 chars), non-positive
  contribution, zero cycle, or `max_members` outside 1–100
- **Emits**: `PoolCreated`

### `join_pool(pool_id, member) -> u32`
Adds a member. Returns the new member count.

- **Auth**: `member`
- **Errors**: `PoolNotFound`, `PoolClosed`, `AlreadyMember`, `PoolFull`
- **Emits**: `MemberJoined`

### `contribute(pool_id, member, amount) -> i128`
Contributes funds. **Calls `treasury.deposit`.** Returns the member's new balance.

- **Auth**: `member` (covers the nested token transfer via the auth tree)
- **Errors**: `InvalidAmount`, `PoolNotFound`, `PoolClosed`, `NotMember`
- **Emits**: `ContributionMade` (plus `DepositRecorded` from the treasury)

### `withdraw(pool_id, member, amount) -> i128`
Withdraws a member's own contributed funds. **Calls `treasury.withdraw`.**

- **Auth**: `member`
- **Errors**: `InvalidAmount`, `PoolNotFound`, `NotMember`, `InsufficientBalance`
- **Emits**: `WithdrawalProcessed` (plus the treasury's own)

A member can only withdraw what they personally contributed. The balance check is what
prevents one member draining a pool funded by others.

### `close_pool(pool_id, caller)`
Closes a pool to new members and contributions.

- **Auth**: `caller`, who must be the pool creator or the contract admin
- **Errors**: `PoolNotFound`, `Unauthorized`

Withdrawals remain permitted on a closed pool, so members can always recover their funds.

### Read-only

`get_pool(pool_id) -> Pool` · `list_members(pool_id) -> Vec<Address>` ·
`is_member(pool_id, member) -> bool` · `member_balance(pool_id, member) -> i128` ·
`pool_count() -> u32` · `treasury() -> Address` · `get_admin() -> Address`

## Errors

| Code | Name | Meaning |
|---|---|---|
| 1 | `NotInitialized` | Constructor state missing |
| 2 | `PoolNotFound` | No pool with that id |
| 3 | `AlreadyMember` | Account has already joined |
| 4 | `NotMember` | Account is not in this pool |
| 5 | `PoolFull` | Member limit reached |
| 6 | `InvalidAmount` | Amount was zero or negative |
| 7 | `InsufficientBalance` | Member has not contributed that much |
| 8 | `Unauthorized` | Caller may not perform this action |
| 9 | `InvalidPoolConfig` | Pool parameters rejected |
| 10 | `PoolClosed` | Pool is no longer accepting activity |

## Events

| Event | Topics | Data |
|---|---|---|
| `PoolCreated` | `savings`, `pool_created`, `pool_id`, `creator` | `name`, `contribution_amount`, `max_members` |
| `MemberJoined` | `savings`, `member_joined`, `pool_id`, `member` | `member_count` |
| `ContributionMade` | `savings`, `contribution`, `pool_id`, `member` | `amount`, `member_balance`, `pool_total` |
| `WithdrawalProcessed` | `savings`, `withdrawal`, `pool_id`, `member` | `amount`, `member_balance`, `pool_total` |

---

# Treasury

Custodies pooled funds and keeps per-pool accounting.

## Functions

### `__constructor(admin: Address, token: Address)`
Records the administrator and the token custodied (the XLM SAC on Testnet).

### `set_savings_contract(savings: Address)`
Registers the one contract permitted to move funds.

- **Auth**: `admin`
- **Emits**: `SavingsContractSet`

Callable more than once, so the savings contract can be upgraded and re-pointed without
redeploying the treasury or moving custody.

### `deposit(pool_id, from, amount) -> i128`
Pulls funds in and credits the pool. Returns the pool's new balance.

- **Auth**: the registered savings contract
- **Errors**: `SavingsContractNotSet`, `InvalidAmount`
- **Emits**: `DepositRecorded`

Funds are transferred *before* the balance is recorded, so a failed transfer cannot leave
the treasury claiming a balance it does not hold.

### `withdraw(pool_id, to, amount) -> i128`
Pays out from a pool's balance.

- **Auth**: the registered savings contract
- **Errors**: `SavingsContractNotSet`, `InvalidAmount`, `InsufficientPoolBalance`
- **Emits**: `WithdrawalProcessed`

Balances are per-pool, so one pool cannot be drained to pay another even though the treasury
holds a single combined token balance.

## Storage durability

Soroban persistent storage expires unless its time-to-live (TTL) is renewed. Pool records,
member lists, per-member balances, and treasury pool balances are all renewed on the writes
that create or update them. Instance state (including the running treasury total) is renewed
alongside each balance-changing operation. The contracts renew entries with fewer than 30 days
remaining to a 90-day lifetime, so active pools keep both custody and member claims alive.

### Read-only

`balance(pool_id) -> i128` · `total_held() -> i128` · `savings_contract() -> Address` ·
`token() -> Address` · `get_admin() -> Address`

## Errors

| Code | Name | Meaning |
|---|---|---|
| 1 | `NotInitialized` | Constructor state missing |
| 2 | `SavingsContractNotSet` | No savings contract registered |
| 3 | `Unauthorized` | Caller may not perform this action |
| 4 | `InvalidAmount` | Amount was zero or negative |
| 5 | `InsufficientPoolBalance` | Pool does not hold enough |

## Events

| Event | Topics | Data |
|---|---|---|
| `DepositRecorded` | `treasury`, `deposit`, `pool_id`, `from` | `amount`, `pool_balance` |
| `WithdrawalProcessed` | `treasury`, `withdrawal`, `pool_id`, `to` | `amount`, `pool_balance` |
| `SavingsContractSet` | `treasury`, `savings_set`, `savings` | — |

---

# Access control summary

| Action | Who may perform it | Enforced by |
|---|---|---|
| Create a pool | Anyone | `creator.require_auth()` |
| Join a pool | Anyone (once, while open, if not full) | `member.require_auth()` + membership checks |
| Contribute | Pool members | `member.require_auth()` + `NotMember` |
| Withdraw | A member, up to their own balance | `member.require_auth()` + `InsufficientBalance` |
| Close a pool | Pool creator or admin | `Unauthorized` |
| Move treasury funds | **Only the registered savings contract** | `savings.require_auth()` |
| Register the savings contract | Treasury admin | `admin.require_auth()` |

---

# Testing

```bash
cd contracts
cargo test                                  # 45 tests
cargo llvm-cov --summary-only --fail-under-lines 70
```

Measured coverage: **98.2% of lines** (savings-pool 97.2%, treasury 95.5%).

Test structure:

- **Treasury** (15 tests) — deposits, withdrawals, per-pool isolation, amount validation,
  admin control, and rejection of unauthorised callers.
- **Savings Pool** (30 tests) — integration tests that register *both* contracts against a
  real Stellar Asset Contract, so every contribution and withdrawal exercises a genuine
  cross-contract call rather than a mock.

Two testing details that are easy to get wrong:

**Auth negatives must clear the mock first.** `mock_all_auths()` is environment-wide and
sticky. A `#[should_panic]` test that does not call `env.set_auths(&[])` passes for the
wrong reason — it never actually tested authorisation.

**Event assertions must read immediately after the call.** `env.events().all()` returns
events from the *last invocation only*, not a cumulative log, and nested calls (the token
contract, the treasury) contribute their own. Assertions use
`.filter_by_contract(&id)` to isolate the contract under test.

## On-chain verification

Beyond the test suite, the deployed contracts were exercised directly on Testnet:

| Property | How it was tested | Outcome |
|---|---|---|
| Cross-contract call | `savings.contribute` of 100 XLM | One transaction emitted the SAC `transfer`, the treasury `deposit`, and the savings `ContributionMade` |
| Books reconcile | Compared `savings.get_pool().total_contributed` with `treasury.balance()` | Both report 85 XLM after a create → contribute → withdraw → join → contribute cycle |
| Treasury is closed to users | Direct `treasury.withdraw` from an account | Rejected: `Missing signing key for account CCFOC4U7…` (the savings contract) |
| Treasury deposit is closed too | Direct `treasury.deposit` from an account | Rejected: `Error(Auth, InvalidAction)` |
| Balance isolation | Member holding 25 XLM attempted to withdraw 60 XLM | Rejected: `Error(Contract, #7)` = `InsufficientBalance`; pool state intact |
