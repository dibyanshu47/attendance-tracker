import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { useClassInfo } from '../app/useClassInfo';
import { describeError } from '../app/errors';
import { Centered } from '../components/Centered';
import type { IsoDate, Session, StudentId } from '../store';
import {
  dailyView,
  monthBounds,
  monthKeyOf,
  studentRates,
  summarizeRange,
  todayIso,
  weekRange,
} from '../views';

type Mode = 'day' | 'week' | 'month';
type Status = 'loading' | 'ready' | 'error';
type SessionMap = Record<IsoDate, Session>;

/** Reports (route "/class/:id/reports"). Daily / weekly / monthly views plus
 *  per-student rate (§11.2, §5). Month mode loads one bucket (getMonth); day
 *  and week modes use getRange so a week can span two buckets. */
export function Reports(): JSX.Element {
  const { id = '' } = useParams();
  const { store, students, studentsLoaded, reloadStudents } = useApp();
  const { state } = useClassInfo(id);

  const [mode, setMode] = useState<Mode>('month');
  const [anchor, setAnchor] = useState<IsoDate>(todayIso()); // day / week
  const [month, setMonth] = useState<string>(monthKeyOf(todayIso())); // month
  const [sessions, setSessions] = useState<SessionMap>({});
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentsLoaded) void reloadStudents().catch((err) => setError(describeError(err)));
  }, [studentsLoaded, reloadStudents]);

  const range = useMemo(() => {
    if (mode === 'day') return { from: anchor, to: anchor };
    if (mode === 'week') return weekRange(anchor);
    return monthBounds(month);
  }, [mode, anchor, month]);

  useEffect(() => {
    if (state.status !== 'ready') return undefined;
    let cancelled = false;
    void (async () => {
      setStatus('loading');
      setError(null);
      try {
        const map =
          mode === 'month'
            ? ((await store.getMonth(id, month)) ?? {})
            : await store.getRange(id, range.from, range.to);
        if (!cancelled) {
          setSessions(map);
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
  }, [state, store, id, mode, month, range.from, range.to]);

  const nameOf = useMemo(() => {
    const byId = new Map(students.map((s) => [s.id, s.name] as const));
    return (studentId: StudentId): string => byId.get(studentId) ?? studentId;
  }, [students]);

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
        <span>Reports</span>
      </nav>
      <h1>Reports — {state.cls.name}</h1>

      <div className="tabs">
        {(['day', 'week', 'month'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={`tab ${mode === m ? 'tab-active' : ''}`}
            onClick={() => setMode(m)}
          >
            {m[0].toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      <div className="period">
        {mode === 'month' ? (
          <label className="date-field">
            Month{' '}
            <input
              className="input date-input"
              type="month"
              value={month}
              max={monthKeyOf(todayIso())}
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
        ) : (
          <label className="date-field">
            {mode === 'day' ? 'Day' : 'Week of'}{' '}
            <input
              className="input date-input"
              type="date"
              value={anchor}
              max={todayIso()}
              onChange={(event) => setAnchor(event.target.value)}
            />
          </label>
        )}
      </div>

      {status === 'loading' ? <Centered title="Loading…" /> : null}
      {status === 'error' && error ? <p className="error">{error}</p> : null}

      {status === 'ready'
        ? mode === 'day'
          ? renderDay(sessions, anchor, nameOf)
          : renderRange(sessions, range.from, range.to, state.cls.memberIds, nameOf)
        : null}
    </section>
  );
}

function renderDay(
  sessions: SessionMap,
  date: IsoDate,
  nameOf: (id: StudentId) => string,
): JSX.Element {
  const day = dailyView(sessions, date);
  if (!day.marked) {
    return <Centered title="No session recorded">The class did not meet on {date}.</Centered>;
  }
  return (
    <div className="day-view">
      <div className="day-col">
        <h3>Present ({day.present.length})</h3>
        <ul className="name-list">
          {day.present.map((sid) => (
            <li key={sid}>{nameOf(sid)}</li>
          ))}
        </ul>
      </div>
      <div className="day-col">
        <h3>Absent ({day.absent.length})</h3>
        <ul className="name-list">
          {day.absent.map((sid) => (
            <li key={sid}>{nameOf(sid)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function renderRange(
  sessions: SessionMap,
  from: IsoDate,
  to: IsoDate,
  memberIds: StudentId[],
  nameOf: (id: StudentId) => string,
): JSX.Element {
  const days = summarizeRange(sessions, from, to);
  const rates = studentRates(sessions, from, to, memberIds).sort((a, b) =>
    nameOf(a.studentId).localeCompare(nameOf(b.studentId)),
  );

  if (days.length === 0) {
    return <Centered title="No sessions recorded">Nothing marked in this period yet.</Centered>;
  }

  return (
    <div className="report">
      <h3>Days the class met ({days.length})</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Present</th>
            <th>Absent</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.presentCount}</td>
              <td>{d.absentCount}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Per-student rate</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Present / Marked</th>
            <th>Rate</th>
          </tr>
        </thead>
        <tbody>
          {rates.map((r) => (
            <tr key={r.studentId}>
              <td>{nameOf(r.studentId)}</td>
              <td>
                {r.presentCount} / {r.markedCount}
              </td>
              <td>{r.rate === null ? '—' : `${Math.round(r.rate * 100)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
