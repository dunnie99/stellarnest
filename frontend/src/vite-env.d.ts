/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SAVINGS_CONTRACT_ID?: string;
  readonly VITE_TREASURY_CONTRACT_ID?: string;
  readonly VITE_SOROBAN_RPC_URL?: string;
  readonly VITE_NETWORK_PASSPHRASE?: string;
  readonly VITE_EVENT_POLL_MS?: string;
  readonly VITE_LOG_LEVEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
