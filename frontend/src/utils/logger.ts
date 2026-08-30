import { LOG_LEVEL } from '../config';

/**
 * Minimal levelled logger.
 *
 * Routing every diagnostic through one module means verbosity is controlled by
 * `VITE_LOG_LEVEL` rather than by scattered `console.log` calls, and gives a
 * single place to forward errors to a reporting service later.
 */

const LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const;
export type LogLevel = (typeof LEVELS)[number];

function threshold(): number {
  const index = LEVELS.indexOf(LOG_LEVEL as LogLevel);
  return index === -1 ? LEVELS.indexOf('info') : index;
}

function enabled(level: LogLevel): boolean {
  return LEVELS.indexOf(level) >= threshold();
}

function emit(level: Exclude<LogLevel, 'silent'>, scope: string, ...args: unknown[]) {
  if (!enabled(level)) return;
  const prefix = `[stellarnest:${scope}]`;
  if (level === 'error') console.error(prefix, ...args);
  else if (level === 'warn') console.warn(prefix, ...args);
  else if (level === 'info') console.info(prefix, ...args);
  else console.debug(prefix, ...args);
}

export function createLogger(scope: string) {
  return {
    debug: (...args: unknown[]) => emit('debug', scope, ...args),
    info: (...args: unknown[]) => emit('info', scope, ...args),
    warn: (...args: unknown[]) => emit('warn', scope, ...args),
    error: (...args: unknown[]) => emit('error', scope, ...args),
  };
}
