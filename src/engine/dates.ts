// All dates are local calendar dates in "YYYY-MM-DD" form.
// Day numbers are 1-based: the cycle's start date is day 1.

export const CYCLE_LENGTH = 100;

// A day stays editable until this local hour on the following day.
export const EDIT_CUTOFF_HOUR = 12;

export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parts(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split('-').map(Number);
  return [y, m - 1, d];
}

/** Local Date at the given hour on (dateStr + offsetDays). Using noon-ish hours avoids DST edge cases. */
export function localDateAt(dateStr: string, offsetDays: number, hour: number): Date {
  const [y, m, d] = parts(dateStr);
  return new Date(y, m, d + offsetDays, hour, 0, 0, 0);
}

export function addDays(dateStr: string, days: number): string {
  return toDateString(localDateAt(dateStr, days, 12));
}

/** Day number of `now` within a cycle that started on `startDate`. Can be < 1 or > CYCLE_LENGTH. */
export function dayNumberFor(startDate: string, now: Date): number {
  const start = localDateAt(startDate, 0, 12).getTime();
  const today = localDateAt(toDateString(now), 0, 12).getTime();
  return Math.round((today - start) / 86_400_000) + 1;
}

export function dateForDay(startDate: string, dayNumber: number): string {
  return addDays(startDate, dayNumber - 1);
}

/** A day is locked (no more edits, incomplete tasks count as missed) from noon the next day. */
export function isDayLocked(startDate: string, dayNumber: number, now: Date): boolean {
  const lockAt = localDateAt(startDate, dayNumber, EDIT_CUTOFF_HOUR);
  return now.getTime() >= lockAt.getTime();
}

/** Day hasn't started yet. */
export function isDayInFuture(startDate: string, dayNumber: number, now: Date): boolean {
  return dayNumber > dayNumberFor(startDate, now);
}

export function isDayEditable(startDate: string, dayNumber: number, now: Date): boolean {
  return (
    dayNumber >= 1 &&
    dayNumber <= CYCLE_LENGTH &&
    !isDayInFuture(startDate, dayNumber, now) &&
    !isDayLocked(startDate, dayNumber, now)
  );
}
