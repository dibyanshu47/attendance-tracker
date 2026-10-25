// Minimal ambient types for the Google Identity Services (GIS) browser client
// loaded via <script src="https://accounts.google.com/gsi/client">. GIS ships
// no first-party npm types; this declares only the surface this app uses
// (id = login, oauth2 = Drive token client). See docs §12.2.
export {};

declare global {
  namespace google.accounts.id {
    interface IdConfiguration {
      client_id: string;
      callback: (response: CredentialResponse) => void;
      auto_select?: boolean;
      cancel_on_tap_outside?: boolean;
      ux_mode?: 'popup' | 'redirect';
      nonce?: string;
    }

    /** The response from a completed Sign In With Google. `credential` is the
     *  ID token (a signed JWT) carrying the teacher's identity claims. */
    interface CredentialResponse {
      credential: string;
      select_by?: string;
    }

    interface GsiButtonConfiguration {
      type?: 'standard' | 'icon';
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      logo_alignment?: 'left' | 'center';
      width?: number;
    }

    function initialize(config: IdConfiguration): void;
    function renderButton(parent: HTMLElement, options: GsiButtonConfiguration): void;
    function prompt(): void;
    function disableAutoSelect(): void;
  }

  namespace google.accounts.oauth2 {
    interface TokenClientConfig {
      client_id: string;
      scope: string;
      callback: (response: TokenResponse) => void;
      error_callback?: (error: TokenError) => void;
      prompt?: '' | 'none' | 'consent' | 'select_account';
    }

    /** Per-request overrides passed to requestAccessToken(). `prompt: ''`
     *  requests a token silently (no UI) when the user has already consented. */
    interface OverridableTokenClientConfig {
      prompt?: '' | 'none' | 'consent' | 'select_account';
      enable_serial_consent?: boolean;
      hint?: string;
      state?: string;
    }

    interface TokenResponse {
      access_token: string;
      expires_in: number;
      scope: string;
      token_type: string;
      error?: string;
      error_description?: string;
      error_uri?: string;
    }

    interface TokenError {
      type: string;
      message?: string;
    }

    interface TokenClient {
      requestAccessToken(overrideConfig?: OverridableTokenClientConfig): void;
    }

    function initTokenClient(config: TokenClientConfig): TokenClient;
    function revoke(accessToken: string, done?: () => void): void;
  }

  interface Window {
    google?: typeof google;
  }
}
