use soroban_sdk::{contracttype, Address, String};

/// A savings circle.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Pool {
    pub id: u32,
    pub creator: Address,
    pub name: String,
    /// The expected contribution per cycle, in stroops.
    pub contribution_amount: i128,
    /// Length of a contribution cycle, in seconds.
    pub cycle_seconds: u64,
    pub max_members: u32,
    pub member_count: u32,
    /// Total contributed across every member, net of withdrawals.
    pub total_contributed: i128,
    pub created_at: u64,
    pub active: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    /// The treasury contract that custodies funds.
    Treasury,
    /// Monotonic pool id counter.
    PoolCount,
    /// pool_id -> pool record.
    Pool(u32),
    /// pool_id -> ordered member list.
    Members(u32),
    /// (pool_id, member) -> net contributed balance.
    MemberBalance(u32, Address),
}
