import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { describeError } from '../app/errors';
import { Centered } from '../components/Centered';
import type { ClassInfo } from '../store';

type Status = 'loading' | 'ready' | 'empty-new' | 'error';

/** ClassList (route "/"). Lists the teacher's classes and creates new ones.
 *  A returning teacher's Drive token is acquired silently before the first
 *  read; a brand-new teacher (silent grant fails) sees the empty state and does
 *  NO read until the first create triggers interactive consent (§11.2). */
export function ClassList(): JSX.Element {
  const { store, tokens } = useApp();
  const [status, setStatus] = useState<Status>('loading');
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStatus('loading');
      setError(null);
      try {
        await tokens.ensureToken(); // silent; brand-new/revoked -> throws
      } catch {
        if (!cancelled) setStatus('empty-new');
        return;
      }
      try {
        const list = await store.listClasses();
        if (!cancelled) {
          setClasses(list);
          setStatus('ready');
        }
      } catch (err) {
        if (!cancelled) {
          setError(describeError(err));
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, tokens]);

  async function handleCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      // First-ever Drive consent happens here, tied to a visible action (§11.4).
      if (!tokens.getToken()) await tokens.requestInteractiveConsent();
      const created = await store.createClass(trimmed);
      setClasses((prev) => [...prev, created]);
      setName('');
      setStatus('ready');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const showEmpty = status === 'empty-new' || (status === 'ready' && classes.length === 0);

  return (
    <section className="screen">
      <div className="screen-head">
        <h1>Your classes</h1>
      </div>

      {status === 'loading' ? <Centered title="Loading your classes…" /> : null}
      {status === 'error' && error ? <p className="error">{error}</p> : null}

      {status === 'ready' && classes.length > 0 ? (
        <ul className="card-list">
          {classes.map((cls) => (
            <li key={cls.classId} className="card">
              <Link className="card-link" to={`/class/${cls.classId}`}>
                <span className="card-title">{cls.name}</span>
                <span className="muted">
                  {cls.memberIds.length} student{cls.memberIds.length === 1 ? '' : 's'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {showEmpty ? (
        <Centered title="Create your first class">
          <p className="muted">
            No classes yet. Create one to get started — this is when we’ll ask permission to store
            your data in Google Drive.
          </p>
        </Centered>
      ) : null}

      {status !== 'loading' ? (
        <form className="create-form" onSubmit={handleCreate}>
          <input
            className="input"
            type="text"
            placeholder="New class name (e.g. Karate - Tue/Thu 6pm)"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
            aria-label="New class name"
          />
          <button className="btn btn-primary" type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create class'}
          </button>
        </form>
      ) : null}
    </section>
  );
}
