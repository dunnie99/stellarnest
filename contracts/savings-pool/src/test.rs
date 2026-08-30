#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events as _, Ledger as _},
    token, Address, Env, Event as _, String,
};
use stellarnest_treasury::{Treasury, TreasuryClient as RealTreasuryClient};

/// Both contracts registered together, wired to a real Stellar Asset Contract.
///
/// These are integration tests by design: the point of splitting savings from
/// treasury is the cross-contract call, and a mocked treasury would verify
/// nothing about it.
struct Harness<'a> {
    env: Env,
    savings: SavingsPoolClient<'a>,
    savings_id: Address,
    treasury: RealTreasuryClient<'a>,
    treasury_id: Address,
    token: token::TokenClient<'a>,
    alice: Address,
    bob: Address,
    carol: Address,
}

const STROOPS_PER_XLM: i128 = 10_000_000;
/// Every test account starts with 10,000 XLM of the test asset.
const FUNDING: i128 = 10_000 * STROOPS_PER_XLM;

fn setup() -> Harness<'static> {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let issuer = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let carol = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(issuer);
    let token_address = sac.address();
    let token = token::TokenClient::new(&env, &token_address);
    let token_admin = token::StellarAssetClient::new(&env, &token_address);
    for account in [&alice, &bob, &carol] {
        token_admin.mint(account, &FUNDING);
    }

    let treasury_id = env.register(Treasury, (admin.clone(), token_address.clone()));
    let treasury = RealTreasuryClient::new(&env, &treasury_id);

    let savings_id = env.register(SavingsPool, (admin, treasury_id.clone()));
    let savings = SavingsPoolClient::new(&env, &savings_id);

    // The treasury only accepts fund movement from this savings contract.
    treasury.set_savings_contract(&savings_id);

    env.ledger().set_timestamp(1_700_000_000);

    Harness {
        env,
        savings,
        savings_id,
        treasury,
        treasury_id,
        token,
        alice,
        bob,
        carol,
    }
}

fn pool_name(env: &Env) -> String {
    String::from_str(env, "Monthly Circle")
}

fn create_default_pool(h: &Harness) -> u32 {
    h.savings
        .create_pool(&h.alice, &pool_name(&h.env), &100_0000000, &2_592_000, &5)
}

/* ------------------------------------------------------------------ *
 * Pool creation
 * ------------------------------------------------------------------ */

#[test]
fn create_pool_succeeds_and_enrols_the_creator() {
    let h = setup();

    let pool_id = create_default_pool(&h);
    let pool = h.savings.get_pool(&pool_id);

    assert_eq!(pool_id, 0);
    assert_eq!(pool.creator, h.alice);
    assert_eq!(pool.name, pool_name(&h.env));
    assert_eq!(pool.member_count, 1);
    assert_eq!(pool.total_contributed, 0);
    assert!(pool.active);
    assert_eq!(pool.created_at, 1_700_000_000);
    assert!(h.savings.is_member(&pool_id, &h.alice));
    assert_eq!(h.savings.pool_count(), 1);
}

#[test]
fn create_pool_assigns_sequential_ids() {
    let h = setup();

    assert_eq!(create_default_pool(&h), 0);
    assert_eq!(create_default_pool(&h), 1);
    assert_eq!(h.savings.pool_count(), 2);
}

#[test]
fn create_pool_rejects_invalid_configuration() {
    let h = setup();
    let name = pool_name(&h.env);
    let empty = String::from_str(&h.env, "");

    // Empty name.
    assert_eq!(
        h.savings
            .try_create_pool(&h.alice, &empty, &100, &2_592_000, &5),
        Err(Ok(Error::InvalidPoolConfig))
    );
    // Non-positive contribution.
    assert_eq!(
        h.savings
            .try_create_pool(&h.alice, &name, &0, &2_592_000, &5),
        Err(Ok(Error::InvalidPoolConfig))
    );
    // Zero-length cycle.
    assert_eq!(
        h.savings.try_create_pool(&h.alice, &name, &100, &0, &5),
        Err(Ok(Error::InvalidPoolConfig))
    );
    // Zero members allowed.
    assert_eq!(
        h.savings
            .try_create_pool(&h.alice, &name, &100, &2_592_000, &0),
        Err(Ok(Error::InvalidPoolConfig))
    );
    // Beyond the hard member ceiling.
    assert_eq!(
        h.savings
            .try_create_pool(&h.alice, &name, &100, &2_592_000, &101),
        Err(Ok(Error::InvalidPoolConfig))
    );

    assert_eq!(h.savings.pool_count(), 0);
}

#[test]
#[should_panic]
fn create_pool_requires_creator_authorization() {
    let h = setup();
    h.env.set_auths(&[]);
    create_default_pool(&h);
}

#[test]
fn create_pool_emits_a_pool_created_event() {
    let h = setup();

    let pool_id = create_default_pool(&h);

    let events = h.env.events().all();
    let ours = events.filter_by_contract(&h.savings_id);

    assert_eq!(
        ours.events(),
        std::vec![PoolCreated {
            pool_id,
            creator: h.alice.clone(),
            name: pool_name(&h.env),
            contribution_amount: 100_0000000,
            max_members: 5,
        }
        .to_xdr(&h.env, &h.savings_id)]
    );
}

/* ------------------------------------------------------------------ *
 * Joining
 * ------------------------------------------------------------------ */

#[test]
fn members_can_join_a_pool() {
    let h = setup();
    let pool_id = create_default_pool(&h);

    let count = h.savings.join_pool(&pool_id, &h.bob);

    assert_eq!(count, 2);
    assert!(h.savings.is_member(&pool_id, &h.bob));
    assert_eq!(h.savings.list_members(&pool_id).len(), 2);
    assert_eq!(h.savings.get_pool(&pool_id).member_count, 2);
}

#[test]
fn duplicate_joins_are_rejected() {
    let h = setup();
    let pool_id = create_default_pool(&h);
    h.savings.join_pool(&pool_id, &h.bob);

    assert_eq!(
        h.savings.try_join_pool(&pool_id, &h.bob),
        Err(Ok(Error::AlreadyMember))
    );
    // The creator is already a member from creation.
    assert_eq!(
        h.savings.try_join_pool(&pool_id, &h.alice),
        Err(Ok(Error::AlreadyMember))
    );
    assert_eq!(h.savings.get_pool(&pool_id).member_count, 2);
}

#[test]
fn joining_a_full_pool_is_rejected() {
    let h = setup();
    // Capacity of two: the creator plus one.
    let pool_id = h
        .savings
        .create_pool(&h.alice, &pool_name(&h.env), &100, &2_592_000, &2);

    h.savings.join_pool(&pool_id, &h.bob);

    assert_eq!(
        h.savings.try_join_pool(&pool_id, &h.carol),
        Err(Ok(Error::PoolFull))
    );
}

#[test]
fn joining_an_unknown_pool_is_rejected() {
    let h = setup();
    assert_eq!(
        h.savings.try_join_pool(&99, &h.bob),
        Err(Ok(Error::PoolNotFound))
    );
}

#[test]
fn join_emits_a_member_joined_event() {
    let h = setup();
    let pool_id = create_default_pool(&h);

    h.savings.join_pool(&pool_id, &h.bob);

    let events = h.env.events().all();
    let ours = events.filter_by_contract(&h.savings_id);

    assert_eq!(
        ours.events(),
        std::vec![MemberJoined {
            pool_id,
            member: h.bob.clone(),
            member_count: 2,
        }
        .to_xdr(&h.env, &h.savings_id)]
    );
}

/* ------------------------------------------------------------------ *
 * Contributions — the cross-contract path
 * ------------------------------------------------------------------ */

#[test]
fn contribution_moves_funds_into_the_treasury() {
    let h = setup();
    let pool_id = create_default_pool(&h);

    let balance = h.savings.contribute(&pool_id, &h.alice, &500_0000000);

    // Savings-side accounting.
    assert_eq!(balance, 500_0000000);
    assert_eq!(h.savings.member_balance(&pool_id, &h.alice), 500_0000000);
    assert_eq!(h.savings.get_pool(&pool_id).total_contributed, 500_0000000);

    // Treasury-side accounting — this is the cross-contract call landing.
    assert_eq!(h.treasury.balance(&pool_id), 500_0000000);
    assert_eq!(h.treasury.total_held(), 500_0000000);

    // And the tokens genuinely moved.
    assert_eq!(h.token.balance(&h.alice), FUNDING - 500_0000000);
    assert_eq!(h.token.balance(&h.treasury_id), 500_0000000);
}

#[test]
fn contributions_from_several_members_accumulate() {
    let h = setup();
    let pool_id = create_default_pool(&h);
    h.savings.join_pool(&pool_id, &h.bob);

    h.savings.contribute(&pool_id, &h.alice, &300);
    h.savings.contribute(&pool_id, &h.bob, &200);
    h.savings.contribute(&pool_id, &h.alice, &100);

    assert_eq!(h.savings.member_balance(&pool_id, &h.alice), 400);
    assert_eq!(h.savings.member_balance(&pool_id, &h.bob), 200);
    assert_eq!(h.savings.get_pool(&pool_id).total_contributed, 600);
    assert_eq!(h.treasury.balance(&pool_id), 600);
}

#[test]
fn contributions_are_isolated_between_pools() {
    let h = setup();
    let first = create_default_pool(&h);
    let second = create_default_pool(&h);

    h.savings.contribute(&first, &h.alice, &1_000);
    h.savings.contribute(&second, &h.alice, &250);

    assert_eq!(h.treasury.balance(&first), 1_000);
    assert_eq!(h.treasury.balance(&second), 250);
    assert_eq!(h.treasury.total_held(), 1_250);
}

#[test]
fn contribution_from_a_non_member_is_rejected() {
    let h = setup();
    let pool_id = create_default_pool(&h);

    assert_eq!(
        h.savings.try_contribute(&pool_id, &h.bob, &100),
        Err(Ok(Error::NotMember))
    );
    assert_eq!(h.treasury.balance(&pool_id), 0);
}

#[test]
fn contribution_rejects_non_positive_amounts() {
    let h = setup();
    let pool_id = create_default_pool(&h);

    assert_eq!(
        h.savings.try_contribute(&pool_id, &h.alice, &0),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        h.savings.try_contribute(&pool_id, &h.alice, &-500),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(h.treasury.balance(&pool_id), 0);
}

#[test]
fn contribution_to_an_unknown_pool_is_rejected() {
    let h = setup();
    assert_eq!(
        h.savings.try_contribute(&42, &h.alice, &100),
        Err(Ok(Error::PoolNotFound))
    );
}

#[test]
#[should_panic]
fn contribution_requires_member_authorization() {
    let h = setup();
    let pool_id = create_default_pool(&h);

    h.env.set_auths(&[]);
    h.savings.contribute(&pool_id, &h.alice, &100);
}

#[test]
fn contribution_emits_events_from_both_contracts() {
    let h = setup();
    let pool_id = create_default_pool(&h);

    h.savings.contribute(&pool_id, &h.alice, &750);

    let events = h.env.events().all();

    // The savings contract narrates the user action...
    let savings_events = events.filter_by_contract(&h.savings_id);
    assert_eq!(
        savings_events.events(),
        std::vec![ContributionMade {
            pool_id,
            member: h.alice.clone(),
            amount: 750,
            member_balance: 750,
            pool_total: 750,
        }
        .to_xdr(&h.env, &h.savings_id)]
    );

    // ...while the treasury records the funds. Both firing in one invocation is
    // the observable signature of the cross-contract call.
    let treasury_events = events.filter_by_contract(&h.treasury_id);
    assert_eq!(treasury_events.events().len(), 1);
}

/* ------------------------------------------------------------------ *
 * Withdrawals
 * ------------------------------------------------------------------ */

#[test]
fn authorized_withdrawal_succeeds() {
    let h = setup();
    let pool_id = create_default_pool(&h);
    h.savings.contribute(&pool_id, &h.alice, &1_000);
    let before = h.token.balance(&h.alice);

    let remaining = h.savings.withdraw(&pool_id, &h.alice, &400);

    assert_eq!(remaining, 600);
    assert_eq!(h.savings.member_balance(&pool_id, &h.alice), 600);
    assert_eq!(h.savings.get_pool(&pool_id).total_contributed, 600);
    assert_eq!(h.treasury.balance(&pool_id), 600);
    assert_eq!(h.token.balance(&h.alice), before + 400);
}

#[test]
fn withdrawal_beyond_a_member_balance_is_rejected() {
    let h = setup();
    let pool_id = create_default_pool(&h);
    h.savings.contribute(&pool_id, &h.alice, &500);

    assert_eq!(
        h.savings.try_withdraw(&pool_id, &h.alice, &900),
        Err(Ok(Error::InsufficientBalance))
    );
    assert_eq!(h.treasury.balance(&pool_id), 500);
}

#[test]
fn a_member_cannot_withdraw_another_members_contribution() {
    let h = setup();
    let pool_id = create_default_pool(&h);
    h.savings.join_pool(&pool_id, &h.bob);

    // Alice funds the pool; Bob is a member but has contributed nothing.
    h.savings.contribute(&pool_id, &h.alice, &1_000);

    assert_eq!(
        h.savings.try_withdraw(&pool_id, &h.bob, &500),
        Err(Ok(Error::InsufficientBalance))
    );
    assert_eq!(h.treasury.balance(&pool_id), 1_000);
    assert_eq!(h.savings.member_balance(&pool_id, &h.alice), 1_000);
}

#[test]
fn withdrawal_by_a_non_member_is_rejected() {
    let h = setup();
    let pool_id = create_default_pool(&h);
    h.savings.contribute(&pool_id, &h.alice, &1_000);

    assert_eq!(
        h.savings.try_withdraw(&pool_id, &h.carol, &100),
        Err(Ok(Error::NotMember))
    );
}

#[test]
#[should_panic]
fn withdrawal_requires_member_authorization() {
    let h = setup();
    let pool_id = create_default_pool(&h);
    h.savings.contribute(&pool_id, &h.alice, &1_000);

    h.env.set_auths(&[]);
    h.savings.withdraw(&pool_id, &h.alice, &100);
}

#[test]
fn withdrawal_emits_a_withdrawal_event() {
    let h = setup();
    let pool_id = create_default_pool(&h);
    h.savings.contribute(&pool_id, &h.alice, &1_000);

    h.savings.withdraw(&pool_id, &h.alice, &250);

    let events = h.env.events().all();
    let ours = events.filter_by_contract(&h.savings_id);

    assert_eq!(
        ours.events(),
        std::vec![WithdrawalProcessed {
            pool_id,
            member: h.alice.clone(),
            amount: 250,
            member_balance: 750,
            pool_total: 750,
        }
        .to_xdr(&h.env, &h.savings_id)]
    );
}

/* ------------------------------------------------------------------ *
 * The trust boundary
 * ------------------------------------------------------------------ */

#[test]
#[should_panic]
fn a_user_cannot_call_the_treasury_directly() {
    let h = setup();
    create_default_pool(&h);

    // Funds may only move through the savings contract. With authorisation
    // cleared, a direct deposit call has no savings-contract signature and is
    // refused — this is the property the two-contract split exists to provide.
    h.env.set_auths(&[]);
    h.treasury.deposit(&0, &h.alice, &1_000);
}

#[test]
fn the_savings_contract_is_the_registered_treasury_caller() {
    let h = setup();
    assert_eq!(h.treasury.savings_contract(), h.savings_id);
    assert_eq!(h.savings.treasury(), h.treasury_id);
}

/* ------------------------------------------------------------------ *
 * Pool lifecycle
 * ------------------------------------------------------------------ */

#[test]
fn a_closed_pool_rejects_joins_and_contributions_but_allows_withdrawals() {
    let h = setup();
    let pool_id = create_default_pool(&h);
    h.savings.contribute(&pool_id, &h.alice, &1_000);

    h.savings.close_pool(&pool_id, &h.alice);

    assert_eq!(
        h.savings.try_join_pool(&pool_id, &h.bob),
        Err(Ok(Error::PoolClosed))
    );
    assert_eq!(
        h.savings.try_contribute(&pool_id, &h.alice, &100),
        Err(Ok(Error::PoolClosed))
    );

    // Members must always be able to recover their funds.
    assert_eq!(h.savings.withdraw(&pool_id, &h.alice, &1_000), 0);
}

#[test]
fn closing_a_pool_from_an_unrelated_account_is_rejected() {
    let h = setup();
    let pool_id = create_default_pool(&h);
    h.savings.join_pool(&pool_id, &h.bob);

    assert_eq!(
        h.savings.try_close_pool(&pool_id, &h.bob),
        Err(Ok(Error::Unauthorized))
    );
    assert!(h.savings.get_pool(&pool_id).active);
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

#[test]
fn reads_on_unknown_pools_behave_sensibly() {
    let h = setup();

    assert_eq!(h.savings.try_get_pool(&99), Err(Ok(Error::PoolNotFound)));
    assert_eq!(h.savings.list_members(&99).len(), 0);
    assert!(!h.savings.is_member(&99, &h.alice));
    assert_eq!(h.savings.member_balance(&99, &h.alice), 0);
}

#[test]
fn a_full_savings_cycle_reconciles_across_both_contracts() {
    let h = setup();
    let pool_id = create_default_pool(&h);
    h.savings.join_pool(&pool_id, &h.bob);
    h.savings.join_pool(&pool_id, &h.carol);

    h.savings.contribute(&pool_id, &h.alice, &1_000);
    h.savings.contribute(&pool_id, &h.bob, &1_000);
    h.savings.contribute(&pool_id, &h.carol, &1_000);
    h.savings.withdraw(&pool_id, &h.bob, &400);

    // Savings-side and treasury-side accounting must agree exactly.
    let pool = h.savings.get_pool(&pool_id);
    assert_eq!(pool.total_contributed, 2_600);
    assert_eq!(h.treasury.balance(&pool_id), 2_600);
    assert_eq!(h.token.balance(&h.treasury_id), 2_600);

    let member_sum = h.savings.member_balance(&pool_id, &h.alice)
        + h.savings.member_balance(&pool_id, &h.bob)
        + h.savings.member_balance(&pool_id, &h.carol);
    assert_eq!(member_sum, 2_600);
    assert_eq!(pool.member_count, 3);
}
