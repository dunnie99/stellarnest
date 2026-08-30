import { IS_CONFIGURED, SAVINGS_CONTRACT_ID, TREASURY_CONTRACT_ID } from '../config';
import { truncateMiddle } from '../utils/format';

/**
 * Explains what to run when contracts are not yet deployed.
 *
 * The app is fully navigable without them — routing, layout and forms all work —
 * so this guides setup instead of letting reads fail with an opaque error.
 */
export default function SetupBanner() {
  if (IS_CONFIGURED) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-ink-700 bg-ink-900 px-4 py-2.5 text-[11px] text-mist-400">
        <span>
          Savings{' '}
          <code className="font-mono text-beam-300">
            {truncateMiddle(SAVINGS_CONTRACT_ID, 8, 6)}
          </code>
        </span>
        <span>
          Treasury{' '}
          <code className="font-mono text-beam-300">
            {truncateMiddle(TREASURY_CONTRACT_ID, 8, 6)}
          </code>
        </span>
        <span className="ml-auto text-jade-400">Testnet</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-glow/40 bg-amber-glow/5 px-5 py-4">
      <p className="text-sm font-medium text-amber-glow">Contracts are not configured.</p>
      <p className="mt-1.5 text-xs leading-relaxed text-mist-300">
        Deploy both contracts to the Testnet and the app will pick them up:
      </p>
      <pre className="mt-2.5 overflow-x-auto rounded-lg bg-ink-950 px-3 py-2 font-mono text-[11px] text-mist-300">
        ./scripts/deploy/deploy.sh
      </pre>
      <p className="mt-2 text-[11px] text-mist-400">
        The script writes <code className="font-mono">VITE_SAVINGS_CONTRACT_ID</code> and{' '}
        <code className="font-mono">VITE_TREASURY_CONTRACT_ID</code> into{' '}
        <code className="font-mono">frontend/.env</code>. Restart the dev server afterwards.
      </p>
    </div>
  );
}
