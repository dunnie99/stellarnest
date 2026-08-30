import { STROOPS_PER_XLM } from '../config';

export function truncateMiddle(value: string, lead = 6, tail = 6): string {
  if (!value) return '';
  if (value.length <= lead + tail) return value;
  return `${value.slice(0, lead)}...${value.slice(-tail)}`;
}

/**
 * Stroops → a human XLM string.
 *
 * Amounts are `bigint` end to end because i128 values exceed `Number.MAX_SAFE_INTEGER`;
 * converting to a float for display would silently lose precision on large pools.
 */
export function stroopsToXlm(stroops: bigint, maxDecimals = 7): string {
  const divisor = BigInt(STROOPS_PER_XLM);
  const negative = stroops < 0n;
  const absolute = negative ? -stroops : stroops;

  const whole = absolute / divisor;
  const fraction = absolute % divisor;

  let text = whole.toLocaleString('en-US');
  if (fraction > 0n) {
    const decimals = fraction
      .toString()
      .padStart(7, '0')
      .slice(0, maxDecimals)
      .replace(/0+$/, '');
    if (decimals.length > 0) text += `.${decimals}`;
  }

  return negative ? `-${text}` : text;
}

/**
 * Human XLM input → stroops. Returns null when the input is not usable.
 *
 * Thousands separators are stripped first, so a value copied out of the UI
 * (which renders them) parses back cleanly, as does a pasted "1,234.5".
 */
export function xlmToStroops(value: string): bigint | null {
  const trimmed = value.trim().replace(/,/g, '');
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed.length === 0 || trimmed === '.') {
    return null;
  }

  const [whole = '0', fraction = ''] = trimmed.split('.');
  if (fraction.length > 7) return null;

  const padded = fraction.padEnd(7, '0');
  const stroops = BigInt(whole || '0') * BigInt(STROOPS_PER_XLM) + BigInt(padded || '0');
  return stroops;
}

export function formatXlm(stroops: bigint): string {
  return `${stroopsToXlm(stroops)} XLM`;
}

/** Unix seconds → `2026-08-17 14:22 UTC`. */
export function formatUnixTime(seconds: bigint | number): string {
  const value = typeof seconds === 'bigint' ? Number(seconds) : seconds;
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`
  );
}

export function relativeTime(iso: string, now: number = Date.now()): string {
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return '';
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** `2592000` seconds → `30 days`. */
export function formatCycle(seconds: bigint | number): string {
  const value = typeof seconds === 'bigint' ? Number(seconds) : seconds;
  const days = Math.round(value / 86_400);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'}`;
  const hours = Math.round(value / 3_600);
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${value} seconds`;
}
