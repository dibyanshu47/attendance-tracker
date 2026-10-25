// Internal layout helpers for GoogleDriveStore: the on-disk file names and the
// month-bucketing math. None of this crosses the AttendanceStore interface
// (§4.2 — "file layout and month-bucketing stay internal to the store").

import type { ClassId, IsoDate, Month } from '../types';

/** Dimension file: the teacher-wide student directory. */
export const STUDENTS_FILE = 'students.json';
/** Dimension file: class metadata + membership. */
export const CLASSES_FILE = 'classes.json';

/** Fact file (one month bucket for one class): `sessions-{classId}-{YYYY-MM}.json`. */
export function monthFileName(classId: ClassId, month: Month): string {
  return `sessions-${classId}-${month}.json`;
}

/** The month bucket a calendar day falls in: "YYYY-MM-DD" -> "YYYY-MM". */
export function monthOf(date: IsoDate): Month {
  return date.slice(0, 7);
}

/**
 * Every month from `from` to `to` inclusive, as "YYYY-MM" strings. Returns []
 * if `to` precedes `from`. Bounded so malformed input cannot loop unboundedly.
 */
export function enumerateMonths(from: Month, to: Month): Month[] {
  let [year, month] = splitMonth(from);
  const [toYear, toMonth] = splitMonth(to);
  const months: Month[] = [];
  while (year < toYear || (year === toYear && month <= toMonth)) {
    months.push(`${pad(year, 4)}-${pad(month, 2)}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    if (months.length > 1200) break; // ~100 years; guard against bad input
  }
  return months;
}

function splitMonth(month: Month): [number, number] {
  return [Number(month.slice(0, 4)), Number(month.slice(5, 7))];
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/** A new prefixed id, e.g. newId('cls_') -> "cls_3f9a1c2b7d04". */
export function newId(prefix: string): string {
  const uuid =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  return `${prefix}${uuid.replace(/-/g, '').slice(0, 12)}`;
}

/** Current time as a full ISO 8601 timestamp. */
export function nowIso(): string {
  return new Date().toISOString();
}
