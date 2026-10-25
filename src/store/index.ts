// Public store surface. Everything the UI and views may import lives here.
// The on-disk envelopes (./internal.ts) are intentionally NOT re-exported:
// schemaVersion and file layout never cross this boundary.

export type {
  StudentId,
  ClassId,
  IsoDate,
  Month,
  IsoTimestamp,
  Student,
  ClassInfo,
  Session,
} from './types';

export type { AttendanceStore } from './AttendanceStore';

export { StoreConflictError, StoreAuthError } from './errors';

export { GoogleDriveStore } from './GoogleDriveStore';
