import type { DriveTokenProvider } from './types';

/** The only OAuth scope this app requests for Drive: a hidden per-app folder
 *  (appDataFolder). Non-sensitive, so no paid verification (§6, §12). */
export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

/** Seconds shaved off the real expiry so we never present a token that is about
 *  to expire mid-request. */
const EXPIRY_SKEW_SECONDS = 60;

/** A silent (`prompt: ''`) probe can hang when the user has no prior grant, so
 *  we time it out and surface a rejection instead of waiting forever. */
const SILENT_TIMEOUT_MS = 8000;

interface CachedToken {
  value: string;
  expiresAt: number; // epoch ms
}

/**
 * Wraps the GIS OAuth token client for the Drive `appDataFolder` scope.
 *
 * - The access token lives only in memory here — never localStorage/cookies (§6).
 * - Interactive consent is requested on the first write (first class creation);
 *   thereafter tokens are re-acquired silently (`prompt: ''`) on load/expiry.
 * - Revoked on logout.
 *
 * Request handling is prompt-aware: like-with-like silent requests share one
 * in-flight promise, but an interactive `consent` request (a user clicking
 * "create") must never be blocked by a pending — possibly dangling — silent
 * probe, so it supersedes it. Silent probes also time out.
 */
export class GisDriveTokenProvider implements DriveTokenProvider {
  private readonly clientId: string;
  private tokenClient: google.accounts.oauth2.TokenClient | null = null;
  private token: CachedToken | null = null;

  private inFlight: Promise<string> | null = null;
  private inFlightPrompt: '' | 'consent' | null = null;
  private resolveInFlight: ((token: string) => void) | null = null;
  private rejectInFlight: ((error: Error) => void) | null = null;
  private silentTimer: number | null = null;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  getToken(): string | null {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    return null;
  }

  async ensureToken(): Promise<string> {
    return this.getToken() ?? this.request('');
  }

  refreshSilently(): Promise<string> {
    return this.request('');
  }

  /** Interactive consent popup. Used for the first-ever Drive grant (§11.4). */
  requestInteractiveConsent(): Promise<string> {
    return this.request('consent');
  }

  /** Revoke the current grant and drop the in-memory token (logout). */
  revoke(): void {
    const current = this.token?.value;
    this.token = null;
    if (current && window.google?.accounts?.oauth2) {
      google.accounts.oauth2.revoke(current);
    }
  }

  private ensureClient(): google.accounts.oauth2.TokenClient {
    if (this.tokenClient) return this.tokenClient;
    if (!window.google?.accounts?.oauth2) {
      throw new Error('Google Identity Services not loaded');
    }
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: this.clientId,
      scope: DRIVE_APPDATA_SCOPE,
      callback: (response) => this.onToken(response),
      error_callback: (error) => this.onError(error),
    });
    return this.tokenClient;
  }

  private request(prompt: '' | 'consent'): Promise<string> {
    if (this.inFlight) {
      // Share an identical in-flight request.
      if (this.inFlightPrompt === prompt) return this.inFlight;
      // A consent click supersedes a pending silent probe so the popup always
      // opens; a silent caller, by contrast, can ride on an in-flight consent.
      if (prompt === 'consent') {
        this.abandonInFlight(new Error('Superseded by interactive consent'));
      } else {
        return this.inFlight;
      }
    }

    let client: google.accounts.oauth2.TokenClient;
    try {
      client = this.ensureClient();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }

    this.inFlightPrompt = prompt;
    this.inFlight = new Promise<string>((resolve, reject) => {
      this.resolveInFlight = resolve;
      this.rejectInFlight = reject;
      if (prompt === '') {
        this.silentTimer = window.setTimeout(() => {
          this.onError({ type: 'timeout', message: 'Silent token request timed out' });
        }, SILENT_TIMEOUT_MS);
      }
      client.requestAccessToken({ prompt });
    });
    return this.inFlight;
  }

  private onToken(response: google.accounts.oauth2.TokenResponse): void {
    if (response.error) {
      this.settle(null, new Error(response.error_description ?? response.error));
      return;
    }
    this.token = {
      value: response.access_token,
      expiresAt: Date.now() + Math.max(0, response.expires_in - EXPIRY_SKEW_SECONDS) * 1000,
    };
    this.settle(response.access_token, null);
  }

  private onError(error: google.accounts.oauth2.TokenError): void {
    this.settle(null, new Error(error.message ?? error.type ?? 'Token request failed'));
  }

  /** Resolve/reject the active request and clear in-flight state. Safe to call
   *  from a late/stale GIS callback: the handlers are null by then, so the
   *  optional calls are no-ops. */
  private settle(token: string | null, error: Error | null): void {
    this.clearSilentTimer();
    if (error) this.rejectInFlight?.(error);
    else if (token !== null) this.resolveInFlight?.(token);
    this.inFlight = null;
    this.inFlightPrompt = null;
    this.resolveInFlight = null;
    this.rejectInFlight = null;
  }

  /** Reject and drop a pending request without waiting for GIS (used when a
   *  consent request supersedes a pending silent probe). */
  private abandonInFlight(error: Error): void {
    this.clearSilentTimer();
    this.rejectInFlight?.(error);
    this.inFlight = null;
    this.inFlightPrompt = null;
    this.resolveInFlight = null;
    this.rejectInFlight = null;
  }

  private clearSilentTimer(): void {
    if (this.silentTimer !== null) {
      window.clearTimeout(this.silentTimer);
      this.silentTimer = null;
    }
  }
}
