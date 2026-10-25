import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { describeError } from '../app/errors';
import { Centered } from '../components/Centered';
import type { ClassInfo } from '../store';

type Status = 'loading' | 'ready' | 'missing' | 'error';

/** ClassHome (route "/class/:id"). Hub for one class: primary "Take attendance"
 *  CTA plus Reports and Manage students (§11.2). */
export function ClassHome(): JSX.Element {
  const { id = '' } = useParams();
  const { store } = useApp();
  const [cls, setCls] = useState<ClassInfo | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStatus('loading');
      setError(null);
      try {
        const list = await store.listClasses();
        const found = list.find((c) => c.classId === id) ?? null;
        if (cancelled) return;
        setCls(found);
        setStatus(found ? 'ready' : 'missing');
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
  }, [store, id]);

  if (status === 'loading') return <Centered title="Loading…" />;
  if (status === 'error') {
    return (
      <Centered title="Something went wrong">
        <p className="error">{error}</p>
        <Link to="/">Back to classes</Link>
      </Centered>
    );
  }
  if (status === 'missing' || !cls) {
    return (
      <Centered title="Class not found">
        <Link to="/">Back to classes</Link>
      </Centered>
    );
  }

  return (
    <section className="screen">
      <nav className="crumbs">
        <Link to="/">Classes</Link> <span aria-hidden>/</span> <span>{cls.name}</span>
      </nav>
      <h1>{cls.name}</h1>
      <p className="muted">
        {cls.memberIds.length} student{cls.memberIds.length === 1 ? '' : 's'} enrolled
      </p>
      <div className="actions">
        <Link className="btn btn-primary btn-lg" to={`/class/${cls.classId}/attendance`}>
          Take attendance
        </Link>
        <Link className="btn" to={`/class/${cls.classId}/reports`}>
          Reports
        </Link>
        <Link className="btn" to={`/class/${cls.classId}/roster`}>
          Manage students
        </Link>
      </div>
    </section>
  );
}
