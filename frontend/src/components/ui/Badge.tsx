import type { ReactNode } from 'react';

type Tone = 'neutral' | 'success' | 'info' | 'warning' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'bg-ink-700 text-mist-300',
  success: 'bg-jade-400/10 text-jade-400',
  info: 'bg-beam-500/10 text-beam-300',
  warning: 'bg-amber-glow/10 text-amber-glow',
  danger: 'bg-ember-400/10 text-ember-400',
};

export default function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
