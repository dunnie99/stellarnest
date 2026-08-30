import { describe, expect, it } from 'vitest';
import {
  formatCycle,
  formatUnixTime,
  formatXlm,
  relativeTime,
  stroopsToXlm,
  truncateMiddle,
  xlmToStroops,
} from './format';

describe('stroopsToXlm', () => {
  it('converts whole XLM amounts', () => {
    expect(stroopsToXlm(10_000_000n)).toBe('1');
    expect(stroopsToXlm(1_000_000_000n)).toBe('100');
  });

  it('keeps fractional precision without trailing zeros', () => {
    expect(stroopsToXlm(15_000_000n)).toBe('1.5');
    expect(stroopsToXlm(1n)).toBe('0.0000001');
  });

  it('groups thousands for readability', () => {
    // 123,450,000,000 stroops = 12,345 XLM
    expect(stroopsToXlm(123_450_000_000n)).toBe('12,345');
  });

  it('handles zero and negative balances', () => {
    expect(stroopsToXlm(0n)).toBe('0');
    expect(stroopsToXlm(-10_000_000n)).toBe('-1');
  });

  it('preserves precision beyond Number.MAX_SAFE_INTEGER', () => {
    // 9007199254740993 is MAX_SAFE_INTEGER + 2 — a float round-trip collapses
    // it to ...992. Carrying it as bigint must render it exactly.
    const huge = 9_007_199_254_740_993_0000000n;
    expect(stroopsToXlm(huge)).toBe('9,007,199,254,740,993');
    // Demonstrates the loss being avoided: the bigint is exact, and forcing it
    // through Number silently rounds the final digit down.
    expect(String(Number(9_007_199_254_740_993n))).toBe('9007199254740992');
  });
});

describe('xlmToStroops', () => {
  it('parses whole and fractional amounts', () => {
    expect(xlmToStroops('1')).toBe(10_000_000n);
    expect(xlmToStroops('1.5')).toBe(15_000_000n);
    expect(xlmToStroops('0.0000001')).toBe(1n);
  });

  it('rejects malformed input', () => {
    expect(xlmToStroops('abc')).toBeNull();
    expect(xlmToStroops('')).toBeNull();
    expect(xlmToStroops('.')).toBeNull();
    expect(xlmToStroops('1.2.3')).toBeNull();
  });

  it('rejects more precision than Stellar supports', () => {
    expect(xlmToStroops('1.12345678')).toBeNull();
  });

  it('round-trips through stroopsToXlm', () => {
    for (const value of ['1', '100', '0.5', '1234.5678']) {
      const stroops = xlmToStroops(value);
      expect(stroops).not.toBeNull();
      expect(xlmToStroops(stroopsToXlm(stroops!))).toBe(stroops);
    }
  });
});

describe('formatXlm', () => {
  it('appends the asset code', () => {
    expect(formatXlm(1_000_000_000n)).toBe('100 XLM');
  });
});

describe('truncateMiddle', () => {
  it('shortens long values around an ellipsis', () => {
    expect(truncateMiddle('GAIH3ULLFQ4DGSECF2AR', 4, 4)).toBe('GAIH...F2AR');
  });

  it('leaves short values untouched', () => {
    expect(truncateMiddle('GAIH', 4, 4)).toBe('GAIH');
    expect(truncateMiddle('')).toBe('');
  });
});

describe('formatUnixTime', () => {
  it('renders UTC in the documented format', () => {
    expect(formatUnixTime(1_700_000_000n)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
  });

  it('reports unparseable values rather than throwing', () => {
    expect(formatUnixTime(Number.NaN)).toBe('Unknown');
  });
});

describe('formatCycle', () => {
  it('describes cycles in the largest sensible unit', () => {
    expect(formatCycle(2_592_000)).toBe('30 days');
    expect(formatCycle(86_400)).toBe('1 day');
    expect(formatCycle(3_600)).toBe('1 hour');
    expect(formatCycle(30)).toBe('30 seconds');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-08-17T12:00:00Z').getTime();

  it('scales the unit with elapsed time', () => {
    expect(relativeTime('2026-08-17T11:59:30Z', now)).toBe('30s ago');
    expect(relativeTime('2026-08-17T11:30:00Z', now)).toBe('30m ago');
    expect(relativeTime('2026-08-17T06:00:00Z', now)).toBe('6h ago');
    expect(relativeTime('2026-08-15T12:00:00Z', now)).toBe('2d ago');
  });

  it('returns empty for an unparseable timestamp', () => {
    expect(relativeTime('not-a-date', now)).toBe('');
  });
});
