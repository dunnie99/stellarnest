import { NETWORK_PASSPHRASE } from '../config';
import { createLogger } from '../utils/logger';

const log = createLogger('wallet');

/**
 * Wallet access, isolated behind one module.
 *
 * `@creit.tech/stellar-wallets-kit` 2.5.0 reads `localStorage` at module load,
 * so it cannot be statically imported anywhere that also has to run under jsdom
 * or Node. Every entry point below imports it dynamically, and this module is
 * the single boundary tests mock.
 *
 * 2.5.0 is also a breaking rewrite to a static class — `new StellarWalletsKit({...})`,
 * `allowAllModules()` and `openModal()` no longer exist.
 */

let initialised = false;

async function loadKit() {
  const [{ StellarWalletsKit }, { defaultModules }] = await Promise.all([
    import('@creit.tech/stellar-wallets-kit/sdk'),
    import('@creit.tech/stellar-wallets-kit/modules/utils'),
  ]);

  if (!initialised) {
    StellarWalletsKit.init({
      modules: defaultModules(),
      network: NETWORK_PASSPHRASE as never,
    });
    initialised = true;
    log.debug('wallet kit initialised');
  }

  return StellarWalletsKit;
}

export async function connectWallet(): Promise<string> {
  const kit = await loadKit();
  const { address } = await kit.authModal();
  log.info('wallet connected', address);
  return address;
}

export async function disconnectWallet(): Promise<void> {
  const kit = await loadKit();
  await kit.disconnect();
  log.info('wallet disconnected');
}

export async function getConnectedAddress(): Promise<string | null> {
  try {
    const kit = await loadKit();
    const { address } = await kit.getAddress();
    return address || null;
  } catch {
    return null;
  }
}

export async function signTransaction(xdr: string, address: string): Promise<string> {
  const kit = await loadKit();
  const { signedTxXdr } = await kit.signTransaction(xdr, {
    networkPassphrase: NETWORK_PASSPHRASE,
    address,
  });
  return signedTxXdr;
}

/**
 * Wallet errors are plain objects (`{ code, message }`), not `Error` instances,
 * so `instanceof Error` is false and `.message` must be read defensively.
 */
export function readWalletError(error: unknown): { code: number; message: string } {
  if (error && typeof error === 'object') {
    const candidate = error as { code?: unknown; message?: unknown };
    return {
      code: typeof candidate.code === 'number' ? candidate.code : -1,
      message:
        typeof candidate.message === 'string' && candidate.message.length > 0
          ? candidate.message
          : 'Unhandled error from the wallet',
    };
  }
  return { code: -1, message: String(error) };
}

/**
 * Rejection codes are injected by each wallet extension at runtime and differ
 * per wallet, so message matching is the portable detection.
 */
export function isUserRejection(error: unknown): boolean {
  return /declin|reject|denied|cancel|user closed/i.test(readWalletError(error).message);
}
