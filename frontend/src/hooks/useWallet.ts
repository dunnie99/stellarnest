import { useCallback, useEffect } from 'react';
import {
  connectWallet,
  disconnectWallet,
  getConnectedAddress,
  isUserRejection,
  readWalletError,
} from '../services/walletService';
import { useAppStore } from '../store/useAppStore';

/**
 * Wallet connection, backed by the shared store so every view sees the same
 * address without prop drilling.
 */
export function useWallet() {
  const address = useAppStore((state) => state.address);
  const connecting = useAppStore((state) => state.walletConnecting);
  const error = useAppStore((state) => state.walletError);
  const setAddress = useAppStore((state) => state.setAddress);
  const setConnecting = useAppStore((state) => state.setWalletConnecting);
  const setError = useAppStore((state) => state.setWalletError);

  // Restore an existing session so a refresh does not read as a disconnect.
  useEffect(() => {
    let cancelled = false;
    void getConnectedAddress().then((existing) => {
      if (!cancelled && existing) setAddress(existing);
    });
    return () => {
      cancelled = true;
    };
  }, [setAddress]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      setAddress(await connectWallet());
    } catch (caught) {
      // Dismissing the wallet picker is a choice, not an error to shout about.
      if (!isUserRejection(caught)) {
        setError(readWalletError(caught).message);
      }
    } finally {
      setConnecting(false);
    }
  }, [setAddress, setConnecting, setError]);

  const disconnect = useCallback(async () => {
    try {
      await disconnectWallet();
    } catch {
      // Clearing local state is what the user asked for, even if the extension
      // refuses to tear down cleanly.
    }
    setAddress(null);
    setError(null);
  }, [setAddress, setError]);

  return { address, connecting, error, connect, disconnect };
}
