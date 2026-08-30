import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useWallet } from './useWallet';
import { resetAppStore, useAppStore } from '../store/useAppStore';
import { ALICE } from '../test/factories';

// The wallet kit cannot load under jsdom, so the service that wraps it is the
// mock boundary — the same boundary the app itself is designed around.
vi.mock('../services/walletService', () => ({
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  getConnectedAddress: vi.fn(),
  isUserRejection: vi.fn(() => false),
  readWalletError: vi.fn((error: unknown) => ({
    code: -1,
    message: (error as Error)?.message ?? 'unknown',
  })),
}));

import {
  connectWallet,
  disconnectWallet,
  getConnectedAddress,
  isUserRejection,
} from '../services/walletService';

describe('useWallet', () => {
  beforeEach(() => {
    resetAppStore();
    vi.mocked(getConnectedAddress).mockResolvedValue(null);
    vi.mocked(isUserRejection).mockReturnValue(false);
  });

  it('starts with no connected address', async () => {
    const { result } = renderHook(() => useWallet());

    await waitFor(() => expect(getConnectedAddress).toHaveBeenCalled());
    expect(result.current.address).toBeNull();
  });

  it('connects and exposes the returned address', async () => {
    vi.mocked(connectWallet).mockResolvedValue(ALICE);
    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(connectWallet).toHaveBeenCalledOnce();
    expect(result.current.address).toBe(ALICE);
    expect(result.current.error).toBeNull();
    // The address must land in the shared store, not just local state, or other
    // views would not see the connection.
    expect(useAppStore.getState().address).toBe(ALICE);
  });

  it('disconnects and clears the address', async () => {
    vi.mocked(connectWallet).mockResolvedValue(ALICE);
    vi.mocked(disconnectWallet).mockResolvedValue(undefined);
    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.address).toBe(ALICE);

    await act(async () => {
      await result.current.disconnect();
    });

    expect(disconnectWallet).toHaveBeenCalledOnce();
    expect(result.current.address).toBeNull();
    expect(useAppStore.getState().address).toBeNull();
  });

  it('restores an existing wallet session on mount', async () => {
    vi.mocked(getConnectedAddress).mockResolvedValue(ALICE);
    const { result } = renderHook(() => useWallet());

    await waitFor(() => expect(result.current.address).toBe(ALICE));
  });

  it('surfaces a genuine connection failure', async () => {
    vi.mocked(connectWallet).mockRejectedValue(new Error('extension unavailable'));
    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.error).toBe('extension unavailable');
    expect(result.current.address).toBeNull();
  });

  it('stays silent when the user dismisses the wallet prompt', async () => {
    // Declining is a deliberate choice, not a failure to report.
    vi.mocked(connectWallet).mockRejectedValue({ code: 1, message: 'User declined' });
    vi.mocked(isUserRejection).mockReturnValue(true);
    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.address).toBeNull();
  });

  it('clears local state even when the extension fails to disconnect', async () => {
    vi.mocked(connectWallet).mockResolvedValue(ALICE);
    vi.mocked(disconnectWallet).mockRejectedValue(new Error('teardown failed'));
    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      await result.current.disconnect();
    });

    // The UI must not be stranded in a connected state.
    expect(result.current.address).toBeNull();
  });
});
