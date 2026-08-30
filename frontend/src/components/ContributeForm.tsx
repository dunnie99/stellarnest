import { useState } from 'react';
import Input from './ui/Input';
import Button from './ui/Button';
import { ErrorMessage, LoadingMessage } from './ui/StatusMessage';
import { formatXlm, stroopsToXlm, xlmToStroops } from '../utils/format';
import type { AppError } from '../types';

interface Props {
  /** The connected member's balance in this pool, in stroops. */
  myBalance: bigint;
  suggestedAmount: bigint;
  pending: string | null;
  error: AppError | null;
  lastTxHash: string | null;
  onContribute: (amount: bigint) => Promise<boolean>;
  onWithdraw: (amount: bigint) => Promise<boolean>;
}

export default function ContributeForm({
  myBalance,
  suggestedAmount,
  pending,
  error,
  lastTxHash,
  onContribute,
  onWithdraw,
}: Props) {
  const [amount, setAmount] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();

  function parse(): bigint | null {
    const stroops = xlmToStroops(amount);
    if (stroops === null || stroops <= 0n) {
      setFieldError('Enter an amount greater than zero.');
      return null;
    }
    setFieldError(undefined);
    return stroops;
  }

  async function submit(event: React.FormEvent, action: 'contribute' | 'withdraw') {
    event.preventDefault();
    const stroops = parse();
    if (stroops === null) return;

    // Checking locally first turns a guaranteed on-chain rejection into
    // immediate feedback, without removing the contract's own enforcement.
    if (action === 'withdraw' && stroops > myBalance) {
      setFieldError('Insufficient balance.');
      return;
    }

    const ok =
      action === 'contribute' ? await onContribute(stroops) : await onWithdraw(stroops);
    if (ok) setAmount('');
  }

  return (
    <form onSubmit={(event) => submit(event, 'contribute')} className="space-y-4">
      <Input
        label="Amount (XLM)"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        placeholder={stroopsToXlm(suggestedAmount)}
        inputMode="decimal"
        error={fieldError}
        hint={`Your balance in this pool: ${formatXlm(myBalance)}`}
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" loading={pending !== null} className="flex-1">
          Contribute
        </Button>
        <Button
          type="button"
          variant="secondary"
          loading={pending !== null}
          onClick={(event) => submit(event, 'withdraw')}
          className="flex-1"
        >
          Withdraw
        </Button>
      </div>

      {pending ? <LoadingMessage message={pending} /> : null}
      {error ? <ErrorMessage error={error} /> : null}

      {lastTxHash && !pending && !error ? (
        <p className="break-hash text-[11px] text-jade-400">
          Confirmed · <code className="font-mono">{lastTxHash}</code>
        </p>
      ) : null}
    </form>
  );
}
