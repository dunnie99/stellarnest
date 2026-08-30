#![no_std]

//! StellarNest Treasury.
//!
//! Holds pooled funds and keeps per-pool accounting. It is deliberately not
//! user-facing: `deposit` and `withdraw` may only be called by the registered
//! savings-pool contract, which is the trust boundary that makes the two-contract
//! split meaningful rather than decorative.

#[cfg(test)]
extern crate std;

mod errors;
mod events;
mod types;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, token, Address, Env};

pub use errors::Error;
pub use events::{DepositRecorded, SavingsContractSet, WithdrawalProcessed};
pub use types::DataKey;

const LEDGERS_PER_DAY: u32 = 17_280;
const TTL_THRESHOLD: u32 = LEDGERS_PER_DAY * 30;
const TTL_EXTEND_TO: u32 = LEDGERS_PER_DAY * 90;

#[contract]
pub struct Treasury;

#[contractimpl]
impl Treasury {
    /// `token` is the asset the treasury custodies — on Testnet this is
    /// typically the native XLM Stellar Asset Contract.
    pub fn __constructor(env: Env, admin: Address, token: Address) {
        let storage = env.storage().instance();
        storage.set(&DataKey::Admin, &admin);
        storage.set(&DataKey::Token, &token);
        storage.set(&DataKey::TotalHeld, &0i128);
        storage.extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    /// Registers the savings contract permitted to move funds.
    ///
    /// Admin-only, and deliberately callable more than once so the savings
    /// contract can be upgraded and re-pointed without redeploying the treasury.
    pub fn set_savings_contract(env: Env, savings: Address) -> Result<(), Error> {
        let admin = Self::admin(&env)?;
        admin.require_auth();

        env.storage().instance().set(&DataKey::Savings, &savings);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        SavingsContractSet { savings }.publish(&env);
        Ok(())
    }

    /// Records a contribution and pulls the funds in.
    ///
    /// Only the registered savings contract may call this. When the savings
    /// contract invokes it, Soroban's invoker auth satisfies `require_auth`
    /// automatically; a direct call from a user account cannot.
    pub fn deposit(env: Env, pool_id: u32, from: Address, amount: i128) -> Result<i128, Error> {
        Self::require_savings_caller(&env)?;

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        // Move the funds before recording them, so a failed transfer cannot
        // leave the treasury claiming a balance it does not hold.
        let treasury = env.current_contract_address();
        Self::token_client(&env)?.transfer(&from, &treasury, &amount);

        let balance = Self::balance(env.clone(), pool_id);
        let updated = balance + amount;
        env.storage()
            .persistent()
            .set(&DataKey::PoolBalance(pool_id), &updated);
        env.storage().persistent().extend_ttl(
            &DataKey::PoolBalance(pool_id),
            TTL_THRESHOLD,
            TTL_EXTEND_TO,
        );
        env.storage().persistent().extend_ttl(
            &DataKey::PoolBalance(pool_id),
            TTL_THRESHOLD,
            TTL_EXTEND_TO,
        );

        let total: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalHeld)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalHeld, &(total + amount));
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        DepositRecorded {
            pool_id,
            from,
            amount,
            pool_balance: updated,
        }
        .publish(&env);

        Ok(updated)
    }

    /// Pays out from a pool's balance. Savings-contract only.
    pub fn withdraw(env: Env, pool_id: u32, to: Address, amount: i128) -> Result<i128, Error> {
        Self::require_savings_caller(&env)?;

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let balance = Self::balance(env.clone(), pool_id);
        if balance < amount {
            return Err(Error::InsufficientPoolBalance);
        }

        let updated = balance - amount;
        env.storage()
            .persistent()
            .set(&DataKey::PoolBalance(pool_id), &updated);

        let total: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalHeld)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalHeld, &(total - amount));
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        // The treasury authorises itself as the sender here.
        Self::token_client(&env)?.transfer(&env.current_contract_address(), &to, &amount);

        WithdrawalProcessed {
            pool_id,
            to,
            amount,
            pool_balance: updated,
        }
        .publish(&env);

        Ok(updated)
    }

    /// Funds held on behalf of a single pool.
    pub fn balance(env: Env, pool_id: u32) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::PoolBalance(pool_id))
            .unwrap_or(0)
    }

    /// Funds held across every pool.
    pub fn total_held(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalHeld)
            .unwrap_or(0)
    }

    /// The savings contract currently permitted to move funds.
    pub fn savings_contract(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Savings)
            .ok_or(Error::SavingsContractNotSet)
    }

    pub fn token(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)
    }

    pub fn get_admin(env: Env) -> Result<Address, Error> {
        Self::admin(&env)
    }

    /* -------------------------------------------------------------- *
     * Internals
     * -------------------------------------------------------------- */

    fn admin(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }

    /// The trust boundary. Requires the caller to be the registered savings
    /// contract, authenticated as itself.
    fn require_savings_caller(env: &Env) -> Result<(), Error> {
        let savings: Address = env
            .storage()
            .instance()
            .get(&DataKey::Savings)
            .ok_or(Error::SavingsContractNotSet)?;
        savings.require_auth();
        Ok(())
    }

    fn token_client(env: &Env) -> Result<token::TokenClient<'_>, Error> {
        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        Ok(token::TokenClient::new(env, &token))
    }
}
