// Shapes the views produce. All are id-centric: views never resolve student
// names (that is a screen concern via listStudents, §11.2).

import type { IsoDate, StudentId } from '../store';

/** One day's present/absent roster for a class. `marked` is false when no
 *  session was recorded that day. */
export interface DayRoster {
  date: IsoDate;
  present: StudentId[];
  absent: StudentId[];
  marked: boolean;
}

/** A per-day summary for a day the class met (used by weekly/monthly/range). */
export interface DaySummary {
  date: IsoDate;
  present: StudentId[];
  absent: StudentId[];
  presentCount: number;
  absentCount: number;
}

/**
 * A single student's attendance rate over a range (§5). The denominator counts
 * only days the student was actually marked (present ∪ absent), so mid-term
 * joiners/leavers need no active window. `rate` is null when the student was
 * never marked in the range (0/0).
 */
export interface StudentRate {
  studentId: StudentId;
  presentCount: number;
  markedCount: number;
  rate: number | null;
}
