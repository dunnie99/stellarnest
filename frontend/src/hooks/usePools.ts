import { useCallback, useEffect } from 'react';
import { fetchAllPools } from '../services/contractService';
import { useAppStore } from '../store/useAppStore';
import { toAppError } from '../utils/errors';
import { IS_CONFIGURED } from '../config';
import { appError } from '../types';

/**
 * Loads every savings pool.
 *
 * Reads are simulations, which still require a source account. When no wallet
 * is connected there is nothing to simulate from, so the list stays empty and
 * the UI prompts for a connection rather than erroring.
 */
export function usePools() {
  const address = useAppStore((state) => state.address);
  const pools = useAppStore((state) => state.pools);
  const loading = useAppStore((state) => state.poolsLoading);
  const error = useAppStore((state) => state.poolsError);
  const setPools = useAppStore((state) => state.setPools);
  const setLoading = useAppStore((state) => state.setPoolsLoading);
  const setError = useAppStore((state) => state.setPoolsError);

  const refresh = useCallback(async () => {
    if (!IS_CONFIGURED) {
      setError(appError('not-configured'));
      return;
    }
    if (!address) {
      setPools([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setPools(await fetchAllPools(address));
    } catch (caught) {
      setError(toAppError(caught));
    } finally {
      setLoading(false);
    }
  }, [address, setPools, setLoading, setError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { pools, loading, error, refresh };
}
