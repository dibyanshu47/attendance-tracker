import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { useClassInfo } from '../app/useClassInfo';
import { describeError } from '../app/errors';
import { Centered } from '../components/Centered';
import type { StudentId } from '../store';

/** Roster (route "/class/:id/roster"). Add new students to the teacher
 *  directory and enroll/unenroll existing ones (many-to-many). Follows the §7
 *  write order: addStudent persists students.json before setMembership runs. */
export function Roster(): JSX.Element {
  const { id = '' } = useParams();
  const { store, students, studentsLoaded, reloadStudents } = useApp();
  const { state } = useClassInfo(id);

  const [enrolled, setEnrolled] = useState<Set<StudentId>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentsLoaded) void reloadStudents().catch((err) => setError(describeError(err)));
  }, [studentsLoaded, reloadStudents]);

  // Seed the enrolled set once the class is loaded.
  useEffect(() => {
    if (state.status === 'ready' && !initialized) {
      setEnrolled(new Set(state.cls.memberIds));
      setInitialized(true);
    }
  }, [state, initialized]);

  const activeStudents = useMemo(
    () => students.filter((s) => s.active).sort((a, b) => a.name.localeCompare(b.name)),
    [students],
  );

  function toggleEnroll(studentId: StudentId): void {
    setEnrolled((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
    setDirty(true);
  }

  async function handleAdd(event: FormEvent): Promise<void> {
    event.preventDefault();
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Create in the directory first (persists students.json), then mark
      // enrolled locally; membership is saved via "Save enrollment".
      const created = await store.addStudent(name);
      await reloadStudents();
      setEnrolled((prev) => new Set(prev).add(created.id));
      setDirty(true);
      setNewName('');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEnrollment(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await store.setMembership(id, [...enrolled]);
      setDirty(false);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
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

  return (
    <section className="screen">
      <nav className="crumbs">
        <Link to="/">Classes</Link> <span aria-hidden>/</span>{' '}
        <Link to={`/class/${state.cls.classId}`}>{state.cls.name}</Link> <span aria-hidden>/</span>{' '}
        <span>Roster</span>
      </nav>
      <h1>Roster — {state.cls.name}</h1>

      <form className="create-form" onSubmit={handleAdd}>
        <input
          className="input"
          type="text"
          placeholder="Add a student by name"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          disabled={busy}
          aria-label="New student name"
        />
        <button className="btn btn-primary" type="submit" disabled={busy || !newName.trim()}>
          Add &amp; enroll
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}

      {activeStudents.length === 0 ? (
        <Centered title="No students yet">
          <p className="muted">Add your first student above.</p>
        </Centered>
      ) : (
        <ul className="roster-list">
          {activeStudents.map((student) => (
            <li key={student.id} className="roster-row">
              <label className="roster-label">
                <input
                  type="checkbox"
                  checked={enrolled.has(student.id)}
                  onChange={() => toggleEnroll(student.id)}
                  disabled={busy}
                />
                <span>{student.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="actions">
        <button
          className="btn btn-primary"
          type="button"
          onClick={handleSaveEnrollment}
          disabled={busy || !dirty}
        >
          {busy ? 'Saving…' : dirty ? 'Save enrollment' : 'Enrollment saved'}
        </button>
        <span className="muted">
          {enrolled.size} enrolled of {activeStudents.length} students
        </span>
      </div>
    </section>
  );
}
