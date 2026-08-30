use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Constructor state is missing — the contract was not deployed correctly.
    NotInitialized = 1,
    /// No savings contract has been registered, so funds cannot move.
    SavingsContractNotSet = 2,
    /// The caller is not permitted to perform this action.
    Unauthorized = 3,
    /// Amount was zero or negative.
    InvalidAmount = 4,
    /// The pool does not hold enough to cover the withdrawal.
    InsufficientPoolBalance = 5,
}
