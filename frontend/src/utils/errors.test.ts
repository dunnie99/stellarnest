import { describe, expect, it } from 'vitest';
import { toAppError } from './errors';
import { ContractError } from '../services/contractService';

describe('toAppError', () => {
  it('recognises a user rejection from the wallet', () => {
    // Wallet errors are plain objects, not Error instances.
    expect(toAppError({ code: 1, message: 'User declined the request' }).kind).toBe(
      'user-rejected',
    );
  });

  it('maps an insufficient-balance contract failure', () => {
    const error = toAppError(
      new ContractError('HostError: Error(Contract, #7) InsufficientBalance', 'contract'),
    );
    expect(error.kind).toBe('insufficient-balance');
    expect(error.message).toBe('Insufficient balance.');
  });

  it('maps an authorization contract failure', () => {
    const error = toAppError(
      new ContractError('HostError: Error(Contract, #8) Unauthorized', 'contract'),
    );
    expect(error.kind).toBe('unauthorized');
    expect(error.message).toBe('You are not authorized to perform this action.');
  });

  it('maps a non-member rejection to the authorization message', () => {
    expect(toAppError(new ContractError('NotMember', 'contract')).kind).toBe(
      'unauthorized',
    );
  });

  it('falls back to a generic transaction failure for unrecognised contract errors', () => {
    const error = toAppError(new ContractError('Error(Contract, #99)', 'contract'));
    expect(error.kind).toBe('transaction-failed');
    expect(error.message).toBe('Transaction failed.');
  });

  it('maps a network-kind contract error to the network message', () => {
    const error = toAppError(new ContractError('rpc unreachable', 'network'));
    expect(error.kind).toBe('network');
    expect(error.message).toBe('Unable to connect to Stellar network.');
  });

  it('recognises a transport failure from a plain Error', () => {
    expect(toAppError(new Error('fetch failed')).kind).toBe('network');
    expect(toAppError(new Error('Failed to fetch')).kind).toBe('network');
  });

  it('handles a thrown value that is neither Error nor wallet-shaped', () => {
    const error = toAppError('something odd');
    expect(error.kind).toBe('transaction-failed');
  });

  it('retains the underlying detail for diagnostics', () => {
    const error = toAppError(new ContractError('Error(Contract, #7)', 'contract'));
    expect(error.detail).toContain('#7');
  });
});
