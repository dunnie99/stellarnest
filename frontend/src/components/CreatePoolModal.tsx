import { useState } from 'react';
import Modal from './ui/Modal';
import Input from './ui/Input';
import Button from './ui/Button';
import { ErrorMessage } from './ui/StatusMessage';
import { xlmToStroops } from '../utils/format';
import type { AppError } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (
    name: string,
    amount: bigint,
    cycleSeconds: bigint,
    maxMembers: number,
  ) => Promise<boolean>;
  busy: boolean;
  error: AppError | null;
}

interface Errors {
  name?: string;
  amount?: string;
  members?: string;
}

/** Mirrors the contract's own `InvalidPoolConfig` bounds. */
const MAX_NAME_LENGTH = 64;
const MAX_MEMBERS_LIMIT = 100;

export default function CreatePoolModal({ open, onClose, onCreate, busy, error }: Props) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [cycleDays, setCycleDays] = useState('30');
  const [maxMembers, setMaxMembers] = useState('10');
  const [errors, setErrors] = useState<Errors>({});

  function validate(): { valid: boolean; amountStroops: bigint; members: number } {
    const next: Errors = {};

    const trimmedName = name.trim();
    if (trimmedName.length === 0) next.name = 'A pool name is required.';
    else if (trimmedName.length > MAX_NAME_LENGTH)
      next.name = `Keep the name under ${MAX_NAME_LENGTH} characters.`;

    const amountStroops = xlmToStroops(amount);
    if (amountStroops === null || amountStroops <= 0n) {
      next.amount = 'Enter a contribution greater than zero.';
    }

    const members = Number(maxMembers);
    if (!Number.isInteger(members) || members < 1 || members > MAX_MEMBERS_LIMIT) {
      next.members = `Enter between 1 and ${MAX_MEMBERS_LIMIT} members.`;
    }

    setErrors(next);
    return {
      valid: Object.keys(next).length === 0,
      amountStroops: amountStroops ?? 0n,
      members,
    };
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const { valid, amountStroops, members } = validate();
    if (!valid) return;

    const cycleSeconds = BigInt(Math.max(1, Number(cycleDays))) * 86_400n;
    const created = await onCreate(name.trim(), amountStroops, cycleSeconds, members);

    if (created) {
      setName('');
      setAmount('');
      onClose();
    }
  }

  return (
    <Modal open={open} title="Create a savings pool" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Pool name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Monthly Circle"
          error={errors.name}
        />
        <Input
          label="Contribution per cycle (XLM)"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="100"
          inputMode="decimal"
          error={errors.amount}
        />
        <Input
          label="Cycle length (days)"
          value={cycleDays}
          onChange={(event) => setCycleDays(event.target.value)}
          inputMode="numeric"
        />
        <Input
          label="Maximum members"
          value={maxMembers}
          onChange={(event) => setMaxMembers(event.target.value)}
          inputMode="numeric"
          error={errors.members}
        />

        {error ? <ErrorMessage error={error} /> : null}

        <div className="flex gap-2">
          <Button type="submit" loading={busy} className="flex-1">
            Create Pool
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
