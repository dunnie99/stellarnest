import { useCallback } from 'react';
import {
  contribute as contributeCall,
  createPool as createPoolCall,
  joinPool as joinPoolCall,
  withdraw as withdrawCall,
} from '../services/contractService';
import { useAppStore } from '../store/useAppStore';
import { toAppError } from '../utils/errors';
import { IS_CONFIGURED } from '../config';
import { appError, LOADING_MESSAGE } from '../types';

/**
 * The write path: create, join, contribute, withdraw.
 *
 * Every action funnels through `run`, so the in-flight label, the error
 * mapping, and the resulting transaction hash are handled identically for all
 * four rather than duplicated per action.
 */
export function usePoolActions(onSuccess?: () => void) {
  const address = useAppStore((state) => state.address);
  const pending = useAppStore((state) => state.pendingAction);
  const error = useAppStore((state) => state.actionError);
  const lastTxHash = useAppStore((state) => state.lastTxHash);
  const setPending = useAppStore((state) => state.setPendingAction);
  const setError = useAppStore((state) => state.setActionError);
  const setLastTxHash = useAppStore((state) => state.setLastTxHash);
  const clear = useAppStore((state) => state.clearActionState);

  const run = useCallback(
    async (label: string, action: (address: string) => Promise<{ hash: string }>) => {
      setError(null);
      setLastTxHash(null);

      if (!IS_CONFIGURED) {
        setError(appError('not-configured'));
        return false;
      }
      if (!address) {
        setError(appError('wallet-not-connected'));
        return false;
      }

      setPending(label);
      try {
        const { hash } = await action(address);
        setLastTxHash(hash);
        onSuccess?.();
        return true;
      } catch (caught) {
        setError(toAppError(caught));
        return false;
      } finally {
        setPending(null);
      }
    },
    [address, onSuccess, setError, setLastTxHash, setPending],
  );

  return {
    pending,
    error,
    lastTxHash,
    clear,
    isBusy: pending !== null,

    createPool: useCallback(
      (name: string, amount: bigint, cycleSeconds: bigint, maxMembers: number) =>
        run('Creating pool...', (from) =>
          createPoolCall(from, name, amount, cycleSeconds, maxMembers),
        ),
      [run],
    ),

    joinPool: useCallback(
      (poolId: number) => run('Joining pool...', (from) => joinPoolCall(from, poolId)),
      [run],
    ),

    contribute: useCallback(
      (poolId: number, amount: bigint) =>
        run(LOADING_MESSAGE.contribution, (from) => contributeCall(from, poolId, amount)),
      [run],
    ),

    withdraw: useCallback(
      (poolId: number, amount: bigint) =>
        run(LOADING_MESSAGE.withdrawal, (from) => withdrawCall(from, poolId, amount)),
      [run],
    ),
  };
}
