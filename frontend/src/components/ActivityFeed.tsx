import Badge from './ui/Badge';
import { EmptyMessage } from './ui/StatusMessage';
import { relativeTime, truncateMiddle } from '../utils/format';
import type { ActivityEvent, ActivityKind } from '../types';

interface Props {
  events: ActivityEvent[];
  live: boolean;
  error: string | null;
  /** Limits the feed to one pool's activity on the pool detail page. */
  poolId?: number;
  max?: number;
}

const TONE: Record<ActivityKind, 'success' | 'info' | 'neutral' | 'warning'> = {
  pool_created: 'info',
  member_joined: 'neutral',
  contribution: 'success',
  withdrawal: 'warning',
  deposit: 'success',
  savings_set: 'neutral',
  unknown: 'neutral',
};

export default function ActivityFeed({ events, live, error, poolId, max }: Props) {
  const filtered = poolId === undefined
    ? events
    : events.filter((event) => event.poolId === poolId);
  const visible = max ? filtered.slice(0, max) : filtered;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] text-mist-400">
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${live ? 'bg-jade-400 animate-pulse-fade' : 'bg-ink-600'}`}
          />
          {live ? 'Live' : 'Offline'}
        </span>
        {filtered.length > 0 ? (
          <span className="text-[11px] text-mist-400">{filtered.length} events</span>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-ember-400/40 bg-ember-400/5 px-4 py-3"
        >
          <p className="text-xs text-ember-400">Unable to connect to Stellar network.</p>
        </div>
      ) : visible.length === 0 ? (
        <EmptyMessage>No activity yet.</EmptyMessage>
      ) : (
        <ul className="space-y-2" data-testid="activity-list">
          {visible.map((event) => (
            <li
              key={event.id}
              className="rounded-lg border border-ink-700 bg-ink-850 px-3.5 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone={TONE[event.kind]}>{event.label}</Badge>
                {event.amount ? (
                  <span className="font-mono text-xs text-mist-200">
                    {event.amount} XLM
                  </span>
                ) : null}
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-mist-400">
                {event.poolId !== null ? <span>Pool #{event.poolId}</span> : null}
                {event.account ? (
                  <code className="font-mono">{truncateMiddle(event.account, 4, 4)}</code>
                ) : null}
                <span>{relativeTime(event.ledgerClosedAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
