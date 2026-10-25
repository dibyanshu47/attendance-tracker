// Map errors (including the store's typed errors) to user-facing messages.

import { StoreAuthError, StoreConflictError } from '../store';

export function describeError(error: unknown): string {
  if (error instanceof StoreAuthError) {
    return 'Your Google Drive session expired. Log out and sign in again to reconnect.';
  }
  if (error instanceof StoreConflictError) {
    return 'This was just changed somewhere else. Reload and try again.';
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

/** True when the error means the Drive session is unrecoverable (needs re-auth). */
export function isAuthError(error: unknown): boolean {
  return error instanceof StoreAuthError;
}
