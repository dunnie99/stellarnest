import type { ActivityEvent, Pool, PoolDetail } from '../types';

/** Deterministic fixtures so assertions read against known values. */

export const ALICE = 'GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR';
export const BOB = 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEYVXM3XOJMDS674JZ';

export function makePool(overrides: Partial<Pool> = {}): Pool {
  return {
    id: 0,
    creator: ALICE,
    name: 'Monthly Circle',
    contributionAmount: 1_000_000_000n, // 100 XLM
    cycleSeconds: 2_592_000n, // 30 days
    maxMembers: 5,
    memberCount: 2,
    totalContributed: 5_000_000_000n, // 500 XLM
    createdAt: 1_700_000_000n,
    active: true,
    ...overrides,
  };
}

export function makePoolDetail(overrides: Partial<PoolDetail> = {}): PoolDetail {
  return {
    ...makePool(),
    members: [ALICE, BOB],
    myBalance: 2_000_000_000n, // 200 XLM
    isMember: true,
    ...overrides,
  };
}

export function makeEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: '0017507953145806848-0000000000',
    kind: 'contribution',
    label: 'Contribution Made',
    poolId: 0,
    amount: '100',
    account: ALICE,
    ledger: 4_197_000,
    ledgerClosedAt: new Date().toISOString(),
    txHash: 'a'.repeat(64),
    source: 'savings',
    ...overrides,
  };
}
