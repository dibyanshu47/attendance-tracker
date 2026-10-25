import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { renderGoogleButton, type GoogleIdentity } from '../auth';

/** Identity only — renders the Sign In With Google button and, once an ID token
 *  arrives (identity set by App), redirects to ClassList. No Drive scope here
 *  (§11.2 / §11.4), so sign-in is frictionless. */
export function Login(props: {
  identity: GoogleIdentity | null;
  gisReady: boolean;
  gisError: string | null;
}): JSX.Element {
  const { identity, gisReady, gisError } = props;
  const navigate = useNavigate();
  const buttonRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (identity) navigate('/', { replace: true });
  }, [identity, navigate]);

  useEffect(() => {
    if (gisReady && !identity && buttonRef.current) {
      renderGoogleButton(buttonRef.current);
    }
  }, [gisReady, identity]);

  return (
    <main className="login">
      <div className="login-card">
        <h1>Attendance Tracker</h1>
        <p className="muted">
          Sign in with Google to manage your classes. Your attendance data is stored only in your
          own Google Drive — we keep nothing.
        </p>
        {gisError ? (
          <p className="error">{gisError}</p>
        ) : (
          <div className="login-button" ref={buttonRef} />
        )}
        {!gisReady && !gisError ? <p className="muted">Loading sign-in…</p> : null}
      </div>
    </main>
  );
}
