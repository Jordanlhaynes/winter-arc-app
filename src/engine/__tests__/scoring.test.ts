import { dayNumberFor, isDayEditable, isDayLocked } from '../dates';
import { PHASES, phaseFor, progressToNext } from '../phases';
import { ArcLog, computeArc, PillarType, recoveryDayFor } from '../scoring';

const START = '2026-01-01';

/** Local time on day N of the cycle (day 1 = START). */
function at(day: number, hour = 9): Date {
  return new Date(2026, 0, day, hour, 0, 0);
}

function log(partial: Partial<ArcLog> = {}): ArcLog {
  return { startDate: START, completions: [], skips: [], recoveries: [], ...partial };
}

function done(pillar: PillarType, ...days: number[]) {
  return days.map((day) => ({ pillar, day }));
}

const ALL: PillarType[] = ['personal', 'physical', 'financial', 'career'];
function allDone(...days: number[]) {
  return ALL.flatMap((p) => done(p, ...days));
}

describe('dates', () => {
  it('numbers days from the start date', () => {
    expect(dayNumberFor(START, at(1))).toBe(1);
    expect(dayNumberFor(START, at(10, 23))).toBe(10);
  });

  it('locks a day at noon the following day', () => {
    expect(isDayLocked(START, 1, at(2, 11))).toBe(false);
    expect(isDayLocked(START, 1, at(2, 12))).toBe(true);
    expect(isDayEditable(START, 1, at(2, 11))).toBe(true);
    expect(isDayEditable(START, 2, at(1, 9))).toBe(false); // future
  });
});

describe('points', () => {
  it('earns 1 point per pillar per completed day', () => {
    const s = computeArc(log({ completions: allDone(1, 2, 3) }), at(4));
    expect(s.earned).toBe(12);
    expect(s.net).toBe(12);
  });

  it('caps at 400 for a perfect cycle', () => {
    const days = Array.from({ length: 100 }, (_, i) => i + 1);
    const s = computeArc(log({ completions: allDone(...days) }), at(120));
    expect(s.net).toBe(400);
    expect(s.phase.level).toBe(8);
    expect(s.isComplete).toBe(true);
  });

  it('does not count an unlocked day as missed', () => {
    const s = computeArc(log(), at(2, 11)); // day 1 still editable
    expect(s.pillars.physical.statuses[0]).toBe('pending');
    expect(s.pillars.physical.missStreak).toBe(0);
  });
});

describe('miss penalties', () => {
  it('forgives the first miss in a row', () => {
    // day 1 done, day 2 missed (locked at noon day 3)
    const s = computeArc(log({ completions: done('physical', 1) }), at(3, 13));
    expect(s.pillars.physical.statuses.slice(0, 2)).toEqual(['done', 'missed']);
    expect(s.pillars.physical.penalty).toBe(0);
    expect(s.pillars.physical.missStreak).toBe(1);
  });

  it('charges -1 for each further miss in a row', () => {
    // done, miss (forgiven), miss (-1), miss (-1)
    const s = computeArc(log({ completions: done('physical', 1) }), at(5, 13));
    expect(s.pillars.physical.penalty).toBe(2);
    expect(s.pillars.physical.net).toBe(-1);
  });

  it('resets the miss counter on completion', () => {
    // done, miss, done, miss -> both misses forgiven
    const s = computeArc(log({ completions: done('physical', 1, 3) }), at(5, 13));
    expect(s.pillars.physical.penalty).toBe(0);
  });

  it('never lets total net go below zero', () => {
    const s = computeArc(log(), at(20));
    expect(s.penalty).toBeGreaterThan(0);
    expect(s.net).toBe(0);
  });
});

describe('recovery', () => {
  it('offsets outstanding penalty points', () => {
    // done, miss, miss(-1), miss(-1); two make-ups on day 5
    const s = computeArc(
      log({
        completions: done('physical', 1, 5),
        recoveries: done('physical', 5, 5),
      }),
      at(5, 14),
    );
    expect(s.pillars.physical.penalty).toBe(2);
    expect(s.pillars.physical.recovered).toBe(2);
    expect(s.pillars.physical.outstanding).toBe(0);
    expect(s.pillars.physical.net).toBe(2);
  });

  it('cannot exceed outstanding penalty', () => {
    const s = computeArc(
      log({ completions: done('physical', 1, 2), recoveries: done('physical', 2, 2, 2) }),
      at(3),
    );
    expect(s.pillars.physical.recovered).toBe(0);
    expect(s.pillars.physical.net).toBe(2);
  });

  it('does not bank recovery before the penalty exists', () => {
    // make-up on day 1 cannot pay for penalties accrued later (days 1-3 missed => -2)
    const s = computeArc(log({ recoveries: done('physical', 1) }), at(4, 13));
    expect(s.pillars.physical.penalty).toBe(2);
    expect(s.pillars.physical.recovered).toBe(0);
  });
});

describe('skip days', () => {
  it('earns nothing and does not break streaks', () => {
    // done, skip, miss -> the miss is the first in a row, forgiven
    const s = computeArc(log({ completions: done('physical', 1), skips: [2] }), at(4, 13));
    expect(s.pillars.physical.statuses.slice(0, 3)).toEqual(['done', 'skipped', 'missed']);
    expect(s.pillars.physical.penalty).toBe(0);
    expect(s.pillars.physical.earned).toBe(1);
  });

  it('keeps a miss streak alive across a skip', () => {
    // miss, skip, miss -> second miss in a row costs a point
    const s = computeArc(log({ skips: [2] }), at(4, 13));
    expect(s.pillars.physical.penalty).toBe(1);
  });

  it('honors only the first 5 skips', () => {
    const s = computeArc(log({ skips: [1, 2, 3, 4, 5, 6, 7] }), at(10));
    expect(s.skipsUsed).toBe(5);
    expect(s.skipsLeft).toBe(0);
    expect(s.pillars.career.statuses[5]).toBe('missed'); // day 6 not skipped
  });
});

describe('phases', () => {
  it('maps thresholds to phases', () => {
    expect(phaseFor(0).level).toBe(1);
    expect(phaseFor(19).level).toBe(1);
    expect(phaseFor(20).level).toBe(2);
    expect(phaseFor(379).level).toBe(7);
    expect(phaseFor(380).level).toBe(8);
    expect(PHASES.map((p) => p.minPoints)).toEqual([0, 20, 40, 80, 120, 180, 290, 380]);
  });

  it('reports progress toward the next phase', () => {
    expect(progressToNext(60)).toBeCloseTo(0.5); // 40 -> 80
    expect(progressToNext(390)).toBeCloseTo(0.5); // final phase: 380 -> 400
    expect(progressToNext(400)).toBe(1);
  });

  it('reaches Grand Master on a flawless run that uses every skip', () => {
    const days = Array.from({ length: 95 }, (_, i) => i + 6); // days 1-5 skipped
    const s = computeArc(log({ completions: allDone(...days), skips: [1, 2, 3, 4, 5] }), at(120));
    expect(s.net).toBe(380);
    expect(s.phase.title).toBe('Grand Master');
  });

  it('demotes the avatar when penalties drop net below a threshold', () => {
    // 5 perfect days = 20 points (phase 2), then 2 days of misses on all pillars:
    // miss (forgiven), miss (-4) => 16 points
    const s = computeArc(log({ completions: allDone(1, 2, 3, 4, 5) }), at(8, 13));
    expect(s.net).toBe(16);
    expect(s.phase.level).toBe(1);
  });

  it('flags demotion risk', () => {
    // 20 points exactly (phase 2); on day 6 every pillar takes a forgiven first miss
    const s = computeArc(log({ completions: allDone(1, 2, 3, 4, 5) }), at(7, 13)); // day 6 just locked
    expect(s.net).toBe(20);
    expect(s.demotionRisk).toBe(true);
  });
});

describe('day summaries', () => {
  it('classifies days for the grid', () => {
    const s = computeArc(
      log({ completions: [...allDone(1), ...done('career', 2)], skips: [3] }),
      at(5, 13), // day 4 locked at noon, day 5 in progress
    );
    expect(s.days.slice(0, 6).map((d) => d.kind)).toEqual([
      'complete',
      'partial',
      'skipped',
      'missed',
      'pending',
      'future',
    ]);
  });
});

describe('final recovery grace period', () => {
  it('credits a morning make-up to day 100 and preserves the point after the Arc closes', () => {
    const day = recoveryDayFor(START, at(101, 11));
    expect(day).toBe(100);
    const facts = log({ completions: done('physical', 1), recoveries: done('physical', day!) });
    expect(computeArc(facts, at(101, 11)).pillars.physical.recovered).toBe(1);
    expect(computeArc(facts, at(101, 12)).pillars.physical.recovered).toBe(1);
  });

  it('rejects new recovery at the final cutoff and before the Arc begins', () => {
    expect(recoveryDayFor(START, at(101, 12))).toBeNull();
    expect(recoveryDayFor(START, new Date(2025, 11, 31, 12))).toBeNull();
  });
});
