// Pure date helpers for building the ranges the views aggregate over. Calendar
// days are "YYYY-MM-DD" strings; arithmetic uses UTC so date-only math never
// drifts across DST. `todayIso` uses the LOCAL calendar day, since "today" for
// the daily flow (§11.3) means the teacher's local today.

import type { IsoDate, Month } from '../store';

/** The teacher's local calendar day as "YYYY-MM-DD". */
export function todayIso(): IsoDate {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** The month bucket a day belongs to: "YYYY-MM-DD" -> "YYYY-MM". */
export function monthKeyOf(date: IsoDate): Month {
  return date.slice(0, 7);
}

/** Shift a calendar day by `days` (may be negative), returning "YYYY-MM-DD". */
export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The start of the week containing `date`. `weekStartsOn` is 0 (Sunday) or 1
 * (Monday, the default).
 */
export function startOfWeek(date: IsoDate, weekStartsOn: 0 | 1 = 1): IsoDate {
  const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
  const delta = (dayOfWeek - weekStartsOn + 7) % 7;
  return addDays(date, -delta);
}

/** The inclusive 7-day week range containing `date`. */
export function weekRange(date: IsoDate, weekStartsOn: 0 | 1 = 1): { from: IsoDate; to: IsoDate } {
  const from = startOfWeek(date, weekStartsOn);
  return { from, to: addDays(from, 6) };
}

/** The inclusive first/last day of a month bucket ("YYYY-MM"). */
export function monthBounds(month: Month): { from: IsoDate; to: IsoDate } {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate(); // day 0 of next month
  return { from: `${month}-01`, to: `${month}-${pad2(lastDay)}` };
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
