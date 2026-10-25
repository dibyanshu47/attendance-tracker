// App configuration sourced from Vite env (.env.local, gitignored). See docs §12.

/** The OAuth Web client ID. Throws a actionable message if unset so the app
 *  renders a clear "configuration needed" screen instead of failing deep in GIS. */
export function getGoogleClientId(): string {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      'VITE_GOOGLE_CLIENT_ID is not set. Copy .env.local.example to .env.local and add your ' +
        'Google OAuth Web client ID (see docs/architecture.md section 12).',
    );
  }
  return clientId;
}
