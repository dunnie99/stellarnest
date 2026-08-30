import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WalletBar from './WalletBar';
import { ALICE } from '../test/factories';

describe('WalletBar', () => {
  it('offers connection when no wallet is attached', async () => {
    const onConnect = vi.fn();
    render(
      <WalletBar
        address={null}
        connecting={false}
        error={null}
        onConnect={onConnect}
        onDisconnect={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /connect wallet/i }));
    expect(onConnect).toHaveBeenCalledOnce();
  });

  it('shows the connecting message while a connection is in flight', () => {
    render(
      <WalletBar
        address={null}
        connecting
        error={null}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
      />,
    );

    expect(screen.getByText('Connecting Wallet...')).toBeInTheDocument();
  });

  it('shows a truncated address and allows disconnecting', async () => {
    const onDisconnect = vi.fn();
    render(
      <WalletBar
        address={ALICE}
        connecting={false}
        error={null}
        onConnect={vi.fn()}
        onDisconnect={onDisconnect}
      />,
    );

    // The full address is kept in the title so it stays copyable.
    expect(screen.getByTitle(ALICE)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /disconnect/i }));
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it('reports a connection error', () => {
    render(
      <WalletBar
        address={null}
        connecting={false}
        error="extension unavailable"
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('extension unavailable');
  });
});
