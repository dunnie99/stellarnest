import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from './logger';

/**
 * `.env.test` sets `VITE_LOG_LEVEL=silent`, so nothing should reach the console
 * during a test run. That is the behaviour worth pinning: a noisy logger buries
 * real failures in CI output.
 */
describe('createLogger', () => {
  afterEach(() => vi.restoreAllMocks());

  it('suppresses output at the silent level', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const log = createLogger('test');
    log.debug('a');
    log.info('b');
    log.warn('c');
    log.error('d');

    expect(debug).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('exposes the full logging surface', () => {
    const log = createLogger('scope');
    for (const method of ['debug', 'info', 'warn', 'error'] as const) {
      expect(typeof log[method]).toBe('function');
    }
  });
});
