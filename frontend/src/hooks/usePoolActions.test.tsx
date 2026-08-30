import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePoolActions } from './usePoolActions';
import { resetAppStore, useAppStore } from '../store/useAppStore';
import { ALICE } from '../test/factories';

vi.mock('../services/contractService', async () => {
  const actual = await vi.importActual<typeof import('../services/contractService')>(
    '../services/contractService',
  );
  return {
    ...actual,
    createPool: vi.fn(),
    joinPool: vi.fn(),
    contribute: vi.fn(),
    withdraw: vi.fn(),
  };
});

vi.mock('../services/walletService', () => ({
  signTransaction: vi.fn(),
  isUserRejection: vi.fn((error: unknown) =>
    /declin|reject/i.test((error as { message?: string })?.message ?? ''),
  ),
  readWalletError: vi.fn((error: unknown) => ({
    code: -1,
    message: (error as { message?: string })?.message ?? 'unknown',
  })),
}));

import {
  ContractError,
  contribute,
  createPool,
  joinPool,
  withdraw,
} from '../services/contractService';

describe('usePoolActions', () => {
  beforeEach(() => {
    resetAppStore();
    useAppStore.setState({ address: ALICE });
  });

  it('contributes and records the transaction hash', async () => {
    vi.mocked(contribute).mockResolvedValue({ hash: 'abc123', returnValue: null });
    const { result } = renderHook(() => usePoolActions());

    let ok = false;
    await act(async () => {
      ok = await result.current.contribute(0, 1_000_000_000n);
    });

    expect(ok).toBe(true);
    expect(contribute).toHaveBeenCalledWith(ALICE, 0, 1_000_000_000n);
    expect(result.current.lastTxHash).toBe('abc123');
    expect(result.current.error).toBeNull();
  });

  it('refuses to act without a connected wallet', async () => {
    useAppStore.setState({ address: null });
    const { result } = renderHook(() => usePoolActions());

    let ok = true;
    await act(async () => {
      ok = await result.current.contribute(0, 100n);
    });

    expect(ok).toBe(false);
    expect(contribute).not.toHaveBeenCalled();
    expect(result.current.error?.message).toBe('Please connect your wallet.');
  });

  it('maps an insufficient-balance contract failure', async () => {
    vi.mocked(withdraw).mockRejectedValue(
      new ContractError('Error(Contract, #7) InsufficientBalance', 'contract'),
    );
    const { result } = renderHook(() => usePoolActions());

    await act(async () => {
      await result.current.withdraw(0, 999_000_000_000n);
    });

    expect(result.current.error?.message).toBe('Insufficient balance.');
  });

  it('maps a network failure', async () => {
    vi.mocked(joinPool).mockRejectedValue(new ContractError('rpc down', 'network'));
    const { result } = renderHook(() => usePoolActions());

    await act(async () => {
      await result.current.joinPool(1);
    });

    expect(result.current.error?.message).toBe('Unable to connect to Stellar network.');
  });

  it('reports a user rejection', async () => {
    vi.mocked(createPool).mockRejectedValue({ code: 1, message: 'User declined' });
    const { result } = renderHook(() => usePoolActions());

    await act(async () => {
      await result.current.createPool('Circle', 100n, 86_400n, 5);
    });

    expect(result.current.error?.message).toBe('Transaction was rejected.');
  });

  it('runs the success callback so views refresh after a write', async () => {
    vi.mocked(joinPool).mockResolvedValue({ hash: 'xyz', returnValue: null });
    const onSuccess = vi.fn();
    const { result } = renderHook(() => usePoolActions(onSuccess));

    await act(async () => {
      await result.current.joinPool(2);
    });

    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('does not run the success callback when the write fails', async () => {
    vi.mocked(joinPool).mockRejectedValue(new ContractError('nope', 'contract'));
    const onSuccess = vi.fn();
    const { result } = renderHook(() => usePoolActions(onSuccess));

    await act(async () => {
      await result.current.joinPool(2);
    });

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('clears the pending label once an action settles', async () => {
    vi.mocked(createPool).mockResolvedValue({ hash: 'h', returnValue: 0 });
    const { result } = renderHook(() => usePoolActions());

    await act(async () => {
      await result.current.createPool('Circle', 1_000_000_000n, 2_592_000n, 5);
    });

    expect(result.current.pending).toBeNull();
    expect(result.current.isBusy).toBe(false);
    expect(createPool).toHaveBeenCalledWith(ALICE, 'Circle', 1_000_000_000n, 2_592_000n, 5);
  });

  it('clears transient state on demand', async () => {
    vi.mocked(contribute).mockResolvedValue({ hash: 'abc', returnValue: null });
    const { result } = renderHook(() => usePoolActions());

    await act(async () => {
      await result.current.contribute(0, 100n);
    });
    expect(result.current.lastTxHash).toBe('abc');

    act(() => result.current.clear());
    expect(result.current.lastTxHash).toBeNull();
  });
});
