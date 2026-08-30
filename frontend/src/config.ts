import { StrKey } from '@stellar/stellar-sdk';

/**
 * Environment configuration.
 *
 * Vite injects `import.meta.env` at build time; the fallback keeps these modules
 * importable from plain Node, which is what lets tests and scripts load the real
 * service code rather than a duplicate of it.
 */
const env: Partial<ImportMetaEnv> =
  (import.meta as ImportMeta & { env?: ImportMetaEnv }).env ??
  (globalThis as { process?: { env?: Partial<ImportMetaEnv> } }).process?.env ??
  {};

export const SAVINGS_CONTRACT_ID = (env.VITE_SAVINGS_CONTRACT_ID ?? '').trim();
export const TREASURY_CONTRACT_ID = (env.VITE_TREASURY_CONTRACT_ID ?? '').trim();

export const SOROBAN_RPC_URL =
  env.VITE_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';

export const NETWORK_PASSPHRASE =
  env.VITE_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015';

export const EVENT_POLL_MS = Number(env.VITE_EVENT_POLL_MS ?? 5000);

export const LOG_LEVEL = env.VITE_LOG_LEVEL ?? 'info';

/** The app renders a guided setup state instead of failing when unconfigured. */
export const IS_CONFIGURED =
  StrKey.isValidContract(SAVINGS_CONTRACT_ID) &&
  StrKey.isValidContract(TREASURY_CONTRACT_ID);

/** 1 XLM = 10,000,000 stroops. */
export const STROOPS_PER_XLM = 10_000_000;
