import { useMemo } from 'react';
import { create } from 'zustand';

import { migrate } from '@/db/client';
import * as repo from '@/db/repo';
import { isDayEditable, toDateString } from '@/engine/dates';
import { ArcScore, computeArc, PillarType, recoveryDayFor } from '@/engine/scoring';
import { cancelScheduledBackup, scheduleBackup } from '@/sync/backup';

type ArcState = {
  loaded: boolean;
  data: repo.ArcData | null;
  /** Ticks every minute so day locks and "today" stay current. */
  now: Date;

  init: () => void;
  tick: () => void;
  /** Re-read everything from the DB (e.g. after restoring a backup). */
  reloadFromDb: () => void;
  startArc: (goals: repo.Goals) => void;
  toggleDone: (pillar: PillarType, day: number) => void;
  setSkip: (day: number, skipped: boolean) => void;
  makeUp: (pillar: PillarType, forDay: number | null) => void;
  editTask: (pillar: PillarType, day: number, title: string) => void;
  finishArc: () => void;
  resetAll: () => void;
};

function reload(): repo.ArcData | null {
  const cycle = repo.getActiveCycle();
  return cycle ? repo.loadArc(cycle) : null;
}

export const useArcStore = create<ArcState>((set, get) => {
  /** Run a write against the active cycle, then refresh from the DB. */
  const write = (fn: (cycleId: string) => void) => {
    const data = get().data;
    if (!data) return;
    fn(data.cycle.id);
    set({ data: reload(), now: new Date() });
    scheduleBackup();
  };

  const editable = (day: number) => {
    const data = get().data;
    return !!data && isDayEditable(data.cycle.startDate, day, new Date());
  };

  return {
    loaded: false,
    data: null,
    now: new Date(),

    init: () => {
      migrate();
      set({ loaded: true, data: reload(), now: new Date() });
    },

    tick: () => set({ now: new Date() }),

    reloadFromDb: () => set({ data: reload(), now: new Date() }),

    startArc: (goals) => {
      repo.createCycle(toDateString(new Date()), goals);
      set({ data: reload(), now: new Date() });
      scheduleBackup();
    },

    toggleDone: (pillar, day) => {
      if (!editable(day)) return;
      const done = get().data!.log.completions.some((c) => c.pillar === pillar && c.day === day);
      write((id) => repo.setCompletion(id, pillar, day, !done));
    },

    setSkip: (day, skipped) => {
      if (!editable(day)) return;
      write((id) => repo.setSkip(id, day, skipped));
    },

    makeUp: (pillar, forDay) => {
      const data = get().data;
      if (!data) return;
      const day = recoveryDayFor(data.cycle.startDate, new Date());
      if (day === null) return;
      write((id) => repo.addRecovery(id, pillar, day, forDay));
    },

    editTask: (pillar, day, title) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      write((id) => repo.saveTask(id, pillar, day, { title: trimmed, detail: null, source: 'user' }));
    },

    finishArc: () => write((id) => repo.completeCycle(id)),

    resetAll: () => {
      // A change made seconds ago may still have a backup queued; it must not upload the now-empty database.
      cancelScheduledBackup();
      repo.deleteAllData();
      set({ data: null, now: new Date() });
    },
  };
});

/** Derived score for the active Arc, recomputed when data or the clock changes. */
export function useScore(): ArcScore | null {
  const data = useArcStore((s) => s.data);
  const now = useArcStore((s) => s.now);
  return useMemo(() => (data ? computeArc(data.log, now) : null), [data, now]);
}

export function taskFor(data: repo.ArcData, pillar: PillarType, day: number): repo.Task {
  return (
    data.tasks[`${pillar}:${day}`] ?? {
      title: `Take one step toward: ${data.goals[pillar]}`,
      detail: null,
      source: 'user',
    }
  );
}

/** Missed days for a pillar that haven't been made up yet, oldest first. */
export function backlogFor(data: repo.ArcData, score: ArcScore, pillar: PillarType): number[] {
  const madeUp = new Set(data.madeUpDays[pillar]);
  return score.pillars[pillar].statuses
    .map((st, i) => (st === 'missed' ? i + 1 : 0))
    .filter((d) => d > 0 && !madeUp.has(d));
}
