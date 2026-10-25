import { Link, Outlet } from 'react-router-dom';
import { useApp } from '../app/AppContext';

/** Wraps all signed-in routes: teacher name/avatar from the ID token, a logout
 *  action (revokes the Drive token), and the routed screen via Outlet (§11.1). */
export function AppShell(): JSX.Element {
  const { identity, logout } = useApp();
  return (
    <div className="shell">
      <header className="shell-header">
        <Link to="/" className="shell-brand">
          Attendance Tracker
        </Link>
        <div className="shell-user">
          {identity.picture ? (
            <img className="shell-avatar" src={identity.picture} alt="" referrerPolicy="no-referrer" />
          ) : null}
          <span className="shell-name">{identity.name || identity.email}</span>
          <button type="button" className="btn btn-ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  );
}
