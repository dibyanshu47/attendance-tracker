import type { DriveTokenProvider } from './types';

/** The only OAuth scope this app requests for Drive: a hidden per-app folder
 *  (appDataFolder). Non-sensitive, so no paid verification (§6, §12). */
export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

/** Seconds shaved off the real expiry so we never present a token that is about
 *  to expire mid-request. */
const EXPIRY_SKEW_SECONDS = 60;

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
 * GIS delivers tokens through a single client callback, so each request wires
 * that callback to the in-flight promise's resolve/reject.
 */
export class GisDriveTokenProvider implements DriveTokenProvider {
  private readonly clientId: string;
  private tokenClient: google.accounts.oauth2.TokenClient | null = null;
  private token: CachedToken | null = null;
  private inFlight: Promise<string> | null = null;
  private resolveInFlight: ((token: string) => void) | null = null;
  private rejectInFlight: ((error: Error) => void) | null = null;

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
    if (this.inFlight) return this.inFlight;
    let client: google.accounts.oauth2.TokenClient;
    try {
      client = this.ensureClient();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    this.inFlight = new Promise<string>((resolve, reject) => {
      this.resolveInFlight = resolve;
      this.rejectInFlight = reject;
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

  private settle(token: string | null, error: Error | null): void {
    if (error) this.rejectInFlight?.(error);
    else if (token !== null) this.resolveInFlight?.(token);
    this.inFlight = null;
    this.resolveInFlight = null;
    this.rejectInFlight = null;
  }
}
