// GoogleDriveStore — the MVP AttendanceStore implementation (§10). All Drive
// specifics (URLs, auth, month-bucketing, file envelopes, migration) live here
// and below; callers work purely in domain terms.
//
// Consistency model (§7, single-teacher): dimension files (students/classes)
// are read-modify-write without optimistic concurrency; the month fact files
// use If-Match so a concurrent re-mark surfaces as StoreConflictError. There
// are no cross-file transactions — callers follow the write-order rule
// (addStudent before setMembership), and membership ids with no student are
// tolerated as soft-ignored orphans.

import type { DriveTokenProvider } from '../auth';
import type { AttendanceStore } from './AttendanceStore';
import type { ClassId, ClassInfo, IsoDate, Month, Session, Student, StudentId } from './types';
import { SCHEMA_VERSION, type StoredClassesFile, type StoredMonthFile, type StoredStudentsFile } from './internal';
import { DriveClient } from './drive/driveClient';
import {
  CLASSES_FILE,
  STUDENTS_FILE,
  enumerateMonths,
  monthFileName,
  monthOf,
  newId,
  nowIso,
} from './drive/layout';
import { migrateClassesFile, migrateMonthFile, migrateStudentsFile } from './migrations';

export class GoogleDriveStore implements AttendanceStore {
  private readonly drive: DriveClient;

  // Cached Drive file ids (ids are stable; file content is always re-read).
  private studentsFileId: string | null = null;
  private classesFileId: string | null = null;
  private readonly monthFileIds = new Map<string, string>();

  constructor(tokens: DriveTokenProvider) {
    this.drive = new DriveClient(tokens);
  }

  // --- classes ---

  async listClasses(): Promise<ClassInfo[]> {
    return (await this.loadClasses()).classes;
  }

  async createClass(name: string): Promise<ClassInfo> {
    const file = await this.loadClasses();
    const created: ClassInfo = {
      classId: newId('cls_'),
      name,
      createdAt: nowIso(),
      memberIds: [],
    };
    file.classes.push(created);
    await this.saveClasses(file);
    return created;
  }

  async renameClass(classId: ClassId, name: string): Promise<void> {
    const file = await this.loadClasses();
    const target = file.classes.find((c) => c.classId === classId);
    if (!target) throw new Error(`Class not found: ${classId}`);
    target.name = name;
    await this.saveClasses(file);
  }

  async deleteClass(classId: ClassId): Promise<void> {
    const file = await this.loadClasses();
    file.classes = file.classes.filter((c) => c.classId !== classId);
    await this.saveClasses(file);

    // Best-effort cleanup of this class's month buckets. The class metadata is
    // already gone, so leftover files are harmless if cleanup fails.
    for (const key of [...this.monthFileIds.keys()]) {
      if (key.startsWith(`${classId}:`)) this.monthFileIds.delete(key);
    }
    try {
      const orphans = await this.drive.listFiles(
        `appProperties has { key='classId' and value='${classId}' } and trashed = false`,
      );
      await Promise.all(orphans.map((f) => this.drive.deleteFile(f.id)));
    } catch {
      // leave orphan buckets; they are unreferenced and invisible
    }
  }

  // --- students ---

  async listStudents(): Promise<Student[]> {
    return (await this.loadStudents()).students;
  }

  async addStudent(name: string): Promise<Student> {
    const file = await this.loadStudents();
    const created: Student = {
      id: newId('stu_'),
      name,
      active: true,
      addedAt: nowIso(),
    };
    file.students.push(created);
    await this.saveStudents(file);
    return created;
  }

  async renameStudent(studentId: StudentId, name: string): Promise<void> {
    const file = await this.loadStudents();
    const target = file.students.find((s) => s.id === studentId);
    if (!target) throw new Error(`Student not found: ${studentId}`);
    target.name = name;
    await this.saveStudents(file);
  }

  async deactivateStudent(studentId: StudentId): Promise<void> {
    const file = await this.loadStudents();
    const target = file.students.find((s) => s.id === studentId);
    if (!target) throw new Error(`Student not found: ${studentId}`);
    target.active = false; // soft delete; past sessions keep referencing the id
    await this.saveStudents(file);
  }

  // --- membership ---

  async setMembership(classId: ClassId, studentIds: StudentId[]): Promise<void> {
    const file = await this.loadClasses();
    const target = file.classes.find((c) => c.classId === classId);
    if (!target) throw new Error(`Class not found: ${classId}`);
    target.memberIds = [...new Set(studentIds)];
    await this.saveClasses(file);
  }

  // --- sessions ---

  async markSession(
    classId: ClassId,
    date: IsoDate,
    marks: { present: StudentId[]; absent: StudentId[] },
  ): Promise<void> {
    const month = monthOf(date);
    const session: Session = {
      present: [...marks.present],
      absent: [...marks.absent],
      markedAt: nowIso(),
    };

    const existingId = await this.resolveMonthFileId(classId, month);
    if (!existingId) {
      const file: StoredMonthFile = {
        schemaVersion: SCHEMA_VERSION,
        classId,
        month,
        sessions: { [date]: session },
      };
      const meta = await this.drive.createJsonFile(monthFileName(classId, month), JSON.stringify(file), {
        classId,
        month,
      });
      this.monthFileIds.set(this.monthKey(classId, month), meta.id);
      return;
    }

    const { raw, etag } = await this.drive.downloadJson(existingId);
    const file = migrateMonthFile(raw, classId, month);
    file.sessions[date] = session;
    // If-Match on the month file: a 412 bubbles up as StoreConflictError.
    await this.drive.updateJsonFile(existingId, JSON.stringify(file), etag);
  }

  async getMonth(classId: ClassId, month: Month): Promise<Record<IsoDate, Session> | null> {
    const id = await this.resolveMonthFileId(classId, month);
    if (!id) return null; // no bucket yet — not an error
    const { raw } = await this.drive.downloadJson(id);
    return migrateMonthFile(raw, classId, month).sessions;
  }

  async getRange(classId: ClassId, from: IsoDate, to: IsoDate): Promise<Record<IsoDate, Session>> {
    const merged: Record<IsoDate, Session> = {};
    for (const month of enumerateMonths(monthOf(from), monthOf(to))) {
      const sessions = await this.getMonth(classId, month);
      if (sessions) Object.assign(merged, sessions); // date keys are globally unique
    }
    return merged;
  }

  // --- dimension file I/O ---

  private async loadStudents(): Promise<StoredStudentsFile> {
    const id = await this.resolveStudentsId();
    if (!id) return { schemaVersion: SCHEMA_VERSION, students: [] };
    const { raw } = await this.drive.downloadJson(id);
    return migrateStudentsFile(raw);
  }

  private async saveStudents(file: StoredStudentsFile): Promise<void> {
    const id = await this.resolveStudentsId();
    const content = JSON.stringify(file);
    if (id) {
      await this.drive.updateJsonFile(id, content);
    } else {
      const meta = await this.drive.createJsonFile(STUDENTS_FILE, content);
      this.studentsFileId = meta.id;
    }
  }

  private async loadClasses(): Promise<StoredClassesFile> {
    const id = await this.resolveClassesId();
    if (!id) return { schemaVersion: SCHEMA_VERSION, classes: [] };
    const { raw } = await this.drive.downloadJson(id);
    return migrateClassesFile(raw);
  }

  private async saveClasses(file: StoredClassesFile): Promise<void> {
    const id = await this.resolveClassesId();
    const content = JSON.stringify(file);
    if (id) {
      await this.drive.updateJsonFile(id, content);
    } else {
      const meta = await this.drive.createJsonFile(CLASSES_FILE, content);
      this.classesFileId = meta.id;
    }
  }

  // --- file id resolution (cached) ---

  private async resolveStudentsId(): Promise<string | null> {
    if (this.studentsFileId) return this.studentsFileId;
    this.studentsFileId = await this.resolveByName(STUDENTS_FILE);
    return this.studentsFileId;
  }

  private async resolveClassesId(): Promise<string | null> {
    if (this.classesFileId) return this.classesFileId;
    this.classesFileId = await this.resolveByName(CLASSES_FILE);
    return this.classesFileId;
  }

  private async resolveMonthFileId(classId: ClassId, month: Month): Promise<string | null> {
    const key = this.monthKey(classId, month);
    const cached = this.monthFileIds.get(key);
    if (cached) return cached;
    const id = await this.resolveByName(monthFileName(classId, month));
    if (id) this.monthFileIds.set(key, id);
    return id;
  }

  private async resolveByName(name: string): Promise<string | null> {
    const files = await this.drive.listFiles(`name = '${name}' and trashed = false`);
    return files[0]?.id ?? null;
  }

  private monthKey(classId: ClassId, month: Month): string {
    return `${classId}:${month}`;
  }
}
