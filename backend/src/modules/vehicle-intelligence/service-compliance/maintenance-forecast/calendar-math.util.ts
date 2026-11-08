/** Calendar-correct date arithmetic (UTC) — no 30-day month approximations. */

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Adds whole calendar months; day-of-month is clamped to the target month's length. */
export function addCalendarMonths(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const targetMonthAbs = m + months;
  const targetYear = y + Math.floor(targetMonthAbs / 12);
  const targetMonth = ((targetMonthAbs % 12) + 12) % 12;
  const clampedDay = Math.min(d, daysInUtcMonth(targetYear, targetMonth));
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      clampedDay,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

/** Whole days from `from` to `to` (floor; negative when `to` is in the past). */
export function diffDays(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * Whole calendar months from `from` to `to`, truncated toward zero.
 * Example: 2026-01-15 → 2026-02-14 = 0, → 2026-02-15 = 1, → 2025-12-10 = -1.
 */
export function diffCalendarMonths(from: Date, to: Date): number {
  const sign = to.getTime() >= from.getTime() ? 1 : -1;
  const [a, b] = sign === 1 ? [from, to] : [to, from];
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (addCalendarMonths(a, months).getTime() > b.getTime()) {
    months -= 1;
  }
  return sign * Math.max(0, months);
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
