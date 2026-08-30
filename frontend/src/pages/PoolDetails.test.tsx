import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PoolDetails from './PoolDetails';
import { resetAppStore, useAppStore } from '../store/useAppStore';
import { ALICE, BOB, makePool } from '../test/factories';

vi.mock('../services/contractService', async () => {
  const actual = await vi.importActual<typeof import('../services/contractService')>(
    '../services/contractService',
  );
  return {
    ...actual,
    fetchPool: vi.fn(),
    fetchMembers: vi.fn(),
    fetchMemberBalance: vi.fn(),
    fetchTreasuryBalance: vi.fn(),
    joinPool: vi.fn(),
    contribute: vi.fn(),
    withdraw: vi.fn(),
  };
});

vi.mock('../services/eventService', () => ({
  fetchEvents: vi.fn().mockResolvedValue({ events: [], cursor: null, latestLedger: 1 }),
  resolveStartLedger: vi.fn().mockResolvedValue(1),
}));

vi.mock('../services/walletService', () => ({
  signTransaction: vi.fn(),
  isUserRejection: vi.fn(() => false),
  readWalletError: vi.fn(() => ({ code: -1, message: 'error' })),
}));

import {
  fetchMemberBalance,
  fetchMembers,
  fetchPool,
  fetchTreasuryBalance,
  joinPool,
} from '../services/contractService';

function renderDetails(poolId = '0') {
  return render(
    <MemoryRouter initialEntries={[`/pools/${poolId}`]}>
      <Routes>
        <Route path="/pools/:poolId" element={<PoolDetails />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PoolDetails', () => {
  beforeEach(() => {
    resetAppStore();
    useAppStore.setState({ address: ALICE });
    vi.mocked(fetchPool).mockResolvedValue(makePool());
    vi.mocked(fetchMembers).mockResolvedValue([ALICE, BOB]);
    vi.mocked(fetchMemberBalance).mockResolvedValue(2_000_000_000n);
    vi.mocked(fetchTreasuryBalance).mockResolvedValue(5_000_000_000n);
  });

  it('renders pool details', async () => {
    renderDetails();

    expect(await screen.findByText('Monthly Circle')).toBeInTheDocument();
    expect(screen.getByText(/Pool #0/)).toBeInTheDocument();
    expect(screen.getByText('30 days')).toBeInTheDocument();
  });

  it('shows both the savings-side and treasury-side balances', async () => {
    renderDetails();

    // Both contracts report 500 XLM; showing them separately makes any
    // divergence between the two visible.
    expect(await screen.findAllByText('500 XLM')).toHaveLength(2);
  });

  it('lists members and marks the connected account', async () => {
    renderDetails();

    expect(await screen.findByText('You')).toBeInTheDocument();
    expect(screen.getByText('Creator')).toBeInTheDocument();
    expect(screen.getByText(/Members \(2 \/ 5\)/)).toBeInTheDocument();
  });

  it('offers contribute and withdraw to a member', async () => {
    renderDetails();

    expect(await screen.findByRole('button', { name: /contribute/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /withdraw/i })).toBeInTheDocument();
  });

  it('offers joining to a non-member', async () => {
    vi.mocked(fetchMembers).mockResolvedValue([BOB]);
    renderDetails();

    const join = await screen.findByRole('button', { name: /join pool/i });
    expect(join).toBeEnabled();

    await userEvent.click(join);
    expect(joinPool).toHaveBeenCalledWith(ALICE, 0);
  });

  it('prevents joining a full pool', async () => {
    vi.mocked(fetchPool).mockResolvedValue(makePool({ memberCount: 5, maxMembers: 5 }));
    vi.mocked(fetchMembers).mockResolvedValue([BOB]);

    renderDetails();

    expect(await screen.findByText('This pool has reached its member limit.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /join pool/i })).toBeDisabled();
  });

  it('prompts for a wallet when none is connected', async () => {
    useAppStore.setState({ address: null });
    renderDetails();

    expect(await screen.findByText('Please connect your wallet.')).toBeInTheDocument();
  });

  it('reports a pool that cannot be loaded', async () => {
    vi.mocked(fetchPool).mockRejectedValue(new Error('fetch failed'));
    renderDetails();

    expect(
      await screen.findByText('Unable to connect to Stellar network.'),
    ).toBeInTheDocument();
  });

  it('still renders when the treasury balance is unavailable', async () => {
    // A supplementary read failing must not blank the page.
    vi.mocked(fetchTreasuryBalance).mockRejectedValue(new Error('unavailable'));
    renderDetails();

    expect(await screen.findByText('Monthly Circle')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('links back to the dashboard', async () => {
    renderDetails();
    expect(await screen.findByRole('link', { name: /back to dashboard/i })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
