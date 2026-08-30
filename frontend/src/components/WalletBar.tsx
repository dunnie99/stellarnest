import Button from './ui/Button';
import { truncateMiddle } from '../utils/format';
import { LOADING_MESSAGE } from '../types';

interface Props {
  address: string | null;
  connecting: boolean;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
}

export default function WalletBar({
  address,
  connecting,
  error,
  onConnect,
  onDisconnect,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {connecting ? (
        <span className="text-[11px] text-mist-400 animate-pulse-fade">
          {LOADING_MESSAGE.wallet}
        </span>
      ) : null}

      {address ? (
        <>
          <code
            title={address}
            className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-1.5 font-mono text-xs text-beam-300"
          >
            {truncateMiddle(address, 6, 6)}
          </code>
          <Button variant="secondary" size="sm" onClick={onDisconnect}>
            Disconnect
          </Button>
        </>
      ) : (
        <Button size="sm" onClick={onConnect} loading={connecting}>
          Connect Wallet
        </Button>
      )}

      {error ? (
        <p role="alert" className="w-full text-right text-[11px] text-ember-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
