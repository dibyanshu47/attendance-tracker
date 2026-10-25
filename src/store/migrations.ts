// Migration-on-read. Every file is written independently and lives in users'
// Drives beyond our control, so each read normalizes the raw JSON into the
// current typed shape (§4.4 — schemaVersion drives this and never crosses the
// interface). Only schemaVersion 1 exists today, so these are shape-guards;
// future versions add branches keyed on the stored schemaVersion.

import type { ClassId, ClassInfo, Month, Session, Student } from './types';
import { SCHEMA_VERSION, type StoredClassesFile, type StoredMonthFile, type StoredStudentsFile } from './internal';

export function migrateStudentsFile(raw: unknown): StoredStudentsFile {
  const obj = asRecord(raw);
  const source = Array.isArray(obj.students) ? obj.students : [];
  const students: Student[] = [];
  for (const entry of source) {
    if (!isRecord(entry)) continue;
    const id = asString(entry.id);
    if (!id) continue; // drop unidentifiable rows
    students.push({
      id,
      name: asString(entry.name),
      active: asBoolean(entry.active, true),
      addedAt: asString(entry.addedAt),
    });
  }
  return { schemaVersion: SCHEMA_VERSION, students };
}

export function migrateClassesFile(raw: unknown): StoredClassesFile {
  const obj = asRecord(raw);
  const source = Array.isArray(obj.classes) ? obj.classes : [];
  const classes: ClassInfo[] = [];
  for (const entry of source) {
    if (!isRecord(entry)) continue;
    const classId = asString(entry.classId);
    if (!classId) continue;
    classes.push({
      classId,
      name: asString(entry.name),
      createdAt: asString(entry.createdAt),
      memberIds: asStringArray(entry.memberIds),
    });
  }
  return { schemaVersion: SCHEMA_VERSION, classes };
}

/**
 * Normalize a month bucket. `classId`/`month` are passed in as the trusted
 * values (from the resolved file), used as fallbacks if the stored envelope is
 * missing or inconsistent.
 */
export function migrateMonthFile(raw: unknown, classId: ClassId, month: Month): StoredMonthFile {
  const obj = asRecord(raw);
  const rawSessions = isRecord(obj.sessions) ? obj.sessions : {};
  const sessions: Record<string, Session> = {};
  for (const [date, value] of Object.entries(rawSessions)) {
    if (!isRecord(value)) continue;
    sessions[date] = {
      present: asStringArray(value.present),
      absent: asStringArray(value.absent),
      markedAt: asString(value.markedAt),
    };
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    classId: asString(obj.classId) || classId,
    month: asString(obj.month) || month,
    sessions,
  };
}

// --- coercion helpers ---

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
