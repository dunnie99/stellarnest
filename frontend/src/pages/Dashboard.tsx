import { useMemo, useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import PoolCard from '../components/PoolCard';
import ActivityFeed from '../components/ActivityFeed';
import CreatePoolModal from '../components/CreatePoolModal';
import SetupBanner from '../components/SetupBanner';
import { EmptyMessage, ErrorMessage, LoadingMessage } from '../components/ui/StatusMessage';
import { usePools } from '../hooks/usePools';
import { usePoolActions } from '../hooks/usePoolActions';
import { useContractEvents } from '../hooks/useContractEvents';
import { useAppStore } from '../store/useAppStore';
import { formatXlm } from '../utils/format';
import { LOADING_MESSAGE } from '../types';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-850 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-mist-400">
        {label}
      </p>
      <p className="mt-1 font-mono text-lg text-mist-200">{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const address = useAppStore((state) => state.address);
  const { pools, loading, error, refresh } = usePools();
  const actions = usePoolActions(refresh);
  const feed = useContractEvents();
  const [creating, setCreating] = useState(false);

  const totals = useMemo(() => {
    const saved = pools.reduce((sum, pool) => sum + pool.totalContributed, 0n);
    const members = pools.reduce((sum, pool) => sum + pool.memberCount, 0);
    return { saved, members };
  }, [pools]);

  return (
    <div className="space-y-5">
      <SetupBanner />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Pools" value={String(pools.length)} />
        <Stat label="Total saved" value={formatXlm(totals.saved)} />
        <Stat label="Memberships" value={String(totals.members)} />
        <Stat
          label="Open pools"
          value={String(pools.filter((pool) => pool.active).length)}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card
          title="Savings Pools"
          action={
            <Button size="sm" onClick={() => setCreating(true)} disabled={!address}>
              Create Pool
            </Button>
          }
        >
          {loading ? (
            <LoadingMessage message={LOADING_MESSAGE.pools} />
          ) : error ? (
            <ErrorMessage error={error} />
          ) : !address ? (
            <EmptyMessage>Please connect your wallet.</EmptyMessage>
          ) : pools.length === 0 ? (
            <EmptyMessage>No savings pools yet. Create the first one.</EmptyMessage>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {pools.map((pool) => (
                <PoolCard key={pool.id} pool={pool} />
              ))}
            </div>
          )}
        </Card>

        <Card title="Live Activity Feed">
          <ActivityFeed
            events={feed.events}
            live={feed.live}
            error={feed.error}
            max={8}
          />
        </Card>
      </div>

      <CreatePoolModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={actions.createPool}
        busy={actions.isBusy}
        error={actions.error}
      />
    </div>
  );
}
