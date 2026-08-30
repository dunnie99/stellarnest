#![no_std]

//! StellarNest Savings Pool.
//!
//! Manages savings circles: creating pools, joining them, contributing, and
//! withdrawing. It holds no funds itself — every movement of value is delegated
//! to the treasury contract, which is what makes the accounting auditable
//! independently of the membership logic.

#[cfg(test)]
extern crate std;

mod errors;
mod events;
mod treasury_interface;
mod types;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, Address, Env, String, Vec};

pub use errors::Error;
pub use events::{ContributionMade, MemberJoined, PoolCreated, WithdrawalProcessed};
pub use treasury_interface::{TreasuryClient, TreasuryInterface};
pub use types::{DataKey, Pool};

const LEDGERS_PER_DAY: u32 = 17_280;
const TTL_THRESHOLD: u32 = LEDGERS_PER_DAY * 30;
const TTL_EXTEND_TO: u32 = LEDGERS_PER_DAY * 90;

const MAX_NAME_LEN: u32 = 64;
/// A hard ceiling on members, because member lists are read and rewritten
/// whole; an unbounded list would eventually exceed the invocation budget.
const MEMBER_LIMIT: u32 = 100;

#[contract]
pub struct SavingsPool;

#[contractimpl]
impl SavingsPool {
    pub fn __constructor(env: Env, admin: Address, treasury: Address) {
        let storage = env.storage().instance();
        storage.set(&DataKey::Admin, &admin);
        storage.set(&DataKey::Treasury, &treasury);
        storage.set(&DataKey::PoolCount, &0u32);
        storage.extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    /// Creates a savings pool. The creator is enrolled as its first member.
    pub fn create_pool(
        env: Env,
        creator: Address,
        name: String,
        contribution_amount: i128,
        cycle_seconds: u64,
        max_members: u32,
    ) -> Result<u32, Error> {
        creator.require_auth();

        if name.is_empty()
            || name.len() > MAX_NAME_LEN
            || contribution_amount <= 0
            || cycle_seconds == 0
            || max_members == 0
            || max_members > MEMBER_LIMIT
        {
            return Err(Error::InvalidPoolConfig);
        }

        let pool_id: u32 = env
            .storage()
            .instance()
            .get(&DataKey::PoolCount)
            .unwrap_or(0);

        let pool = Pool {
            id: pool_id,
            creator: creator.clone(),
            name: name.clone(),
            contribution_amount,
            cycle_seconds,
            max_members,
            member_count: 1,
            total_contributed: 0,
            created_at: env.ledger().timestamp(),
            active: true,
        };

        let mut members = Vec::new(&env);
        members.push_back(creator.clone());

        env.storage()
            .persistent()
            .set(&DataKey::Pool(pool_id), &pool);
        env.storage()
            .persistent()
            .set(&DataKey::Members(pool_id), &members);
        env.storage()
            .persistent()
            .set(&DataKey::MemberBalance(pool_id, creator.clone()), &0i128);

        env.storage()
            .instance()
            .set(&DataKey::PoolCount, &(pool_id + 1));
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Self::extend_pool_ttl(&env, pool_id);

        PoolCreated {
            pool_id,
            creator,
            name,
            contribution_amount,
            max_members,
        }
        .publish(&env);

        Ok(pool_id)
    }

    /// Joins an existing pool.
    pub fn join_pool(env: Env, pool_id: u32, member: Address) -> Result<u32, Error> {
        member.require_auth();

        let mut pool = Self::load_pool(&env, pool_id)?;
        if !pool.active {
            return Err(Error::PoolClosed);
        }

        let mut members = Self::load_members(&env, pool_id);
        if members.contains(&member) {
            return Err(Error::AlreadyMember);
        }
        if pool.member_count >= pool.max_members {
            return Err(Error::PoolFull);
        }

        members.push_back(member.clone());
        pool.member_count += 1;

        env.storage()
            .persistent()
            .set(&DataKey::Members(pool_id), &members);
        env.storage()
            .persistent()
            .set(&DataKey::Pool(pool_id), &pool);
        env.storage()
            .persistent()
            .set(&DataKey::MemberBalance(pool_id, member.clone()), &0i128);
        Self::extend_pool_ttl(&env, pool_id);

        MemberJoined {
            pool_id,
            member,
            member_count: pool.member_count,
        }
        .publish(&env);

        Ok(pool.member_count)
    }

    /// Contributes funds to a pool.
    ///
    /// This is the cross-contract call: the savings contract authorises the
    /// treasury to pull the member's funds. The member's `require_auth` here
    /// covers the nested token transfer through the auth tree, so no separate
    /// approval step is needed.
    pub fn contribute(
        env: Env,
        pool_id: u32,
        member: Address,
        amount: i128,
    ) -> Result<i128, Error> {
        member.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let mut pool = Self::load_pool(&env, pool_id)?;
        if !pool.active {
            return Err(Error::PoolClosed);
        }
        if !Self::load_members(&env, pool_id).contains(&member) {
            return Err(Error::NotMember);
        }

        // Funds move first; if the treasury rejects the deposit this call
        // reverts and no membership accounting is written.
        Self::treasury_client(&env)?.deposit(&pool_id, &member, &amount);

        let balance = Self::member_balance(env.clone(), pool_id, member.clone()) + amount;
        env.storage()
            .persistent()
            .set(&DataKey::MemberBalance(pool_id, member.clone()), &balance);

        pool.total_contributed += amount;
        env.storage()
            .persistent()
            .set(&DataKey::Pool(pool_id), &pool);
        Self::extend_pool_ttl(&env, pool_id);

        ContributionMade {
            pool_id,
            member,
            amount,
            member_balance: balance,
            pool_total: pool.total_contributed,
        }
        .publish(&env);

        Ok(balance)
    }

    /// Withdraws a member's own contributed funds.
    ///
    /// A member may only withdraw what they personally contributed — the
    /// balance check is what stops one member draining the pool.
    pub fn withdraw(env: Env, pool_id: u32, member: Address, amount: i128) -> Result<i128, Error> {
        member.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let mut pool = Self::load_pool(&env, pool_id)?;
        if !Self::load_members(&env, pool_id).contains(&member) {
            return Err(Error::NotMember);
        }

        let balance = Self::member_balance(env.clone(), pool_id, member.clone());
        if balance < amount {
            return Err(Error::InsufficientBalance);
        }

        Self::treasury_client(&env)?.withdraw(&pool_id, &member, &amount);

        let updated = balance - amount;
        env.storage()
            .persistent()
            .set(&DataKey::MemberBalance(pool_id, member.clone()), &updated);

        pool.total_contributed -= amount;
        env.storage()
            .persistent()
            .set(&DataKey::Pool(pool_id), &pool);
        Self::extend_pool_ttl(&env, pool_id);

        WithdrawalProcessed {
            pool_id,
            member,
            amount,
            member_balance: updated,
            pool_total: pool.total_contributed,
        }
        .publish(&env);

        Ok(updated)
    }

    /// Closes a pool to new members and contributions. Creator or admin only.
    ///
    /// Withdrawals remain permitted so members can always recover their funds.
    pub fn close_pool(env: Env, pool_id: u32, caller: Address) -> Result<(), Error> {
        caller.require_auth();

        let mut pool = Self::load_pool(&env, pool_id)?;
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;

        if caller != pool.creator && caller != admin {
            return Err(Error::Unauthorized);
        }

        pool.active = false;
        env.storage()
            .persistent()
            .set(&DataKey::Pool(pool_id), &pool);
        Ok(())
    }

    /* -------------------------------------------------------------- *
     * Reads
     * -------------------------------------------------------------- */

    pub fn get_pool(env: Env, pool_id: u32) -> Result<Pool, Error> {
        Self::load_pool(&env, pool_id)
    }

    pub fn list_members(env: Env, pool_id: u32) -> Vec<Address> {
        Self::load_members(&env, pool_id)
    }

    pub fn is_member(env: Env, pool_id: u32, member: Address) -> bool {
        Self::load_members(&env, pool_id).contains(&member)
    }

    pub fn member_balance(env: Env, pool_id: u32, member: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::MemberBalance(pool_id, member))
            .unwrap_or(0)
    }

    pub fn pool_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::PoolCount)
            .unwrap_or(0)
    }

    pub fn treasury(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Treasury)
            .ok_or(Error::NotInitialized)
    }

    pub fn get_admin(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }

    /* -------------------------------------------------------------- *
     * Internals
     * -------------------------------------------------------------- */

    fn load_pool(env: &Env, pool_id: u32) -> Result<Pool, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Pool(pool_id))
            .ok_or(Error::PoolNotFound)
    }

    fn load_members(env: &Env, pool_id: u32) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::Members(pool_id))
            .unwrap_or_else(|| Vec::new(env))
    }

    fn treasury_client(env: &Env) -> Result<TreasuryClient<'_>, Error> {
        let treasury: Address = env
            .storage()
            .instance()
            .get(&DataKey::Treasury)
            .ok_or(Error::NotInitialized)?;
        Ok(TreasuryClient::new(env, &treasury))
    }

    fn extend_pool_ttl(env: &Env, pool_id: u32) {
        let persistent = env.storage().persistent();
        persistent.extend_ttl(&DataKey::Pool(pool_id), TTL_THRESHOLD, TTL_EXTEND_TO);
        persistent.extend_ttl(&DataKey::Members(pool_id), TTL_THRESHOLD, TTL_EXTEND_TO);
    }
}
