import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContributeForm from './ContributeForm';
import { appError } from '../types';

function setup(overrides: Partial<React.ComponentProps<typeof ContributeForm>> = {}) {
  const onContribute = vi.fn().mockResolvedValue(true);
  const onWithdraw = vi.fn().mockResolvedValue(true);

  render(
    <ContributeForm
      myBalance={2_000_000_000n} // 200 XLM
      suggestedAmount={1_000_000_000n} // 100 XLM
      pending={null}
      error={null}
      lastTxHash={null}
      onContribute={onContribute}
      onWithdraw={onWithdraw}
      {...overrides}
    />,
  );

  return { onContribute, onWithdraw };
}

describe('ContributeForm', () => {
  it('submits a contribution converted to stroops', async () => {
    const user = userEvent.setup();
    const { onContribute } = setup();

    await user.type(screen.getByLabelText(/amount/i), '100');
    await user.click(screen.getByRole('button', { name: /contribute/i }));

    // 100 XLM must reach the contract as 1,000,000,000 stroops.
    expect(onContribute).toHaveBeenCalledWith(1_000_000_000n);
  });

  it('submits a withdrawal', async () => {
    const user = userEvent.setup();
    const { onWithdraw, onContribute } = setup();

    await user.type(screen.getByLabelText(/amount/i), '50');
    await user.click(screen.getByRole('button', { name: /withdraw/i }));

    expect(onWithdraw).toHaveBeenCalledWith(500_000_000n);
    expect(onContribute).not.toHaveBeenCalled();
  });

  it('clears the field after a successful submission', async () => {
    const user = userEvent.setup();
    setup();

    const field = screen.getByLabelText(/amount/i);
    await user.type(field, '100');
    await user.click(screen.getByRole('button', { name: /contribute/i }));

    expect(field).toHaveValue('');
  });

  it('keeps the entered value when submission fails', async () => {
    const user = userEvent.setup();
    setup({ onContribute: vi.fn().mockResolvedValue(false) });

    const field = screen.getByLabelText(/amount/i);
    await user.type(field, '100');
    await user.click(screen.getByRole('button', { name: /contribute/i }));

    // Re-typing an amount after a failure would be needless friction.
    expect(field).toHaveValue('100');
  });

  it('rejects a non-positive amount before calling the contract', async () => {
    const user = userEvent.setup();
    const { onContribute } = setup();

    await user.type(screen.getByLabelText(/amount/i), '0');
    await user.click(screen.getByRole('button', { name: /contribute/i }));

    expect(onContribute).not.toHaveBeenCalled();
    expect(screen.getByText('Enter an amount greater than zero.')).toBeInTheDocument();
  });

  it('rejects a malformed amount', async () => {
    const user = userEvent.setup();
    const { onContribute } = setup();

    await user.type(screen.getByLabelText(/amount/i), 'abc');
    await user.click(screen.getByRole('button', { name: /contribute/i }));

    expect(onContribute).not.toHaveBeenCalled();
  });

  it('blocks a withdrawal larger than the member balance', async () => {
    const user = userEvent.setup();
    const { onWithdraw } = setup({ myBalance: 1_000_000_000n }); // 100 XLM

    await user.type(screen.getByLabelText(/amount/i), '500');
    await user.click(screen.getByRole('button', { name: /withdraw/i }));

    // Caught locally so the user is not charged a fee for a guaranteed revert;
    // the contract still enforces it independently.
    expect(onWithdraw).not.toHaveBeenCalled();
    expect(screen.getByText('Insufficient balance.')).toBeInTheDocument();
  });

  it('shows the in-flight processing message', () => {
    setup({ pending: 'Processing Contribution...' });
    expect(screen.getByRole('status')).toHaveTextContent('Processing Contribution...');
  });

  it('shows a contract failure message', () => {
    setup({ error: appError('insufficient-balance') });
    expect(screen.getByRole('alert')).toHaveTextContent('Insufficient balance.');
  });

  it('shows the unauthorized message when the contract rejects the caller', () => {
    setup({ error: appError('unauthorized') });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not authorized to perform this action.',
    );
  });

  it('confirms with the transaction hash on success', () => {
    const hash = 'b'.repeat(64);
    setup({ lastTxHash: hash });
    expect(screen.getByText(hash)).toBeInTheDocument();
  });

  it('displays the member balance', () => {
    setup({ myBalance: 2_500_000_000n });
    expect(screen.getByText(/Your balance in this pool: 250 XLM/)).toBeInTheDocument();
  });
});
