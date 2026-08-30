use soroban_sdk::{contractevent, Address};

/// Treasury-side events. The savings contract emits the user-facing narrative;
/// these record what actually happened to the funds.

#[contractevent(topics = ["treasury", "deposit"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DepositRecorded {
    #[topic]
    pub pool_id: u32,
    #[topic]
    pub from: Address,
    pub amount: i128,
    pub pool_balance: i128,
}

#[contractevent(topics = ["treasury", "withdrawal"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WithdrawalProcessed {
    #[topic]
    pub pool_id: u32,
    #[topic]
    pub to: Address,
    pub amount: i128,
    pub pool_balance: i128,
}

#[contractevent(topics = ["treasury", "savings_set"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SavingsContractSet {
    #[topic]
    pub savings: Address,
}
