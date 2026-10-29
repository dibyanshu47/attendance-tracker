// Identity session persistence. Stores ONLY the decoded profile (sub/name/
// email/picture) so a page refresh keeps the teacher signed in. The Drive
// access token is deliberately NOT stored here — it stays in memory and is
// re-acquired silently on load (§6). sessionStorage (not localStorage) is used
// so the profile clears when the tab closes.

import type { GoogleIdentity } from './types';

const KEY = 'attendance.identity';

export function saveIdentity(identity: GoogleIdentity): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(identity));
  } catch {
    // Storage may be unavailable (private mode / quota); the session simply
    // won't persist across refresh. Not fatal.
  }
}

export function loadIdentity(): GoogleIdentity | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GoogleIdentity>;
    if (typeof parsed.sub !== 'string' || !parsed.sub) return null;
    const identity: GoogleIdentity = {
      sub: parsed.sub,
      name: typeof parsed.name === 'string' ? parsed.name : '',
      email: typeof parsed.email === 'string' ? parsed.email : '',
    };
    if (typeof parsed.picture === 'string') identity.picture = parsed.picture;
    return identity;
  } catch {
    return null;
  }
}

export function clearIdentity(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
