// INTERNAL to the store implementation (GoogleDriveStore) — the on-disk file
// envelopes from §4.3 / §10. `schemaVersion` drives migration-on-read and
// never crosses the AttendanceStore interface, so these types are deliberately
// NOT re-exported from ./index.ts. Only the store implementation imports them.

import type { ClassId, ClassInfo, IsoDate, Month, Session, Student } from './types';

/** The schema version this build writes to every new/updated file. */
export const SCHEMA_VERSION = 1;

/** `sessions-{classId}-{YYYY-MM}.json` — one month bucket of marks for one class. */
export interface StoredMonthFile {
  schemaVersion: number;
  classId: ClassId;
  month: Month;
  sessions: Record<IsoDate, Session>;
}

/** `students.json` — the teacher-wide student directory. */
export interface StoredStudentsFile {
  schemaVersion: number;
  students: Student[];
}

/** `classes.json` — class metadata + many-to-many membership. */
export interface StoredClassesFile {
  schemaVersion: number;
  classes: ClassInfo[];
}
