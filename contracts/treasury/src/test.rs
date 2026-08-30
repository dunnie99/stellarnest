#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events as _},
    token, Address, Env, Event as _,
};

const STROOPS_PER_XLM: i128 = 10_000_000;

struct Harness<'a> {
    env: Env,
    client: TreasuryClient<'a>,
    contract_id: Address,
    token: token::TokenClient<'a>,
    admin: Address,
    /// Stands in for the savings contract. Using a generated address lets these
    /// tests exercise the access-control boundary without the savings contract.
    savings: Address,
    alice: Address,
}

fn setup() -> Harness<'static> {
    let env = Env::default();
    /*
     * Non-root auth is required here, and only here.
     *
     * `deposit` pulls funds with a nested `token.transfer(from, ...)`, so the
     * depositor must authorise a sub-invocation. In production the root call is
     * `savings.contribute`, which does `member.require_auth()` at the top — so
     * the depositor's authorisation *is* root-tied and plain `mock_all_auths`
     * suffices (see the savings-pool integration tests).
     *
     * These tests call the treasury directly with no savings contract above it,
     * which makes the depositor's authorisation legitimately non-root.
     */
    env.mock_all_auths_allowing_non_root_auth();

    let admin = Address::generate(&env);
    let issuer = Address::generate(&env);
    let savings = Address::generate(&env);
    let alice = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(issuer);
    let token_address = sac.address();
    let token = token::TokenClient::new(&env, &token_address);
    let token_admin = token::StellarAssetClient::new(&env, &token_address);
    // Stellar amounts are in stroops: 1 XLM = 10,000,000 stroops.
    token_admin.mint(&alice, &(10_000 * STROOPS_PER_XLM));

    let contract_id = env.register(Treasury, (admin.clone(), token_address.clone()));
    let client = TreasuryClient::new(&env, &contract_id);
    client.set_savings_contract(&savings);

    Harness {
        env,
        client,
        contract_id,
        token,
        admin,
        savings,
        alice,
    }
}

/* ------------------------------------------------------------------ *
 * Setup and configuration
 * ------------------------------------------------------------------ */

#[test]
fn constructor_records_admin_and_token() {
    let h = setup();
    assert_eq!(h.client.get_admin(), h.admin);
    assert_eq!(h.client.savings_contract(), h.savings);
    assert_eq!(h.client.total_held(), 0);
}

#[test]
fn savings_contract_can_be_repointed_by_the_admin() {
    let h = setup();
    let replacement = Address::generate(&h.env);

    h.client.set_savings_contract(&replacement);

    assert_eq!(h.client.savings_contract(), replacement);
}

#[test]
#[should_panic]
fn setting_the_savings_contract_requires_admin_authorization() {
    let h = setup();
    let replacement = Address::generate(&h.env);

    // Clearing the environment-wide mock is what makes this a real negative.
    h.env.set_auths(&[]);
    h.client.set_savings_contract(&replacement);
}

/* ------------------------------------------------------------------ *
 * Deposits
 * ------------------------------------------------------------------ */

#[test]
fn deposit_moves_funds_and_records_the_balance() {
    let h = setup();
    let before = h.token.balance(&h.alice);

    let balance = h.client.deposit(&1, &h.alice, &500);

    assert_eq!(balance, 500);
    assert_eq!(h.client.balance(&1), 500);
    assert_eq!(h.client.total_held(), 500);
    assert_eq!(h.token.balance(&h.alice), before - 500);
    assert_eq!(h.token.balance(&h.contract_id), 500);
}

#[test]
fn deposits_accumulate_per_pool() {
    let h = setup();

    h.client.deposit(&1, &h.alice, &300);
    h.client.deposit(&1, &h.alice, &200);
    h.client.deposit(&2, &h.alice, &100);

    assert_eq!(h.client.balance(&1), 500);
    assert_eq!(h.client.balance(&2), 100);
    assert_eq!(h.client.total_held(), 600);
}

#[test]
fn deposit_rejects_non_positive_amounts() {
    let h = setup();

    assert_eq!(
        h.client.try_deposit(&1, &h.alice, &0),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        h.client.try_deposit(&1, &h.alice, &-100),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(h.client.total_held(), 0);
}

#[test]
#[should_panic]
fn deposit_from_an_unauthorised_caller_is_rejected() {
    let h = setup();

    // This is the whole point of splitting treasury from savings: with no
    // authorisation from the registered savings contract, funds cannot move.
    h.env.set_auths(&[]);
    h.client.deposit(&1, &h.alice, &500);
}

#[test]
fn deposit_emits_a_deposit_event() {
    let h = setup();

    h.client.deposit(&7, &h.alice, &250);

    let events = h.env.events().all();
    // The token contract emits its own transfer event; filtering to this
    // contract is what isolates ours.
    let ours = events.filter_by_contract(&h.contract_id);

    assert_eq!(
        ours.events(),
        std::vec![DepositRecorded {
            pool_id: 7,
            from: h.alice.clone(),
            amount: 250,
            pool_balance: 250,
        }
        .to_xdr(&h.env, &h.contract_id)]
    );
    assert!(events.events().len() > ours.events().len());
}

/* ------------------------------------------------------------------ *
 * Withdrawals
 * ------------------------------------------------------------------ */

#[test]
fn withdraw_pays_out_and_reduces_the_balance() {
    let h = setup();
    h.client.deposit(&1, &h.alice, &1_000);
    let before = h.token.balance(&h.alice);

    let remaining = h.client.withdraw(&1, &h.alice, &400);

    assert_eq!(remaining, 600);
    assert_eq!(h.client.balance(&1), 600);
    assert_eq!(h.client.total_held(), 600);
    assert_eq!(h.token.balance(&h.alice), before + 400);
}

#[test]
fn withdraw_beyond_the_pool_balance_is_rejected() {
    let h = setup();
    h.client.deposit(&1, &h.alice, &100);

    assert_eq!(
        h.client.try_withdraw(&1, &h.alice, &500),
        Err(Ok(Error::InsufficientPoolBalance))
    );
    assert_eq!(h.client.balance(&1), 100);
}

#[test]
fn withdraw_cannot_drain_another_pool() {
    let h = setup();
    h.client.deposit(&1, &h.alice, &1_000);

    // Pool 2 holds nothing, even though the treasury holds 1000 overall.
    assert_eq!(
        h.client.try_withdraw(&2, &h.alice, &100),
        Err(Ok(Error::InsufficientPoolBalance))
    );
    assert_eq!(h.client.balance(&1), 1_000);
}

#[test]
fn withdraw_rejects_non_positive_amounts() {
    let h = setup();
    h.client.deposit(&1, &h.alice, &1_000);

    assert_eq!(
        h.client.try_withdraw(&1, &h.alice, &0),
        Err(Ok(Error::InvalidAmount))
    );
}

#[test]
#[should_panic]
fn withdraw_from_an_unauthorised_caller_is_rejected() {
    let h = setup();
    h.client.deposit(&1, &h.alice, &1_000);

    h.env.set_auths(&[]);
    h.client.withdraw(&1, &h.alice, &100);
}

#[test]
fn withdraw_emits_a_withdrawal_event() {
    let h = setup();
    h.client.deposit(&3, &h.alice, &800);

    h.client.withdraw(&3, &h.alice, &300);

    let events = h.env.events().all();
    let ours = events.filter_by_contract(&h.contract_id);

    assert_eq!(
        ours.events(),
        std::vec![WithdrawalProcessed {
            pool_id: 3,
            to: h.alice.clone(),
            amount: 300,
            pool_balance: 500,
        }
        .to_xdr(&h.env, &h.contract_id)]
    );
}

/* ------------------------------------------------------------------ *
 * Uninitialised state
 * ------------------------------------------------------------------ */

#[test]
fn deposits_fail_before_a_savings_contract_is_registered() {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();

    let admin = Address::generate(&env);
    let issuer = Address::generate(&env);
    let alice = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);

    let contract_id = env.register(Treasury, (admin, sac.address()));
    let client = TreasuryClient::new(&env, &contract_id);

    assert_eq!(
        client.try_deposit(&1, &alice, &100),
        Err(Ok(Error::SavingsContractNotSet))
    );
    assert_eq!(
        client.try_savings_contract(),
        Err(Ok(Error::SavingsContractNotSet))
    );
}
