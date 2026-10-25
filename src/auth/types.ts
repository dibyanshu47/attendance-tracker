// Public types for the auth layer.

/** The teacher's identity, decoded from the Google ID token (§3.2). `sub` is the
 *  stable per-teacher key; the rest are for display in the app shell. */
export interface GoogleIdentity {
  sub: string;
  name: string;
  email: string;
  picture?: string;
}

/**
 * The narrow slice of the Drive token client that the store depends on. Keeping
 * it an interface means GoogleDriveStore never imports GIS directly — it is
 * handed a provider, preserving the §9 boundary (only the store touches Drive,
 * only the auth layer touches GIS). The app wires a concrete provider in.
 */
export interface DriveTokenProvider {
  /** The current in-memory access token if one is cached and unexpired, else null. */
  getToken(): string | null;
  /** Return a valid token: the cached one if usable, otherwise a silent re-grant. */
  ensureToken(): Promise<string>;
  /** Force a silent (`prompt: ''`) re-grant. Rejects if silent re-grant is not
   *  possible (e.g. consent was revoked); the store maps that to StoreAuthError. */
  refreshSilently(): Promise<string>;
}
