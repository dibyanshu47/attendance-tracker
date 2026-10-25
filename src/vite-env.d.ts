/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google OAuth Web client ID (…apps.googleusercontent.com). Set in .env.local. See docs §12. */
  readonly VITE_GOOGLE_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
