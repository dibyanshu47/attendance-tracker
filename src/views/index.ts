// Pure view/aggregation layer (§5). No Drive, no React — just functions over
// the session maps the store returns, plus the date helpers to build ranges.

export type { DayRoster, DaySummary, StudentRate } from './types';

export {
  dailyView,
  weeklyView,
  monthlyView,
  summarizeRange,
  classMetDates,
  classMetDays,
  studentRates,
} from './attendance';

export { todayIso, monthKeyOf, addDays, startOfWeek, weekRange, monthBounds } from './dates';
