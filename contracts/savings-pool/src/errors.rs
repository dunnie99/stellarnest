use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Constructor state is missing.
    NotInitialized = 1,
    /// No pool exists with the given id.
    PoolNotFound = 2,
    /// The account has already joined this pool.
    AlreadyMember = 3,
    /// The account is not a member of this pool.
    NotMember = 4,
    /// The pool has reached its member limit.
    PoolFull = 5,
    /// Amount was zero or negative.
    InvalidAmount = 6,
    /// The member has not contributed enough to cover this withdrawal.
    InsufficientBalance = 7,
    /// The caller is not permitted to perform this action.
    Unauthorized = 8,
    /// Pool configuration was rejected — empty name, non-positive contribution,
    /// zero cycle, or a member limit below one.
    InvalidPoolConfig = 9,
    /// The pool is closed to further activity.
    PoolClosed = 10,
}
