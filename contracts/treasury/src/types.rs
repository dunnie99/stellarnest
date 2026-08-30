use soroban_sdk::contracttype;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Contract administrator.
    Admin,
    /// The token (Stellar Asset Contract) this treasury custodies.
    Token,
    /// The savings contract permitted to move funds.
    Savings,
    /// Sum of every pool balance, kept alongside for cheap reads.
    TotalHeld,
    /// pool_id -> funds held for that pool.
    PoolBalance(u32),
}
