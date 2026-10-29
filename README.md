# Attendance Tracker

A browser-only class attendance tracker. All data is stored in the teacher's own
Google Drive (`appDataFolder`) — no backend, no database. React 18 + Vite +
TypeScript. See [`docs/architecture.md`](docs/architecture.md) for the full
architecture and data model.

## Local development

1. Install dependencies (a project-local `.npmrc` pins the public npm registry):
   ```bash
   npm install
   ```
2. Create `.env.local` from the example and add your Google OAuth **Web** client
   ID (see `docs/architecture.md` §12 for the Google Cloud Console setup):
   ```bash
   cp .env.local.example .env.local
   # edit .env.local:
   # VITE_GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   ```
3. Run the dev server (pinned to port 5173 to match the authorized OAuth origin):
   ```bash
   npm run dev        # http://localhost:5173
   ```

`.env.local` is gitignored; the client ID is never committed. No client secret is
used — this is a browser app.

## Build

```bash
npm run build         # type-checks, builds to dist/, writes 404.html SPA fallback
npm run preview       # serve the production build locally
```

## Deploy to GitHub Pages

Deployment is automated by [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
on every push to `main`.

One-time setup:

1. **Create the GitHub repo and push** (repo name `attendance-tracker` so the
   site is served at `https://<user>.github.io/attendance-tracker/`):
   ```bash
   git remote add origin git@github.com:<user>/attendance-tracker.git
   git push -u origin main
   ```
2. **Enable Pages:** repo **Settings → Pages → Build and deployment → Source:
   GitHub Actions**.
3. **Add the client ID:** repo **Settings → Secrets and variables → Actions →
   New repository secret**, name `VITE_GOOGLE_CLIENT_ID`, value your client ID.
4. **Authorize the production origin** in the Google Cloud Console → Credentials
   → your OAuth client → **Authorized JavaScript origins**: add
   `https://<user>.github.io` (origin only, no path).

Notes:
- The app is served under `/attendance-tracker/` in production (set in
  `vite.config.ts`). For a **user site** (`<user>.github.io` root) or a custom
  domain, change `base` to `/` there.
- Deep links work via a `404.html` copy of `index.html` (GitHub Pages has no
  server-side rewrites); React Router resolves the route on load using the Vite
  base path as its `basename`.
