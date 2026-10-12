export type Phase = {
  level: number;
  title: string;
  minPoints: number;
  /** Text-only fallback; the art lives in assets/avatars/phase-N.png (see ui/PhaseAvatar). */
  emoji: string;
};

/** Points available in a perfect cycle (4 pillars x 100 days). */
export const MAX_POINTS = 400;

/**
 * Sliding scale: phases 1-2 span 20 pts each, 3-4 span 40, 5 spans 60,
 * 6 spans 110 and 7 spans 90. Grand Master sits at 380 so a flawless run
 * that uses all 5 skip days (5 x 4 = 20 pts unearned) still reaches it.
 */
export const PHASES: readonly Phase[] = [
  { level: 1, title: 'Grifter', minPoints: 0, emoji: '🪙' },
  { level: 2, title: 'Servant', minPoints: 20, emoji: '🧹' },
  { level: 3, title: 'Stable Hand', minPoints: 40, emoji: '🐴' },
  { level: 4, title: 'Blacksmith', minPoints: 80, emoji: '⚒️' },
  { level: 5, title: 'Soldier', minPoints: 120, emoji: '🛡️' },
  { level: 6, title: 'Knight', minPoints: 180, emoji: '⚔️' },
  { level: 7, title: 'King', minPoints: 290, emoji: '👑' },
  { level: 8, title: 'Grand Master', minPoints: 380, emoji: '🧙' },
];

export function phaseFor(netPoints: number): Phase {
  let current = PHASES[0];
  for (const p of PHASES) {
    if (netPoints >= p.minPoints) current = p;
  }
  return current;
}

export function nextPhase(phase: Phase): Phase | null {
  return PHASES[phase.level] ?? null;
}

/** 0..1 progress from the current phase threshold to the next one (or to MAX_POINTS in the final phase). */
export function progressToNext(netPoints: number): number {
  const current = phaseFor(netPoints);
  const ceiling = nextPhase(current)?.minPoints ?? MAX_POINTS;
  return Math.min(1, (netPoints - current.minPoints) / (ceiling - current.minPoints));
}
