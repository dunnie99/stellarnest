import { describe, expect, it } from 'vitest';
import { scValToNative } from '@stellar/stellar-sdk';
import {
  addressArg,
  ContractError,
  i128Arg,
  stringArg,
  u32Arg,
  u64Arg,
} from './contractService';
import { ALICE } from '../test/factories';

/**
 * Argument encoding is where a whole class of silent failures lives.
 *
 * `nativeToScVal` picks the *narrowest* type that fits when left untyped, so a
 * plain `100` becomes `u64` and a contract expecting `i128` rejects the call
 * with an opaque error. These assertions pin the explicit typing.
 */
describe('ScVal argument encoders', () => {
  it('encodes an address', () => {
    const value = addressArg(ALICE);
    expect(value.switch().name).toBe('scvAddress');
    expect(scValToNative(value)).toBe(ALICE);
  });

  it('encodes u32 rather than a wider integer', () => {
    const value = u32Arg(5);
    expect(value.switch().name).toBe('scvU32');
    expect(scValToNative(value)).toBe(5);
  });

  it('encodes u64 for cycle lengths', () => {
    const value = u64Arg(2_592_000n);
    expect(value.switch().name).toBe('scvU64');
    expect(scValToNative(value)).toBe(2_592_000n);
  });

  it('encodes i128 for amounts, not the narrower type that would fit', () => {
    const value = i128Arg(1_000_000_000n);
    // Left untyped this value would encode as u64 and be rejected on-chain.
    expect(value.switch().name).toBe('scvI128');
    expect(scValToNative(value)).toBe(1_000_000_000n);
  });

  it('encodes i128 for values beyond 64 bits', () => {
    const huge = 170_141_183_460_469_231_731_687_303_715_884_105_727n / 2n;
    expect(scValToNative(i128Arg(huge))).toBe(huge);
  });

  it('encodes a string rather than a symbol', () => {
    const value = stringArg('Monthly Circle');
    expect(value.switch().name).toBe('scvString');
    expect(scValToNative(value)).toBe('Monthly Circle');
  });
});

describe('ContractError', () => {
  it('distinguishes contract rejection from transport failure', () => {
    const contract = new ContractError('Error(Contract, #7)', 'contract');
    expect(contract.kind).toBe('contract');
    expect(contract).toBeInstanceOf(Error);
    expect(contract.name).toBe('ContractError');

    expect(new ContractError('rpc down', 'network').kind).toBe('network');
  });
});
