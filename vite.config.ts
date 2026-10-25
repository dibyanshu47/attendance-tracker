import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Port pinned to 5173 so it matches the Authorized JavaScript origin
// (http://localhost:5173) configured in the Google Cloud Console (see docs §12).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
});
