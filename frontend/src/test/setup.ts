import '@testing-library/jest-dom/vitest';
import { vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * The wallet kit reads `localStorage` at module load and is browser-extension
 * only, so it cannot be imported under jsdom at all. Mocking both entry points
 * globally means no individual test has to remember to do it.
 */
vi.mock('@creit.tech/stellar-wallets-kit/sdk', () => ({
  StellarWalletsKit: {
    init: vi.fn(),
    authModal: vi.fn(),
    getAddress: vi.fn(),
    disconnect: vi.fn(),
    signTransaction: vi.fn(),
  },
}));

vi.mock('@creit.tech/stellar-wallets-kit/modules/utils', () => ({
  defaultModules: () => [],
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
