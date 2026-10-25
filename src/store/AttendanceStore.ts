// The contract the UI and views code against (docs/architecture.md §10).
// GoogleDriveStore implements it; a future ServerStore (§8) can implement the
// same surface with no change to callers. Month-bucketing and the file
// envelope stay internal to the implementation — callers work in domain terms
// (class, student, date) only.
//
// Errors: mutating/reading methods may reject with StoreConflictError (a 412
// optimistic-concurrency conflict on a month file) or StoreAuthError (a failed
// silent token re-grant). See ./errors.ts.

import type { ClassId, ClassInfo, IsoDate, Month, Session, Student, StudentId } from './types';

export interface AttendanceStore {
  // --- classes ---
  listClasses(): Promise<ClassInfo[]>;
  createClass(name: string): Promise<ClassInfo>;
  renameClass(classId: ClassId, name: string): Promise<void>;
  deleteClass(classId: ClassId): Promise<void>;

  // --- students (teacher-wide directory, shared across classes) ---
  listStudents(): Promise<Student[]>;
  addStudent(name: string): Promise<Student>;
  renameStudent(studentId: StudentId, name: string): Promise<void>;
  /** Soft delete (sets `active: false`); never removes the student, so past
   *  sessions referencing them stay intact (§4.4). */
  deactivateStudent(studentId: StudentId): Promise<void>;

  // --- membership (many-to-many) ---
  /** Replace the full enrolled-student set for a class (enroll/unenroll). */
  setMembership(classId: ClassId, studentIds: StudentId[]): Promise<void>;

  // --- sessions (month-bucketing is internal; callers never see the envelope) ---

  /**
   * Resolve `date → month`, load (or create) that month's bucket, overwrite the
   * date's Session, bump `markedAt`, and write with `If-Match` on the file etag.
   * A 412 surfaces as StoreConflictError (caller re-reads and reapplies).
   */
  markSession(
    classId: ClassId,
    date: IsoDate,
    marks: { present: StudentId[]; absent: StudentId[] },
  ): Promise<void>;

  /**
   * Return one month's `date → Session` map, or `null` (not an error) when the
   * month file does not exist yet. The StoredMonthFile envelope is stripped and
   * migration-on-read has already normalized the shape.
   */
  getMonth(classId: ClassId, month: Month): Promise<Record<IsoDate, Session> | null>;

  /**
   * Enumerate every month from `from` to `to` inclusive, fetch each bucket
   * (skipping missing ones), and return a single merged `date → Session` map
   * (date keys are globally unique, so merging is lossless). Empty object if
   * nothing is recorded in the range. Views filter to the exact day range;
   * partial start/end months are expected.
   */
  getRange(classId: ClassId, from: IsoDate, to: IsoDate): Promise<Record<IsoDate, Session>>;
}
