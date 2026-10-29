import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { GisDriveTokenProvider, initGoogleLogin, waitForGis, loadIdentity, saveIdentity, clearIdentity, type GoogleIdentity } from './auth';
import { GoogleDriveStore, type AttendanceStore } from './store';
import { getGoogleClientId } from './app/config';
import { AppProvider } from './app/AppContext';
import { AppShell } from './components/AppShell';
import { Centered } from './components/Centered';
import { Login } from './screens/Login';
import { ClassList } from './screens/ClassList';
import { ClassHome } from './screens/ClassHome';
import { Roster } from './screens/Roster';
import { MarkAttendance } from './screens/MarkAttendance';
import { Reports } from './screens/Reports';

export default function App(): JSX.Element {
  // Resolve config once; a missing client ID renders a clear screen (below)
  // instead of throwing during render.
  const [config] = useState<{ clientId: string; error: string | null }>(() => {
    try {
      return { clientId: getGoogleClientId(), error: null };
    } catch (err) {
      return { clientId: '', error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Single store + token provider for the app's lifetime.
  const [tokens] = useState<GisDriveTokenProvider>(() => new GisDriveTokenProvider(config.clientId));
  const [store] = useState<AttendanceStore>(() => new GoogleDriveStore(tokens));

  // Restore the signed-in profile across refreshes (sessionStorage); the Drive
  // token itself is never persisted and is re-acquired silently on load (§6).
  const [identity, setIdentity] = useState<GoogleIdentity | null>(() => loadIdentity());
  const [gisReady, setGisReady] = useState(false);
  const [gisError, setGisError] = useState<string | null>(null);

  useEffect(() => {
    if (config.error) return undefined;
    let cancelled = false;
    waitForGis()
      .then(() => {
        if (cancelled) return;
        initGoogleLogin({
          clientId: config.clientId,
          onIdentity: (id) => {
            saveIdentity(id);
            setIdentity(id);
          },
        });
        setGisReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) setGisError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [config]);

  const handleLogout = useCallback(() => {
    clearIdentity();
    setIdentity(null);
  }, []);

  if (config.error) {
    return (
      <Centered title="Configuration needed">
        <p className="error">{config.error}</p>
      </Centered>
    );
  }

  // Serve under the Vite base path (e.g. "/attendance-tracker" on GitHub Pages
  // project sites, "/" in dev). Trailing slash stripped for React Router.
  const basename = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';

  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route
          path="/login"
          element={<Login identity={identity} gisReady={gisReady} gisError={gisError} />}
        />
        <Route
          element={
            <AuthedLayout
              identity={identity}
              store={store}
              tokens={tokens}
              onLogout={handleLogout}
            />
          }
        >
          <Route path="/" element={<ClassList />} />
          <Route path="/class/:id" element={<ClassHome />} />
          <Route path="/class/:id/roster" element={<Roster />} />
          <Route path="/class/:id/attendance" element={<MarkAttendance />} />
          <Route path="/class/:id/reports" element={<Reports />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

/** Gate for signed-in routes: redirect to /login when there is no identity,
 *  otherwise provide app context and render the shell (§11.1). */
function AuthedLayout(props: {
  identity: GoogleIdentity | null;
  store: AttendanceStore;
  tokens: GisDriveTokenProvider;
  onLogout: () => void;
}): JSX.Element {
  if (!props.identity) return <Navigate to="/login" replace />;
  return (
    <AppProvider
      identity={props.identity}
      store={props.store}
      tokens={props.tokens}
      onLogout={props.onLogout}
    >
      <AppShell />
    </AppProvider>
  );
}
