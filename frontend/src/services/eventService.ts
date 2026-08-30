import { scValToNative, rpc } from '@stellar/stellar-sdk';
import { SAVINGS_CONTRACT_ID, TREASURY_CONTRACT_ID } from '../config';
import { server } from './contractService';
import { stroopsToXlm } from '../utils/format';
import { ACTIVITY_LABELS, type ActivityEvent, type ActivityKind } from '../types';

/**
 * Streams events from both contracts into one activity feed.
 *
 * Soroban RPC keeps only a rolling window of ledgers — measured at ~120,960
 * (about 7 days) on Testnet. Requesting a start point older than `oldestLedger`
 * is an error rather than an empty result, so every start ledger is clamped.
 */

/** Second topic of each event → the activity kind it represents. */
const KIND_BY_TOPIC: Record<string, ActivityKind> = {
  pool_created: 'pool_created',
  member_joined: 'member_joined',
  contribution: 'contribution',
  withdrawal: 'withdrawal',
  deposit: 'deposit',
  savings_set: 'savings_set',
};

export interface EventPage {
  events: ActivityEvent[];
  cursor: string | null;
  latestLedger: number;
}

/**
 * How far back the first poll looks.
 *
 * Deliberately far smaller than the ~7-day retention window. RPC scans
 * *forward* from `startLedger` across a bounded number of ledgers per request,
 * so an over-long lookback burns the scan budget on old ledgers and returns
 * **zero events even when recent ones exist**. Measured against a live deployed
 * contract: a 17,280-ledger lookback returned 0 events while 6,000 returned all
 * of them.
 *
 * ~6,000 ledgers is roughly 8 hours.
 */
export const DEFAULT_LOOKBACK_LEDGERS = 6_000;

export async function resolveStartLedger(
  lookbackLedgers = DEFAULT_LOOKBACK_LEDGERS,
): Promise<number> {
  const health = await server.getHealth();
  // `oldestLedger` can itself age out between this call and the next request,
  // so start one past it.
  return Math.max(health.latestLedger - lookbackLedgers, health.oldestLedger + 1);
}

function decodeTopics(event: rpc.Api.EventResponse): string[] {
  return event.topic.map((entry) => {
    try {
      return String(scValToNative(entry));
    } catch {
      return '';
    }
  });
}

export function decodeEvent(event: rpc.Api.EventResponse): ActivityEvent {
  const topics = decodeTopics(event);
  const kind = KIND_BY_TOPIC[topics[1] ?? ''] ?? 'unknown';

  let data: Record<string, unknown> = {};
  try {
    const native = scValToNative(event.value);
    if (native && typeof native === 'object') data = native as Record<string, unknown>;
  } catch {
    data = {};
  }

  // Indexed fields arrive as topics: [scope, action, pool_id, account].
  const poolIdTopic = topics[2];
  const poolId = poolIdTopic && /^\d+$/.test(poolIdTopic) ? Number(poolIdTopic) : null;
  const accountTopic = topics[3];
  const account = accountTopic && accountTopic.startsWith('G') ? accountTopic : null;

  const rawAmount = data.amount;
  const amount =
    typeof rawAmount === 'bigint'
      ? stroopsToXlm(rawAmount)
      : typeof rawAmount === 'number'
        ? stroopsToXlm(BigInt(rawAmount))
        : null;

  const contractId = event.contractId?.contractId();

  return {
    id: event.id,
    kind,
    label: ACTIVITY_LABELS[kind],
    poolId,
    amount,
    account,
    ledger: event.ledger,
    ledgerClosedAt: event.ledgerClosedAt,
    txHash: event.txHash,
    source: contractId === TREASURY_CONTRACT_ID ? 'treasury' : 'savings',
  };
}

/**
 * Fetches one page of events across both contracts.
 *
 * `startLedger` and `cursor` are mutually exclusive in the RPC request type, so
 * the two cases build different request objects.
 */
export async function fetchEvents(
  options: { startLedger: number; cursor?: undefined } | { cursor: string; startLedger?: undefined },
  limit = 100,
  contractIds: string[] = [SAVINGS_CONTRACT_ID, TREASURY_CONTRACT_ID],
): Promise<EventPage> {
  const filters = [
    {
      type: 'contract' as const,
      contractIds: contractIds.filter((id) => id.length > 0),
    },
  ];

  const response =
    options.cursor !== undefined
      ? await server.getEvents({ filters, cursor: options.cursor, limit })
      : await server.getEvents({ filters, startLedger: options.startLedger, limit });

  return {
    events: response.events.map(decodeEvent),
    cursor: response.cursor ?? null,
    latestLedger: response.latestLedger,
  };
}
