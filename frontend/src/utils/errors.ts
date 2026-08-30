import { ContractError } from '../services/contractService';
import { isUserRejection, readWalletError } from '../services/walletService';
import { appError, type AppError } from '../types';

/**
 * Maps any thrown value onto the closed set of user-facing errors.
 *
 * Contract failures surface through simulation as opaque host error strings, so
 * the recognisable substrings are matched to the specific messages the spec
 * requires. Anything unrecognised falls through to the generic transaction
 * failure rather than being reported as something more specific than we know.
 */
export function toAppError(error: unknown): AppError {
  if (isUserRejection(error)) {
    return appError('user-rejected');
  }

  if (error instanceof ContractError) {
    if (error.kind === 'network') {
      return appError('network', error.message);
    }

    const message = error.message;

    // Contract error discriminants, by name as they appear in host diagnostics.
    if (/InsufficientBalance|InsufficientPoolBalance|#7\b|#5\b/.test(message)) {
      return appError('insufficient-balance', message);
    }
    if (/Unauthorized|NotMember|#8\b|#4\b/.test(message)) {
      return appError('unauthorized', message);
    }

    return appError('transaction-failed', message);
  }

  if (error instanceof Error) {
    if (/fetch failed|network|ECONNREFUSED|Failed to fetch/i.test(error.message)) {
      return appError('network', error.message);
    }
    return appError('transaction-failed', error.message);
  }

  // Wallet errors are plain objects, not Error instances.
  const wallet = readWalletError(error);
  return appError('transaction-failed', wallet.message);
}
