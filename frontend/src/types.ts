/** A savings circle, as returned by the contract. */
export interface Pool {
  id: number;
  creator: string;
  name: string;
  /** Expected contribution per cycle, in stroops. */
  contributionAmount: bigint;
  cycleSeconds: bigint;
  maxMembers: number;
  memberCount: number;
  /** Net of withdrawals, in stroops. */
  totalContributed: bigint;
  createdAt: bigint;
  active: boolean;
}

export interface PoolDetail extends Pool {
  members: string[];
  /** The connected account's contributed balance in this pool, in stroops. */
  myBalance: bigint;
  isMember: boolean;
}

/** One decoded contract event for the live activity feed. */
export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  label: string;
  poolId: number | null;
  /** Formatted amount in XLM, when the event carries one. */
  amount: string | null;
  account: string | null;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
  source: 'savings' | 'treasury';
}

export type ActivityKind =
  | 'pool_created'
  | 'member_joined'
  | 'contribution'
  | 'withdrawal'
  | 'deposit'
  | 'savings_set'
  | 'unknown';

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  pool_created: 'Pool Created',
  member_joined: 'Member Joined',
  contribution: 'Contribution Made',
  withdrawal: 'Withdrawal Processed',
  // The treasury's own record of a contribution. It mirrors `ContributionMade`
  // from the savings side, so it is labelled distinctly rather than duplicating
  // the user-facing wording.
  deposit: 'Treasury Deposit',
  // Emitted once at deploy when the treasury is told which savings contract may
  // move its funds. Named so it does not read as an anonymous event in the feed.
  savings_set: 'Treasury Linked',
  unknown: 'Contract Event',
};

/**
 * Every user-facing failure mode, with the message the spec requires.
 *
 * A closed set means each path is deliberately handled instead of collapsing
 * into a generic error.
 */
export type AppErrorKind =
  | 'wallet-not-connected'
  | 'insufficient-balance'
  | 'unauthorized'
  | 'transaction-failed'
  | 'network'
  | 'user-rejected'
  | 'not-configured'
  | 'validation';

export const APP_ERROR_MESSAGE: Record<AppErrorKind, string> = {
  'wallet-not-connected': 'Please connect your wallet.',
  'insufficient-balance': 'Insufficient balance.',
  unauthorized: 'You are not authorized to perform this action.',
  'transaction-failed': 'Transaction failed.',
  network: 'Unable to connect to Stellar network.',
  'user-rejected': 'Transaction was rejected.',
  'not-configured': 'Contracts are not configured.',
  validation: 'Please check the values you entered.',
};

export interface AppError {
  kind: AppErrorKind;
  message: string;
  detail?: string;
}

export function appError(kind: AppErrorKind, detail?: string): AppError {
  return { kind, message: APP_ERROR_MESSAGE[kind], detail };
}

/** Loading states the UI renders, with the spec's exact wording. */
export const LOADING_MESSAGE = {
  wallet: 'Connecting Wallet...',
  pools: 'Loading Savings Pool...',
  contribution: 'Processing Contribution...',
  withdrawal: 'Processing Withdrawal...',
} as const;
