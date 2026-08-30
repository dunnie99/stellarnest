import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import { resetAppStore, useAppStore } from '../store/useAppStore';
import { ALICE, makePool } from '../test/factories';

// Stub the network boundary. The store and components under test are real.
vi.mock('../services/contractService', () => ({
  fetchAllPools: vi.fn(),
  createPool: vi.fn(),
  joinPool: vi.fn(),
  contribute: vi.fn(),
  withdraw: vi.fn(),
  ContractError: class ContractError extends Error {},
}));

vi.mock('../services/eventService', () => ({
  fetchEvents: vi.fn().mockResolvedValue({ events: [], cursor: null, latestLedger: 1 }),
  resolveStartLedger: vi.fn().mockResolvedValue(1),
}));

vi.mock('../services/walletService', () => ({
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  getConnectedAddress: vi.fn().mockResolvedValue(null),
  signTransaction: vi.fn(),
  isUserRejection: vi.fn(() => false),
  readWalletError: vi.fn(() => ({ code: -1, message: 'error' })),
}));

import { fetchAllPools } from '../services/contractService';

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

describe('Dashboard', () => {
  beforeEach(() => {
    resetAppStore();
    vi.mocked(fetchAllPools).mockResolvedValue([]);
  });

  it('prompts for a wallet before any account is connected', async () => {
    renderDashboard();
    expect(await screen.findByText('Please connect your wallet.')).toBeInTheDocument();
  });

  it('renders pool cards once pools load', async () => {
    useAppStore.setState({ address: ALICE });
    vi.mocked(fetchAllPools).mockResolvedValue([
      makePool({ id: 0, name: 'Monthly Circle' }),
      makePool({ id: 1, name: 'Holiday Fund', totalContributed: 2_000_000_000n }),
    ]);

    renderDashboard();

    expect(await screen.findByText('Monthly Circle')).toBeInTheDocument();
    expect(screen.getByText('Holiday Fund')).toBeInTheDocument();
  });

  it('summarises totals across pools', async () => {
    useAppStore.setState({ address: ALICE });
    vi.mocked(fetchAllPools).mockResolvedValue([
      makePool({ id: 0, totalContributed: 5_000_000_000n, memberCount: 2 }),
      makePool({ id: 1, totalContributed: 3_000_000_000n, memberCount: 3 }),
    ]);

    renderDashboard();

    // 500 + 300 XLM saved, 5 memberships, across 2 pools.
    expect(await screen.findByText('800 XLM')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows pool metadata on each card', async () => {
    useAppStore.setState({ address: ALICE });
    vi.mocked(fetchAllPools).mockResolvedValue([
      makePool({ memberCount: 2, maxMembers: 5, contributionAmount: 1_000_000_000n }),
    ]);

    renderDashboard();

    expect(await screen.findByText('2 / 5')).toBeInTheDocument();
    expect(screen.getByText('30 days')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('marks a pool at capacity as full', async () => {
    useAppStore.setState({ address: ALICE });
    vi.mocked(fetchAllPools).mockResolvedValue([
      makePool({ memberCount: 5, maxMembers: 5 }),
    ]);

    renderDashboard();
    expect(await screen.findByText('Full')).toBeInTheDocument();
  });

  it('shows an empty state when no pools exist yet', async () => {
    useAppStore.setState({ address: ALICE });
    vi.mocked(fetchAllPools).mockResolvedValue([]);

    renderDashboard();

    expect(
      await screen.findByText('No savings pools yet. Create the first one.'),
    ).toBeInTheDocument();
  });

  it('surfaces a network failure with the documented message', async () => {
    useAppStore.setState({ address: ALICE });
    vi.mocked(fetchAllPools).mockRejectedValue(new Error('fetch failed'));

    renderDashboard();

    expect(
      await screen.findByText('Unable to connect to Stellar network.'),
    ).toBeInTheDocument();
  });

  it('disables pool creation until a wallet is connected', async () => {
    renderDashboard();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /create pool/i })).toBeDisabled(),
    );

    useAppStore.setState({ address: ALICE });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /create pool/i })).toBeEnabled(),
    );
  });

  it('links each pool card to its detail page', async () => {
    useAppStore.setState({ address: ALICE });
    vi.mocked(fetchAllPools).mockResolvedValue([makePool({ id: 7, name: 'Seven' })]);

    renderDashboard();

    const link = await screen.findByRole('link', { name: /Seven/ });
    expect(link).toHaveAttribute('href', '/pools/7');
  });
});
