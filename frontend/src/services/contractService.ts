import {
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import {
  NETWORK_PASSPHRASE,
  SAVINGS_CONTRACT_ID,
  SOROBAN_RPC_URL,
  TREASURY_CONTRACT_ID,
} from '../config';
import { signTransaction } from './walletService';
import { createLogger } from '../utils/logger';
import type { Pool } from '../types';

const log = createLogger('contract');

export const server = new rpc.Server(SOROBAN_RPC_URL);

export const savings = () => new Contract(SAVINGS_CONTRACT_ID);
export const treasury = () => new Contract(TREASURY_CONTRACT_ID);

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export class ContractError extends Error {
  readonly kind: 'network' | 'contract';

  constructor(message: string, kind: 'network' | 'contract') {
    super(message);
    this.name = 'ContractError';
    this.kind = kind;
  }
}

/* ------------------------------------------------------------------ *
 * Argument helpers
 * ------------------------------------------------------------------ */

/**
 * Integer typing must be explicit. Untyped, `nativeToScVal` chooses the
 * narrowest type that fits, so a plain number becomes `u64` and a contract
 * expecting `i128` or `u32` rejects the call.
 */
export const addressArg = (value: string) => nativeToScVal(value, { type: 'address' });
export const u32Arg = (value: number) => nativeToScVal(value, { type: 'u32' });
export const u64Arg = (value: bigint) => nativeToScVal(value, { type: 'u64' });
export const i128Arg = (value: bigint) => nativeToScVal(value, { type: 'i128' });
export const stringArg = (value: string) => nativeToScVal(value, { type: 'string' });

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

/**
 * Simulates a call without submitting it.
 *
 * Simulation still needs a source account, but signs nothing and costs nothing.
 * When no wallet is connected the caller passes a read-only placeholder.
 */
export async function simulate<T>(
  contract: Contract,
  method: string,
  args: xdr.ScVal[],
  sourceAddress: string,
): Promise<T> {
  let account;
  try {
    account = await server.getAccount(sourceAddress);
  } catch (error) {
    throw new ContractError(
      error instanceof Error ? error.message : 'Account could not be loaded.',
      'network',
    );
  }

  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const result = await server.simulateTransaction(transaction);

  if (rpc.Api.isSimulationError(result)) {
    log.warn(`simulation failed for ${method}`, result.error);
    throw new ContractError(result.error, 'contract');
  }

  if (!result.result?.retval) {
    throw new ContractError(`${method} returned no value.`, 'contract');
  }

  return scValToNative(result.result.retval) as T;
}

/** Shape returned by `scValToNative` for the contract's `Pool` struct. */
interface RawPool {
  id: number;
  creator: string;
  name: string;
  contribution_amount: bigint;
  cycle_seconds: bigint;
  max_members: number;
  member_count: number;
  total_contributed: bigint;
  created_at: bigint;
  active: boolean;
}

function toPool(raw: RawPool): Pool {
  return {
    id: Number(raw.id),
    creator: raw.creator,
    name: raw.name,
    contributionAmount: BigInt(raw.contribution_amount),
    cycleSeconds: BigInt(raw.cycle_seconds),
    maxMembers: Number(raw.max_members),
    memberCount: Number(raw.member_count),
    totalContributed: BigInt(raw.total_contributed),
    createdAt: BigInt(raw.created_at),
    active: Boolean(raw.active),
  };
}

export async function fetchPoolCount(source: string): Promise<number> {
  return Number(await simulate<bigint | number>(savings(), 'pool_count', [], source));
}

export async function fetchPool(poolId: number, source: string): Promise<Pool> {
  return toPool(await simulate<RawPool>(savings(), 'get_pool', [u32Arg(poolId)], source));
}

/**
 * Loads every pool.
 *
 * Pool ids are dense (`0..pool_count`), so the whole set is reachable without an
 * index. Requests run concurrently because each is an independent simulation;
 * a failed individual pool is skipped rather than failing the dashboard.
 */
export async function fetchAllPools(source: string): Promise<Pool[]> {
  const count = await fetchPoolCount(source);
  if (count === 0) return [];

  const results = await Promise.allSettled(
    Array.from({ length: count }, (_, id) => fetchPool(id, source)),
  );

  return results
    .filter((result): result is PromiseFulfilledResult<Pool> => result.status === 'fulfilled')
    .map((result) => result.value);
}

export async function fetchMembers(poolId: number, source: string): Promise<string[]> {
  return simulate<string[]>(savings(), 'list_members', [u32Arg(poolId)], source);
}

export async function fetchMemberBalance(
  poolId: number,
  member: string,
  source: string,
): Promise<bigint> {
  const value = await simulate<bigint>(
    savings(),
    'member_balance',
    [u32Arg(poolId), addressArg(member)],
    source,
  );
  return BigInt(value);
}

export async function fetchTreasuryBalance(poolId: number, source: string): Promise<bigint> {
  const value = await simulate<bigint>(treasury(), 'balance', [u32Arg(poolId)], source);
  return BigInt(value);
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

export interface SubmitResult {
  hash: string;
  returnValue: unknown;
}

/**
 * Build → simulate → sign → submit → confirm.
 *
 * `prepareTransaction` simulates and assembles in one step and returns a
 * `Transaction`. (The lower-level `rpc.assembleTransaction` returns a
 * `TransactionBuilder` and needs an extra `.build()`.)
 */
export async function invoke(
  contract: Contract,
  method: string,
  args: xdr.ScVal[],
  address: string,
): Promise<SubmitResult> {
  let account;
  try {
    account = await server.getAccount(address);
  } catch (error) {
    throw new ContractError(
      error instanceof Error ? error.message : 'Account could not be loaded.',
      'network',
    );
  }

  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(180)
    .build();

  let prepared;
  try {
    // Simulation is where contract-level rejections surface — insufficient
    // balance, not a member, unauthorized — before anything is signed.
    prepared = await server.prepareTransaction(built);
  } catch (error) {
    throw new ContractError(
      error instanceof Error ? error.message : 'Simulation failed.',
      'contract',
    );
  }

  const signedXdr = await signTransaction(prepared.toXDR(), address);
  const signed = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

  const sent = await server.sendTransaction(signed);
  if (sent.status !== 'PENDING') {
    throw new ContractError(
      `Transaction was not accepted (${sent.status}).`,
      sent.status === 'ERROR' ? 'contract' : 'network',
    );
  }

  log.info(`${method} submitted`, sent.hash);

  const result = await server.pollTransaction(sent.hash, {
    attempts: 30,
    sleepStrategy: rpc.LinearSleepStrategy,
  });

  if (result.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    throw new ContractError('Transaction confirmation timed out.', 'network');
  }
  if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
    throw new ContractError('The transaction failed on-chain.', 'contract');
  }

  return {
    hash: sent.hash,
    returnValue: result.returnValue ? scValToNative(result.returnValue) : null,
  };
}

export function createPool(
  address: string,
  name: string,
  contributionAmount: bigint,
  cycleSeconds: bigint,
  maxMembers: number,
): Promise<SubmitResult> {
  return invoke(
    savings(),
    'create_pool',
    [
      addressArg(address),
      stringArg(name),
      i128Arg(contributionAmount),
      u64Arg(cycleSeconds),
      u32Arg(maxMembers),
    ],
    address,
  );
}

export function joinPool(address: string, poolId: number): Promise<SubmitResult> {
  return invoke(savings(), 'join_pool', [u32Arg(poolId), addressArg(address)], address);
}

export function contribute(
  address: string,
  poolId: number,
  amount: bigint,
): Promise<SubmitResult> {
  return invoke(
    savings(),
    'contribute',
    [u32Arg(poolId), addressArg(address), i128Arg(amount)],
    address,
  );
}

export function withdraw(
  address: string,
  poolId: number,
  amount: bigint,
): Promise<SubmitResult> {
  return invoke(
    savings(),
    'withdraw',
    [u32Arg(poolId), addressArg(address), i128Arg(amount)],
    address,
  );
}
