import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { useClassInfo } from '../app/useClassInfo';
import { describeError } from '../app/errors';
import { Centered } from '../components/Centered';
import { PresentAbsentToggle } from '../components/PresentAbsentToggle';
import { StoreConflictError, type StudentId } from '../store';
import { todayIso } from '../views';

type LoadStatus = 'loading' | 'ready' | 'error';

/** MarkAttendance (route "/class/:id/attendance?date=YYYY-MM-DD"). The daily
 *  fast path (§11.3): defaults to today, every enrolled active student starts
 *  present, the teacher taps only the absentees, then Save. Save is disabled
 *  while the write is in flight; a StoreConflictError prompts a re-save (which
 *  re-reads the bucket with a fresh etag). */
export function MarkAttendance(): JSX.Element {
  const { id = '' } = useParams();
  const { store, students, studentsLoaded, reloadStudents } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const { state } = useClassInfo(id);

  const date = searchParams.get('date') || todayIso();

  const [absent, setAbsent] = useState<Set<StudentId>>(new Set());
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    if (!studentsLoaded) void reloadStudents().catch((err) => setError(describeError(err)));
  }, [studentsLoaded, reloadStudents]);

  // Prefill absentees from any existing session for this date (editing a day).
  useEffect(() => {
    if (state.status !== 'ready') return undefined;
    let cancelled = false;
    void (async () => {
      setLoadStatus('loading');
      setError(null);
      setSaved(false);
      setConflict(false);
      try {
        const month = date.slice(0, 7);
        const sessions = await store.getMonth(id, month);
        const existing = sessions ? sessions[date] : undefined;
        if (cancelled) return;
        setAbsent(new Set(existing ? existing.absent : []));
        setLoadStatus('ready');
      } catch (err) {
        if (!cancelled) {
          setError(describeError(err));
          setLoadStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state, store, id, date]);

  const roster = useMemo(() => {
    if (state.status !== 'ready') return [];
    const members = new Set(state.cls.memberIds);
    return students
      .filter((s) => s.active && members.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [state, students]);

  function setPresent(studentId: StudentId, present: boolean): void {
    setAbsent((prev) => {
      const next = new Set(prev);
      if (present) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
    setSaved(false);
  }

  async function handleSave(): Promise<void> {
    if (saving || state.status !== 'ready') return;
    setSaving(true);
    setError(null);
    setConflict(false);
    const present = roster.filter((s) => !absent.has(s.id)).map((s) => s.id);
    const absentIds = roster.filter((s) => absent.has(s.id)).map((s) => s.id);
    try {
      await store.markSession(id, date, { present, absent: absentIds });
      setSaved(true);
    } catch (err) {
      if (err instanceof StoreConflictError) setConflict(true);
      else setError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  if (state.status === 'loading') return <Centered title="Loading…" />;
  if (state.status === 'missing') {
    return (
      <Centered title="Class not found">
        <Link to="/">Back to classes</Link>
      </Centered>
    );
  }
  if (state.status === 'error') {
    return (
      <Centered title="Something went wrong">
        <p className="error">{state.error}</p>
        <Link to="/">Back to classes</Link>
      </Centered>
    );
  }

  const presentCount = roster.length - absent.size;

  return (
    <section className="screen">
      <nav className="crumbs">
        <Link to="/">Classes</Link> <span aria-hidden>/</span>{' '}
        <Link to={`/class/${state.cls.classId}`}>{state.cls.name}</Link> <span aria-hidden>/</span>{' '}
        <span>Attendance</span>
      </nav>

      <div className="screen-head">
        <h1>Take attendance</h1>
        <label className="date-field">
          Date{' '}
          <input
            className="input date-input"
            type="date"
            value={date}
            max={todayIso()}
            onChange={(event) => setSearchParams({ date: event.target.value })}
          />
        </label>
      </div>

      {loadStatus === 'loading' ? <Centered title="Loading roster…" /> : null}
      {loadStatus === 'error' && error ? <p className="error">{error}</p> : null}

      {loadStatus === 'ready' ? (
        roster.length === 0 ? (
          <Centered title="No students enrolled">
            <p className="muted">
              Add and enroll students on the{' '}
              <Link to={`/class/${state.cls.classId}/roster`}>roster</Link> first.
            </p>
          </Centered>
        ) : (
          <>
            <p className="muted">
              {presentCount} present, {absent.size} absent of {roster.length}
            </p>
            <ul className="mark-list">
              {roster.map((student) => (
                <li key={student.id} className="mark-row">
                  <span className="mark-name">{student.name}</span>
                  <PresentAbsentToggle
                    present={!absent.has(student.id)}
                    disabled={saving}
                    onChange={(present) => setPresent(student.id, present)}
                  />
                </li>
              ))}
            </ul>

            {conflict ? (
              <p className="error">
                This day was changed elsewhere since you opened it. Tap Save again to overwrite with
                your marks.
              </p>
            ) : null}
            {error ? <p className="error">{error}</p> : null}

            <div className="actions">
              <button className="btn btn-primary btn-lg" type="button" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              {saved ? <span className="muted">Saved ✓</span> : null}
            </div>
          </>
        )
      ) : null}
    </section>
  );
}
