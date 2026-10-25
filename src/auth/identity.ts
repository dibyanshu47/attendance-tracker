import type { GoogleIdentity } from './types';

/**
 * Initialize Sign In With Google. On a successful sign-in GIS invokes our
 * callback with the ID token, which we decode into a GoogleIdentity. Login
 * requests identity only — no Drive scope — so it stays frictionless (§11.4).
 */
export function initGoogleLogin(config: {
  clientId: string;
  onIdentity: (identity: GoogleIdentity) => void;
}): void {
  google.accounts.id.initialize({
    client_id: config.clientId,
    callback: (response) => config.onIdentity(decodeIdToken(response.credential)),
    auto_select: false,
    cancel_on_tap_outside: false,
  });
}

/** Render the official Google button into `parent` (must run after initialize). */
export function renderGoogleButton(parent: HTMLElement): void {
  google.accounts.id.renderButton(parent, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'signin_with',
    shape: 'rectangular',
  });
}

/** Clear the "auto select" state so a logged-out user is not auto-signed-in. */
export function disableAutoSelect(): void {
  google.accounts.id.disableAutoSelect();
}

/**
 * Decode the identity claims from a Google ID token. The token is a JWT already
 * signed and delivered by Google through the GIS callback, so we read (not
 * verify) its payload to extract sub/name/email/picture.
 */
export function decodeIdToken(credential: string): GoogleIdentity {
  const payload = decodeJwtPayload(credential);
  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  if (!sub) throw new Error('ID token missing subject (sub) claim');

  const identity: GoogleIdentity = {
    sub,
    name: typeof payload.name === 'string' ? payload.name : '',
    email: typeof payload.email === 'string' ? payload.email : '',
  };
  if (typeof payload.picture === 'string') identity.picture = payload.picture;
  return identity;
}

/** Base64url-decode and JSON-parse the payload (second segment) of a JWT. */
function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const segment = jwt.split('.')[1];
  if (!segment) throw new Error('Malformed ID token');

  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  // Reconstruct UTF-8 so non-ASCII names decode correctly.
  const json = decodeURIComponent(
    Array.from(binary, (ch) => '%' + ch.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
  );
  return JSON.parse(json) as Record<string, unknown>;
}
