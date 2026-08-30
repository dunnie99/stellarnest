import { describe, expect, it } from 'vitest';
import { Contract, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';
import { decodeEvent } from './eventService';
import { ALICE } from '../test/factories';

/**
 * Builds an event in the shape Soroban RPC actually returns: `topic` and
 * `value` already XDR-parsed, and `contractId` as a `Contract` instance rather
 * than a string. Getting either of those wrong is the classic decode bug, so
 * the fixture reproduces the real shape rather than a convenient one.
 */
function makeRpcEvent(
  topics: xdr.ScVal[],
  value: xdr.ScVal,
  overrides: Partial<rpc.Api.EventResponse> = {},
): rpc.Api.EventResponse {
  return {
    id: '0017507953145806848-0000000000',
    type: 'contract',
    ledger: 4_197_000,
    ledgerClosedAt: '2026-08-17T21:08:27Z',
    transactionIndex: 0,
    operationIndex: 0,
    inSuccessfulContractCall: true,
    txHash: 'a'.repeat(64),
    contractId: new Contract(
      'CD4ZQQYQJKB6DZWH5KIWTPCHTRFSTAEMX5KNGGGAR5TZF322ZCLR2HKU',
    ),
    topic: topics,
    value,
    ...overrides,
  } as rpc.Api.EventResponse;
}

const sym = (value: string) => nativeToScVal(value, { type: 'symbol' });
const u32 = (value: number) => nativeToScVal(value, { type: 'u32' });
const addr = (value: string) => nativeToScVal(value, { type: 'address' });

describe('decodeEvent', () => {
  it('decodes a contribution event', () => {
    const event = decodeEvent(
      makeRpcEvent(
        [sym('savings'), sym('contribution'), u32(3), addr(ALICE)],
        nativeToScVal(
          { amount: 1_000_000_000n, member_balance: 2_000_000_000n },
          {
            type: {
              amount: ['symbol', 'i128'],
              member_balance: ['symbol', 'i128'],
            },
          },
        ),
      ),
    );

    expect(event.kind).toBe('contribution');
    expect(event.label).toBe('Contribution Made');
    expect(event.poolId).toBe(3);
    expect(event.account).toBe(ALICE);
    // Stroops from the contract must reach the UI as XLM.
    expect(event.amount).toBe('100');
    expect(event.ledger).toBe(4_197_000);
  });

  it('decodes a pool creation event', () => {
    const event = decodeEvent(
      makeRpcEvent(
        [sym('savings'), sym('pool_created'), u32(0), addr(ALICE)],
        nativeToScVal({ max_members: 5 }, { type: { max_members: ['symbol', 'u32'] } }),
      ),
    );

    expect(event.kind).toBe('pool_created');
    expect(event.label).toBe('Pool Created');
    expect(event.poolId).toBe(0);
    expect(event.amount).toBeNull();
  });

  it('decodes a member joined event', () => {
    const event = decodeEvent(
      makeRpcEvent(
        [sym('savings'), sym('member_joined'), u32(1), addr(ALICE)],
        nativeToScVal(
          { member_count: 2 },
          { type: { member_count: ['symbol', 'u32'] } },
        ),
      ),
    );

    expect(event.kind).toBe('member_joined');
    expect(event.label).toBe('Member Joined');
  });

  it('decodes a withdrawal event', () => {
    const event = decodeEvent(
      makeRpcEvent(
        [sym('savings'), sym('withdrawal'), u32(2), addr(ALICE)],
        nativeToScVal({ amount: 500_000_000n }, { type: { amount: ['symbol', 'i128'] } }),
      ),
    );

    expect(event.kind).toBe('withdrawal');
    expect(event.label).toBe('Withdrawal Processed');
    expect(event.amount).toBe('50');
  });

  it('falls back gracefully for an unrecognised event type', () => {
    const event = decodeEvent(
      makeRpcEvent([sym('savings'), sym('something_new'), u32(0)], nativeToScVal(null)),
    );

    // An event added to the contract later must not break the feed.
    expect(event.kind).toBe('unknown');
    expect(event.label).toBe('Contract Event');
  });

  it('handles events with no indexed pool or account', () => {
    const event = decodeEvent(
      makeRpcEvent([sym('treasury'), sym('savings_set')], nativeToScVal(null)),
    );

    expect(event.poolId).toBeNull();
    expect(event.account).toBeNull();
  });

  it('attributes events to the emitting contract', () => {
    const event = decodeEvent(
      makeRpcEvent([sym('savings'), sym('contribution'), u32(0)], nativeToScVal(null)),
    );
    // The test env configures the savings contract as this id.
    expect(event.source).toBe('savings');
  });

  it('reads contractId through .contractId(), not as a string', () => {
    // `EventResponse.contractId` is a Contract instance; treating it as a
    // string yields "[object Object]" and misattributes every event.
    const contract = new Contract(
      'CD4ZQBOCX7M6CQIZTHEH4MAOS5XJ52JKZLRZXKYAL2CQ2TWOJLPGUKCA',
    );
    const event = decodeEvent(
      makeRpcEvent([sym('treasury'), sym('deposit'), u32(0)], nativeToScVal(null), {
        contractId: contract,
      } as Partial<rpc.Api.EventResponse>),
    );

    expect(event.source).toBe('treasury');
  });
});
