use soroban_sdk::{contractevent, Address, String};

/// The user-facing activity narrative. These four map exactly onto the events
/// the live feed renders.

#[contractevent(topics = ["savings", "pool_created"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolCreated {
    #[topic]
    pub pool_id: u32,
    #[topic]
    pub creator: Address,
    pub name: String,
    pub contribution_amount: i128,
    pub max_members: u32,
}

#[contractevent(topics = ["savings", "member_joined"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MemberJoined {
    #[topic]
    pub pool_id: u32,
    #[topic]
    pub member: Address,
    pub member_count: u32,
}

#[contractevent(topics = ["savings", "contribution"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContributionMade {
    #[topic]
    pub pool_id: u32,
    #[topic]
    pub member: Address,
    pub amount: i128,
    pub member_balance: i128,
    pub pool_total: i128,
}

#[contractevent(topics = ["savings", "withdrawal"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WithdrawalProcessed {
    #[topic]
    pub pool_id: u32,
    #[topic]
    pub member: Address,
    pub amount: i128,
    pub member_balance: i128,
    pub pool_total: i128,
}
