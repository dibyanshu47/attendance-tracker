// Pure aggregation over the session maps the store returns (§5). Every function
// filters to the exact [from, to] day range, because getRange may hand back
// whole month buckets with out-of-range days at the span's edges (§10). ISO
// "YYYY-MM-DD" strings compare lexicographically in chronological order, so
// range checks and sorting are plain string operations.

import type { IsoDate, Session, StudentId } from '../store';
import type { DayRoster, DaySummary, StudentRate } from './types';
import { monthBounds, weekRange } from './dates';

type SessionMap = Record<IsoDate, Session>;

/** One date's roster for a class. Empty present/absent and `marked: false`
 *  when nothing was recorded that day. */
export function dailyView(sessions: SessionMap, date: IsoDate): DayRoster {
  const session = sessions[date];
  return {
    date,
    present: session ? [...session.present] : [],
    absent: session ? [...session.absent] : [],
    marked: Boolean(session),
  };
}

/** Sorted dates on which the class met (had a recorded session) within the
 *  inclusive range — the class-level "days the class met" (§5). */
export function classMetDates(sessions: SessionMap, from: IsoDate, to: IsoDate): IsoDate[] {
  return Object.keys(sessions)
    .filter((date) => date >= from && date <= to)
    .sort();
}

/** Count of days the class met in the range. */
export function classMetDays(sessions: SessionMap, from: IsoDate, to: IsoDate): number {
  return classMetDates(sessions, from, to).length;
}

/** Per-day summaries for every day the class met in the range, sorted by date. */
export function summarizeRange(sessions: SessionMap, from: IsoDate, to: IsoDate): DaySummary[] {
  return classMetDates(sessions, from, to).map((date) => {
    const session = sessions[date];
    return {
      date,
      present: [...session.present],
      absent: [...session.absent],
      presentCount: session.present.length,
      absentCount: session.absent.length,
    };
  });
}

/** The 7-day weekly view: summaries for the week containing `anchorDate`. */
export function weeklyView(
  sessions: SessionMap,
  anchorDate: IsoDate,
  weekStartsOn: 0 | 1 = 1,
): DaySummary[] {
  const { from, to } = weekRange(anchorDate, weekStartsOn);
  return summarizeRange(sessions, from, to);
}

/** The monthly view: summaries for the given month bucket ("YYYY-MM"). */
export function monthlyView(sessions: SessionMap, month: string): DaySummary[] {
  const { from, to } = monthBounds(month);
  return summarizeRange(sessions, from, to);
}

/**
 * Per-student attendance rate across a range (§5). For each student, the
 * denominator is the number of met-days on which they were marked (present ∪
 * absent) and the numerator is the days they were present.
 *
 * Pass `studentIds` (e.g. the class's current members) to report exactly those
 * — a member never marked in the range comes back with markedCount 0 and rate
 * null. Omit it to report every student who appears in any session in the
 * range.
 */
export function studentRates(
  sessions: SessionMap,
  from: IsoDate,
  to: IsoDate,
  studentIds?: StudentId[],
): StudentRate[] {
  const dates = classMetDates(sessions, from, to);
  const presentByDay = dates.map((date) => new Set(sessions[date].present));
  const absentByDay = dates.map((date) => new Set(sessions[date].absent));

  const ids = studentIds ?? collectStudentIds(dates, sessions);

  return ids.map((studentId) => {
    let presentCount = 0;
    let markedCount = 0;
    for (let i = 0; i < dates.length; i += 1) {
      const wasPresent = presentByDay[i].has(studentId);
      const wasAbsent = absentByDay[i].has(studentId);
      if (wasPresent) presentCount += 1;
      if (wasPresent || wasAbsent) markedCount += 1;
    }
    return {
      studentId,
      presentCount,
      markedCount,
      rate: markedCount === 0 ? null : presentCount / markedCount,
    };
  });
}

/** Every distinct student id appearing (present or absent) across the days. */
function collectStudentIds(dates: IsoDate[], sessions: SessionMap): StudentId[] {
  const ids = new Set<StudentId>();
  for (const date of dates) {
    const session = sessions[date];
    for (const id of session.present) ids.add(id);
    for (const id of session.absent) ids.add(id);
  }
  return [...ids];
}
