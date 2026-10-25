// Domain types for the attendance store — the vocabulary callers work in.
// Mirrors docs/architecture.md §10 ("domain aliases" + "entities") and the
// on-disk shapes in §4.3. File layout and month-bucketing are NOT expressed
// here; they are internal to GoogleDriveStore (see ./internal.ts).

// --- domain aliases ---
export type StudentId = string;
export type ClassId = string;
/** A calendar day, formatted "YYYY-MM-DD". */
export type IsoDate = string;
/** A month bucket key, formatted "YYYY-MM". */
export type Month = string;
/** A full ISO 8601 timestamp. */
export type IsoTimestamp = string;

// --- entities ---

/** A teacher-level student. Shared across classes; referenced by stable id so
 *  renaming never breaks attendance history. Soft-deleted via `active: false`. */
export interface Student {
  id: StudentId;
  name: string;
  active: boolean;
  addedAt: IsoTimestamp;
}

/** Class metadata plus its many-to-many membership list of student ids. */
export interface ClassInfo {
  classId: ClassId;
  name: string;
  createdAt: IsoTimestamp;
  memberIds: StudentId[];
}

/** One day's marking for one class. A student in neither list was not marked
 *  that day (not-yet-marked / not eligible), per §4.4. */
export interface Session {
  present: StudentId[];
  absent: StudentId[];
  markedAt: IsoTimestamp;
}
