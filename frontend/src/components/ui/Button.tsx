import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-beam-500 text-white hover:bg-beam-400',
  secondary:
    'border border-ink-600 text-mist-200 hover:border-beam-500 hover:text-beam-300',
  ghost: 'text-mist-300 hover:bg-ink-800 hover:text-mist-200',
  danger: 'border border-ember-400/40 text-ember-400 hover:bg-ember-400/10',
};

const SIZES: Record<Size, string> = {
  // Touch targets stay at least 36px tall so the UI is usable on a phone.
  sm: 'px-3 py-2 text-xs',
  md: 'px-4 py-2.5 text-sm',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {loading ? '…' : children}
    </button>
  );
}
