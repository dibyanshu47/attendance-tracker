import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base` is the path the app is served under.
// - dev: '/' so the local server stays at http://localhost:5173/
// - build: '/attendance-tracker/' for a GitHub Pages PROJECT site
//   (https://<user>.github.io/attendance-tracker/). If you deploy to a USER
//   site (<user>.github.io root) or a custom domain, change this to '/'.
// The dev server port is pinned to 5173 to match the authorized OAuth origin
// in the Google Cloud Console (see docs §12).
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/attendance-tracker/' : '/',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
}));
