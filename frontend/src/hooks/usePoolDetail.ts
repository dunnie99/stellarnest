import { useCallback, useEffect, useState } from 'react';
import {
  fetchMemberBalance,
  fetchMembers,
  fetchPool,
  fetchTreasuryBalance,
} from '../services/contractService';
import { useAppStore } from '../store/useAppStore';
import { toAppError } from '../utils/errors';
import { IS_CONFIGURED } from '../config';
import { appError, type AppError, type PoolDetail } from '../types';

/**
 * Loads one pool with its members and the connected account's balance.
 *
 * The treasury balance is fetched alongside the savings-side figure so the
 * detail page can show both. They should always agree — displaying them
 * separately makes any divergence between the two contracts visible rather
 * than hidden behind a single number.
 */
export function usePoolDetail(poolId: number | null) {
  const address = useAppStore((state) => state.address);
  const [pool, setPool] = useState<PoolDetail | null>(null);
  const [treasuryBalance, setTreasuryBalance] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const refresh = useCallback(async () => {
    if (poolId === null) return;
    if (!IS_CONFIGURED) {
      setError(appError('not-configured'));
      return;
    }
    if (!address) {
      setPool(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [base, members, balance] = await Promise.all([
        fetchPool(poolId, address),
        fetchMembers(poolId, address),
        fetchMemberBalance(poolId, address, address),
      ]);

      setPool({
        ...base,
        members,
        myBalance: balance,
        isMember: members.includes(address),
      });

      // Supplementary: a failure here must not blank the page.
      try {
        setTreasuryBalance(await fetchTreasuryBalance(poolId, address));
      } catch {
        setTreasuryBalance(null);
      }
    } catch (caught) {
      setPool(null);
      setError(toAppError(caught));
    } finally {
      setLoading(false);
    }
  }, [poolId, address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { pool, treasuryBalance, loading, error, refresh };
}
