import { Link, useParams } from 'react-router-dom';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Table, { type Column } from '../components/ui/Table';
import ContributeForm from '../components/ContributeForm';
import ActivityFeed from '../components/ActivityFeed';
import { EmptyMessage, ErrorMessage, LoadingMessage } from '../components/ui/StatusMessage';
import { usePoolDetail } from '../hooks/usePoolDetail';
import { usePoolActions } from '../hooks/usePoolActions';
import { useContractEvents } from '../hooks/useContractEvents';
import { useAppStore } from '../store/useAppStore';
import {
  formatCycle,
  formatUnixTime,
  formatXlm,
  truncateMiddle,
} from '../utils/format';
import { LOADING_MESSAGE } from '../types';

interface MemberRow {
  address: string;
  isYou: boolean;
  isCreator: boolean;
}

export default function PoolDetails() {
  const { poolId: poolIdParam } = useParams();
  const poolId = poolIdParam !== undefined ? Number(poolIdParam) : null;
  const address = useAppStore((state) => state.address);

  const { pool, treasuryBalance, loading, error, refresh } = usePoolDetail(
    poolId !== null && Number.isInteger(poolId) ? poolId : null,
  );
  const actions = usePoolActions(refresh);
  const feed = useContractEvents();

  const columns: Array<Column<MemberRow>> = [
    {
      key: 'address',
      header: 'Member',
      render: (row) => (
        <code className="font-mono" title={row.address}>
          {truncateMiddle(row.address, 6, 6)}
        </code>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      hideOnMobile: true,
      render: (row) => (
        <div className="flex gap-1.5">
          {row.isCreator ? <Badge tone="info">Creator</Badge> : null}
          {row.isYou ? <Badge tone="success">You</Badge> : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <Link to="/" className="inline-block text-xs text-beam-400 hover:text-beam-300">
        ← Back to dashboard
      </Link>

      {loading ? (
        <Card>
          <LoadingMessage message={LOADING_MESSAGE.pools} />
        </Card>
      ) : error ? (
        <Card>
          <ErrorMessage error={error} />
        </Card>
      ) : !address ? (
        <Card>
          <EmptyMessage>Please connect your wallet.</EmptyMessage>
        </Card>
      ) : !pool ? (
        <Card>
          <EmptyMessage>This pool could not be found.</EmptyMessage>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-lg font-semibold text-mist-200">{pool.name}</h1>
                <p className="mt-1 text-xs text-mist-400">
                  Pool #{pool.id} · created {formatUnixTime(pool.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={pool.active ? 'success' : 'neutral'}>
                  {pool.active ? 'Open' : 'Closed'}
                </Badge>
                {pool.isMember ? <Badge tone="info">Member</Badge> : null}
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-mist-400">
                  Pool balance
                </dt>
                <dd className="mt-1 font-mono text-sm text-mist-200">
                  {formatXlm(pool.totalContributed)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-mist-400">
                  Held in treasury
                </dt>
                <dd className="mt-1 font-mono text-sm text-mist-200">
                  {treasuryBalance === null ? '—' : formatXlm(treasuryBalance)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-mist-400">
                  Per cycle
                </dt>
                <dd className="mt-1 font-mono text-sm text-mist-200">
                  {formatXlm(pool.contributionAmount)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-mist-400">
                  Cycle length
                </dt>
                <dd className="mt-1 text-sm text-mist-200">
                  {formatCycle(pool.cycleSeconds)}
                </dd>
              </div>
            </dl>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title={pool.isMember ? 'Contribute or withdraw' : 'Join this pool'}>
              {pool.isMember ? (
                <ContributeForm
                  myBalance={pool.myBalance}
                  suggestedAmount={pool.contributionAmount}
                  pending={actions.pending}
                  error={actions.error}
                  lastTxHash={actions.lastTxHash}
                  onContribute={(amount) => actions.contribute(pool.id, amount)}
                  onWithdraw={(amount) => actions.withdraw(pool.id, amount)}
                />
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-mist-400">
                    {pool.memberCount >= pool.maxMembers
                      ? 'This pool has reached its member limit.'
                      : `Join to start contributing ${formatXlm(pool.contributionAmount)} per cycle.`}
                  </p>
                  <Button
                    onClick={() => actions.joinPool(pool.id)}
                    loading={actions.isBusy}
                    disabled={!pool.active || pool.memberCount >= pool.maxMembers}
                  >
                    Join Pool
                  </Button>
                  {actions.error ? <ErrorMessage error={actions.error} /> : null}
                </div>
              )}
            </Card>

            <Card title={`Members (${pool.memberCount} / ${pool.maxMembers})`}>
              <Table
                columns={columns}
                rows={pool.members.map((member) => ({
                  address: member,
                  isYou: member === address,
                  isCreator: member === pool.creator,
                }))}
                rowKey={(row) => row.address}
                empty="No members yet."
              />
            </Card>
          </div>

          <Card title="Pool activity">
            <ActivityFeed
              events={feed.events}
              live={feed.live}
              error={feed.error}
              poolId={pool.id}
              max={15}
            />
          </Card>
        </>
      )}
    </div>
  );
}
