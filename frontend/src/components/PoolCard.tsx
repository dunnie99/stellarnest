import { Link } from 'react-router-dom';
import Badge from './ui/Badge';
import { formatCycle, formatXlm, truncateMiddle } from '../utils/format';
import type { Pool } from '../types';

interface Props {
  pool: Pool;
}

export default function PoolCard({ pool }: Props) {
  const full = pool.memberCount >= pool.maxMembers;
  const fillPercent = Math.min(100, (pool.memberCount / pool.maxMembers) * 100);

  return (
    <Link
      to={`/pools/${pool.id}`}
      className="block rounded-lg border border-ink-700 bg-ink-850 p-4 transition hover:border-beam-500/60 hover:bg-ink-800"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-mist-200">{pool.name}</h3>
          <p className="mt-0.5 text-[11px] text-mist-400">
            Pool #{pool.id} · by {truncateMiddle(pool.creator, 4, 4)}
          </p>
        </div>
        <Badge tone={pool.active ? (full ? 'warning' : 'success') : 'neutral'}>
          {pool.active ? (full ? 'Full' : 'Open') : 'Closed'}
        </Badge>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-mist-400">Pool balance</dt>
          <dd className="mt-0.5 font-mono text-mist-200">
            {formatXlm(pool.totalContributed)}
          </dd>
        </div>
        <div>
          <dt className="text-mist-400">Per cycle</dt>
          <dd className="mt-0.5 font-mono text-mist-200">
            {formatXlm(pool.contributionAmount)}
          </dd>
        </div>
        <div>
          <dt className="text-mist-400">Members</dt>
          <dd className="mt-0.5 text-mist-200">
            {pool.memberCount} / {pool.maxMembers}
          </dd>
        </div>
        <div>
          <dt className="text-mist-400">Cycle</dt>
          <dd className="mt-0.5 text-mist-200">{formatCycle(pool.cycleSeconds)}</dd>
        </div>
      </dl>

      <div
        className="mt-3 h-1 overflow-hidden rounded-full bg-ink-700"
        role="presentation"
      >
        <div className="h-full bg-beam-500" style={{ width: `${fillPercent}%` }} />
      </div>
    </Link>
  );
}
