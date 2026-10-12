import { CYCLE_LENGTH, dayNumberFor, isDayLocked } from './dates';
import { Phase, phaseFor } from './phases';

export const PILLARS = ['personal', 'physical', 'financial', 'career'] as const;
export type PillarType = (typeof PILLARS)[number];

export const MAX_SKIPS = 5;

export type PillarDayStatus = 'done' | 'missed' | 'skipped' | 'pending' | 'future';

/** The raw facts stored on device. Everything else is derived. */
export type ArcLog = {
  startDate: string;
  completions: { pillar: PillarType; day: number }[];
  skips: number[];
  /** Make-up work (backlogged or bonus task). `day` is the day it was performed. */
  recoveries: { pillar: PillarType; day: number }[];
};

export type PillarScore = {
  earned: number;
  penalty: number;
  recovered: number;
  /** Penalty points not yet worked off. Recovery only counts while this is > 0. */
  outstanding: number;
  net: number;
  /** Consecutive locked misses right now. 1 means the next miss costs a point. */
  missStreak: number;
  currentStreak: number;
  bestStreak: number;
  /** Index 0 = day 1. */
  statuses: PillarDayStatus[];
};

export type DaySummary = {
  day: number;
  kind: 'complete' | 'partial' | 'missed' | 'skipped' | 'pending' | 'future';
  doneCount: number;
};

export type ArcScore = {
  currentDay: number;
  isComplete: boolean;
  pillars: Record<PillarType, PillarScore>;
  earned: number;
  penalty: number;
  recovered: number;
  net: number;
  phase: Phase;
  skipsUsed: number;
  skipsLeft: number;
  /** Skip days actually honored (first MAX_SKIPS by day). */
  skipDays: Set<number>;
  days: DaySummary[];
  /** The next repeat miss would drop the avatar a phase. */
  demotionRisk: boolean;
};

export function computeArc(log: ArcLog, now: Date): ArcScore {
  const currentDay = dayNumberFor(log.startDate, now);
  const lastDay = Math.min(CYCLE_LENGTH, currentDay);

  const skipDays = new Set(
    [...new Set(log.skips)]
      .filter((d) => d >= 1 && d <= CYCLE_LENGTH)
      .sort((a, b) => a - b)
      .slice(0, MAX_SKIPS),
  );

  const doneSet = new Set(log.completions.map((c) => `${c.pillar}:${c.day}`));
  const recoveriesByDay = new Map<string, number>();
  for (const r of log.recoveries) {
    const key = `${r.pillar}:${r.day}`;
    recoveriesByDay.set(key, (recoveriesByDay.get(key) ?? 0) + 1);
  }

  const pillars = {} as Record<PillarType, PillarScore>;

  for (const pillar of PILLARS) {
    const s: PillarScore = {
      earned: 0,
      penalty: 0,
      recovered: 0,
      outstanding: 0,
      net: 0,
      missStreak: 0,
      currentStreak: 0,
      bestStreak: 0,
      statuses: [],
    };

    for (let day = 1; day <= CYCLE_LENGTH; day++) {
      if (day > lastDay) {
        s.statuses.push('future');
        continue;
      }

      let status: PillarDayStatus;
      if (skipDays.has(day)) {
        status = 'skipped'; // neutral: no points, streaks untouched
      } else if (doneSet.has(`${pillar}:${day}`)) {
        status = 'done';
        s.earned += 1;
        s.missStreak = 0;
        s.currentStreak += 1;
        s.bestStreak = Math.max(s.bestStreak, s.currentStreak);
      } else if (isDayLocked(log.startDate, day, now)) {
        status = 'missed';
        s.missStreak += 1;
        s.currentStreak = 0;
        if (s.missStreak >= 2) s.penalty += 1; // first miss in a row is forgiven
      } else {
        status = 'pending';
      }
      s.statuses.push(status);

      // Make-up work done on this day offsets penalties accrued so far, never beyond them.
      const recoveries = recoveriesByDay.get(`${pillar}:${day}`) ?? 0;
      const applied = Math.min(recoveries, s.penalty - s.recovered);
      s.recovered += applied;
    }

    s.outstanding = s.penalty - s.recovered;
    s.net = s.earned - s.outstanding;
    pillars[pillar] = s;
  }

  let earned = 0;
  let penalty = 0;
  let recovered = 0;
  for (const p of PILLARS) {
    earned += pillars[p].earned;
    penalty += pillars[p].penalty;
    recovered += pillars[p].recovered;
  }
  const net = Math.max(0, earned - penalty + recovered);
  const phase = phaseFor(net);

  const days: DaySummary[] = [];
  for (let day = 1; day <= CYCLE_LENGTH; day++) {
    const statuses = PILLARS.map((p) => pillars[p].statuses[day - 1]);
    const doneCount = statuses.filter((st) => st === 'done').length;
    let kind: DaySummary['kind'];
    if (statuses[0] === 'future') kind = 'future';
    else if (statuses[0] === 'skipped') kind = 'skipped';
    else if (doneCount === PILLARS.length) kind = 'complete';
    else if (statuses.includes('pending')) kind = 'pending';
    else if (doneCount > 0) kind = 'partial';
    else kind = 'missed';
    days.push({ day, kind, doneCount });
  }

  const anyPillarAtRisk = PILLARS.some((p) => pillars[p].missStreak >= 1);
  const demotionRisk = phase.level > 1 && anyPillarAtRisk && net - 1 < phase.minPoints;

  return {
    currentDay,
    isComplete: isDayLocked(log.startDate, CYCLE_LENGTH, now),
    pillars,
    earned,
    penalty,
    recovered,
    net,
    phase,
    skipsUsed: skipDays.size,
    skipsLeft: MAX_SKIPS - skipDays.size,
    skipDays,
    days,
    demotionRisk,
  };
}
