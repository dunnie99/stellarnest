import type { AppError } from '../../types';

export function LoadingMessage({ message }: { message: string }) {
  return (
    <p role="status" aria-live="polite" className="text-xs text-mist-400 animate-pulse-fade">
      {message}
    </p>
  );
}

export function ErrorMessage({ error }: { error: AppError }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-ember-400/40 bg-ember-400/5 px-4 py-3"
    >
      <p className="text-sm text-ember-400">{error.message}</p>
      {error.detail ? (
        <p className="mt-1 break-hash text-[11px] leading-relaxed text-mist-400">
          {error.detail}
        </p>
      ) : null}
    </div>
  );
}

export function EmptyMessage({ children }: { children: string }) {
  return (
    <p className="rounded-lg border border-dashed border-ink-600 px-4 py-6 text-center text-xs text-mist-400">
      {children}
    </p>
  );
}
