import type { InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export default function Input({ label, error, hint, id, className = '', ...rest }: Props) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <div>
      <label
        htmlFor={inputId}
        className="text-[11px] font-semibold uppercase tracking-wider text-mist-400"
      >
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={`mt-1.5 w-full rounded-lg border bg-ink-850 px-3 py-2.5 text-sm text-mist-200 outline-none transition placeholder:text-mist-400/60 focus:border-beam-500 ${
          error ? 'border-ember-400/60' : 'border-ink-600'
        } ${className}`}
      />
      {error ? (
        <p id={`${inputId}-error`} className="mt-1 text-[11px] text-ember-400">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-mist-400">{hint}</p>
      ) : null}
    </div>
  );
}
