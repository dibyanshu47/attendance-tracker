// The store error contract (docs/architecture.md §10). These are the only
// store-specific error types that cross the AttendanceStore interface.

/**
 * Thrown when a month file changed underneath a write — HTTP 412 from Drive's
 * `If-Match` optimistic-concurrency check (§7). The caller should re-read the
 * bucket, re-apply its change, and retry the write.
 */
export class StoreConflictError extends Error {
  constructor(message = 'Attendance file changed during the write; re-read the month and retry.') {
    super(message);
    this.name = 'StoreConflictError';
  }
}

/**
 * Thrown only when a silent access-token re-grant fails — an unrecoverable
 * HTTP 401. A recoverable 401 is handled internally by one silent
 * `requestAccessToken({ prompt: '' })` + retry; only a *failed* re-grant
 * surfaces here, and the caller must trigger interactive re-auth.
 */
export class StoreAuthError extends Error {
  constructor(message = 'Drive authorization failed; interactive re-authentication required.') {
    super(message);
    this.name = 'StoreAuthError';
  }
}
