# Attendance Tracker — Architecture & Data Model (MVP)

## 1. Overview

A browser-only web app that lets an independent teacher track class attendance, with all data stored in the teacher's own Google Drive. No backend, no database, no stored user data on our side. Design goal: **zero infrastructure cost and zero data liability**.

## 2. Goals and non-goals

**Goals**
- Teacher signs in with Google and creates one or more classes.
- Teacher enters students manually; a student may belong to multiple classes.
- Teacher marks present/absent per class session (typically daily).
- Teacher views attendance per student across daily / weekly / monthly ranges.
- All persistent data lives in the teacher's Google Drive (`appDataFolder`).

**Non-goals (out for MVP)**
- Multi-teacher or school/institution accounts.
- Shared data across users; student-facing access.
- Server-side processing, background jobs, notifications.
- Audit trail beyond "who was marked what on a date, last edited when."

## 3. Architecture

### 3.1 Components

| Component | Responsibility | Hosting / Cost |
|---|---|---|
| Static SPA (React/Svelte/vanilla) | All UI, logic, aggregation | Static host (GitHub/Cloudflare Pages) — free |
| Google Identity Services (GIS) | Authentication (ID token) + authorization (access token) | Google — free |
| Google Drive API (`appDataFolder`) | Persistent JSON storage | User's Drive — free |
| Storage adapter (in-app) | Abstracts all persistence behind one interface | n/a |

No server tier. The browser talks directly to Google APIs with a short-lived access token held in memory.

### 3.2 Data flow

```
Teacher ──► SPA (browser)
              │  1. Sign In With Google  → ID token (identity: sub, name, email)
              │  2. On first write action → OAuth access token (scope: drive.appdata)
              │
              ├──► Drive API: read/write dimension + session files
              │
              └──► Views (daily/weekly/monthly) computed in-memory from loaded JSON
```

- Identity (`sub`) is the stable teacher key; Drive scoping isolates one teacher's data from another's.
- Access token re-acquired silently on reload/expiry; never persisted.

### 3.3 Storage abstraction (key architectural decision)

All persistence goes through one `AttendanceStore` interface so Google-specific logic never leaks into UI or view code. MVP ships `GoogleDriveStore`; the eventual school mode adds `ServerStore` with no change elsewhere. File layout and month-bucketing are internal to the store — callers work in domain terms (class, student, date).

Conceptual surface:
- `listClasses()` / `createClass(name)` / `renameClass(id, name)` / `deleteClass(id)`
- `listStudents()` / `addStudent(name)` / `renameStudent(id, name)` / `deactivateStudent(id)`
- `setMembership(classId, studentIds[])` — enroll/unenroll (many-to-many)
- `markSession(classId, date, {present[], absent[]})` — resolves date → month bucket internally
- `getMonth(classId, "YYYY-MM")` / `getRange(classId, from, to)` — fetches the 1–N buckets a range spans

Views are pure functions over data returned by the store; they are not part of it.

## 4. Data model

### 4.1 Entities and relationships

```
Teacher (identity only, not stored by us)
   │ owns
   ├──────────► Student   (teacher-level directory)
   │                 ▲
   │                 │ many-to-many (membership)
   ├──────────► Class ────────────────┘
   │                 │ has (1:N, partitioned by month)
   │                 ▼
   └──────────► Session  (keyed by date, inside a month bucket)
                         └── references Students by id (present / absent)
```

- **Teacher** is not a stored entity; identity comes from the Google ID token at runtime.
- **Student** is a teacher-level entity and **may belong to multiple classes**. Referenced by stable id so renaming never breaks history.
- **Class** holds metadata and a membership list of student ids.
- **Session** is one day's marking for one class, stored inside that class's month bucket.

### 4.2 Storage layout

Two small **dimension** files plus **partitioned fact** files:

```
appDataFolder/
├── students.json                      # dimension: all students for this teacher
├── classes.json                       # dimension: class metadata + membership
└── sessions-{classId}-{YYYY-MM}.json  # fact: one month of marks for one class
```

Rationale:
- Dimension files change rarely (new student, new class, membership edit), so rewriting them whole is cheap.
- Sessions are partitioned **by month** because attendance is marked continuously and would otherwise grow unbounded in a single file. Month buckets bound write size (~12 KB) and isolate writes, while mapping 1:1 onto the monthly view. Per-day files were rejected as over-decomposition (monthly view would fetch ~25 files).
- Each session file is tagged with `appProperties` (`classId`, `month`) so its Drive file id can be resolved by query and then cached.

### 4.3 Logical shapes

```
// students.json — teacher-wide directory
{
  schemaVersion: 1,
  students: [
    { id: "stu_a1", name: "Riya", active: true, addedAt: ISO }
  ]
}

// classes.json — metadata + many-to-many membership
{
  schemaVersion: 1,
  classes: [
    {
      classId:   "cls_karate",
      name:      "Karate - Tue/Thu 6pm",
      createdAt: ISO,
      memberIds: ["stu_a1", "stu_b2"]   // students enrolled in THIS class
    }
  ]
}

// sessions-cls_karate-2026-10.json — one month of attendance for one class
{
  schemaVersion: 1,
  classId: "cls_karate",
  month:   "2026-10",
  sessions: {
    "2026-10-25": { present: ["stu_a1"], absent: ["stu_b2"], markedAt: ISO }
  }
}
```

### 4.4 Modeling decisions

- **Students promoted to a shared dimension.** A student in three classes exists once and appears in three `memberIds` lists. Class membership is many-to-many.
- **Sessions partitioned by month, in their own files.** Kills write amplification (marking a day no longer rewrites all history) and tightens the concurrency window.
- **Date-keyed sessions map within a bucket.** O(1) lookup/overwrite per date; one session per class per date (see §7 default).
- **Present/absent as explicit id lists.** A student in neither list = "not yet marked / not eligible that day," cleanly handling mid-term joiners. (Adding "late"/"excused" later turns this into a status map — a likely v2 change.)
- **Soft delete via `active: false`.** Removing a student must not corrupt past sessions referencing them.
- **`schemaVersion` on every file.** Each file is written independently and lives in users' Drives beyond our control, so each must self-describe its version for safe migration on read.

## 5. Views (derived, not stored)

Computed client-side from loaded files:
- **Daily** — one date's present/absent roster for a class (one month bucket).
- **Weekly** — a 7-day range; 1–2 month buckets.
- **Monthly** — one bucket; maps 1:1 onto a single session file.
- **Per-student rate over a range** = (sessions present) / (dates the class met while the student was active), where "dates the class met" = dates present as keys across the relevant buckets.

No redundant Drive calls; the store fetches only the buckets a range spans, and aggregation is instant at this data size.

## 6. Security & privacy posture

- Non-sensitive OAuth scopes only (`openid`, `email`, `profile`, `drive.appdata`) — no paid verification.
- Access token kept in memory, never in `localStorage`/cookies; silent re-grant on reload; revoked on logout.
- We store no PII — student names live solely in the teacher's Drive.
- **Lock-in mitigation:** `appDataFolder` is invisible to the teacher, so provide an export (raw JSON and/or on-demand Google Sheet) so they always retain their data.

## 7. Resolved defaults & open questions

| Area | Decision | Status |
|---|---|---|
| Session granularity | One session per class per date; editable later (re-mark overwrites, `markedAt` updates) | **Default applied** — confirm |
| View denominator | Rate counts only dates with a recorded session (days the class actually met) | **Default applied** — confirm |
| Concurrent writes | Disable submit during write; add etag/`If-Match` optimistic concurrency on the month file | To implement |
| Cross-file consistency | No transactions across files; write `students.json` before membership, treat membership ids with no student as soft-ignored orphans | Accepted for single-teacher |
| Data invisibility | `appDataFolder` not visible to teacher | Mitigate via export; or switch to `drive.file` |
| Token lifetime | 1-hour tokens, no refresh token (no backend) | Acceptable — app only acts while teacher present |

## 8. Future: school/college mode (not built now)

- Add `ServerStore` behind the same `AttendanceStore` interface: small API + managed DB (Firestore free tier as pragmatic first choice).
- Introduces roles (admin/teacher), shared class data, and makes us the data custodian — accepted trade-off at that stage.
- SPA, data model, and views remain unchanged; only the store implementation swaps. The dimension/fact split maps cleanly onto relational tables (`students`, `classes`, `class_members`, `sessions`).
