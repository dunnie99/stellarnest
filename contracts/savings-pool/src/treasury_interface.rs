use soroban_sdk::{contractclient, Address, Env};

/// The subset of the treasury's interface this contract calls.
///
/// `#[contractclient]` generates a typed `TreasuryClient` from this trait
/// *without* generating any exported contract functions. That matters for two
/// reasons:
///
///  1. Depending on the treasury crate directly would link its
///     `#[contractimpl]` exports into this contract's Wasm, producing surprise
///     exports and potential symbol collisions — something the SDK explicitly
///     warns against.
///  2. `contractimport!` of the built Wasm would work, but makes the treasury a
///     compile-time build dependency: its Wasm would have to exist before this
///     crate could compile at all.
///
/// Declaring the interface locally keeps the two contracts independently
/// buildable while calls stay fully typed. The treasury crate is still a
/// *dev*-dependency so tests can register the real implementation.
#[contractclient(name = "TreasuryClient")]
pub trait TreasuryInterface {
    fn deposit(env: Env, pool_id: u32, from: Address, amount: i128) -> i128;
    fn withdraw(env: Env, pool_id: u32, to: Address, amount: i128) -> i128;
    fn balance(env: Env, pool_id: u32) -> i128;
}
