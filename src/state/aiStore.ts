import { create } from 'zustand';

import * as repo from '@/db/repo';
import { CYCLE_LENGTH } from '@/engine/dates';
import { nextPhase } from '@/engine/phases';
import { ArcScore, computeArc, PILLARS, PillarType } from '@/engine/scoring';
import { requestCoach, requestPlan } from '@/sync/ai';
import { scheduleBackup } from '@/sync/backup';

import { taskFor, useArcStore } from './arcStore';

/** Ask for the next batch when fewer than this many upcoming days are planned. */
const PLAN_AHEAD_DAYS = 3;
const BATCH_DAYS = 10;

export function coachSlotFor(now: Date): repo.CoachSlot {
  return now.getHours() < 15 ? 'morning' : 'evening';
}

type AiState = {
  planning: boolean;
  planError: string | null;
  coachLoading: boolean;
  coachError: string | null;
  /** Requests already tried this session, so failures don't burn quota in a loop. */
  attempted: Set<string>;

  ensurePlan: () => Promise<void>;
  ensureCoach: () => Promise<void>;
  retry: () => void;
};

function plannedThrough(data: repo.ArcData): number {
  let max = 0;
  for (const [key, task] of Object.entries(data.tasks)) {
    if (task.source !== 'ai') continue;
    max = Math.max(max, Number(key.split(':')[1]));
  }
  return max;
}

function recentStats(data: repo.ArcData, score: ArcScore, today: number) {
  const recentRates: Partial<Record<PillarType, number>> = {};
  const recentTasks: Partial<Record<PillarType, string[]>> = {};
  for (const p of PILLARS) {
    const window = score.pillars[p].statuses.slice(Math.max(0, today - 8), today - 1);
    const done = window.filter((s) => s === 'done').length;
    const counted = window.filter((s) => s === 'done' || s === 'missed').length;
    if (counted > 0) recentRates[p] = done / counted;
    const titles: string[] = [];
    for (let d = Math.max(1, today - 5); d < today; d++) {
      const t = data.tasks[`${p}:${d}`];
      if (t) titles.push(t.title);
    }
    if (titles.length) recentTasks[p] = titles;
  }
  return { recentRates, recentTasks };
}

export const useAiStore = create<AiState>((set, get) => ({
  planning: false,
  planError: null,
  coachLoading: false,
  coachError: null,
  attempted: new Set(),

  ensurePlan: async () => {
    const data = useArcStore.getState().data;
    if (!data || get().planning) return;
    const score = computeArc(data.log, new Date());
    if (score.isComplete) return;

    const today = Math.max(1, Math.min(CYCLE_LENGTH, score.currentDay));
    const through = plannedThrough(data);
    if (through >= Math.min(CYCLE_LENGTH, today + PLAN_AHEAD_DAYS - 1)) return;

    const fromDay = Math.max(today, through + 1);
    const toDay = Math.min(CYCLE_LENGTH, fromDay + BATCH_DAYS - 1);
    const key = `plan:${data.cycle.id}:${fromDay}`;
    if (get().attempted.has(key)) return;
    get().attempted.add(key);

    set({ planning: true, planError: null });
    try {
      const tasks = await requestPlan({ goals: data.goals, fromDay, toDay, ...recentStats(data, score, today) });
      // The Arc may have been erased or replaced while the request was out; don't write into a cycle that's gone.
      if (useArcStore.getState().data?.cycle.id !== data.cycle.id) return;
      repo.saveAiTasks(data.cycle.id, tasks);
      useArcStore.getState().reloadFromDb();
      scheduleBackup();
    } catch (e) {
      set({ planError: e instanceof Error ? e.message : 'Planning failed.' });
    } finally {
      set({ planning: false });
    }
  },

  ensureCoach: async () => {
    const data = useArcStore.getState().data;
    if (!data || get().coachLoading) return;
    const now = new Date();
    const score = computeArc(data.log, now);
    if (score.isComplete) return;

    const day = Math.max(1, Math.min(CYCLE_LENGTH, score.currentDay));
    const slot = coachSlotFor(now);
    if (repo.getCoachMessage(data.cycle.id, day, slot)) return;
    const key = `coach:${data.cycle.id}:${day}:${slot}`;
    if (get().attempted.has(key)) return;
    get().attempted.add(key);

    const next = nextPhase(score.phase);
    set({ coachLoading: true, coachError: null });
    try {
      const message = await requestCoach({
        slot,
        day,
        phaseTitle: score.phase.title,
        netPoints: score.net,
        pointsToNext: next ? next.minPoints - score.net : null,
        nextPhaseTitle: next?.title ?? null,
        tasks: PILLARS.map((p) => ({
          pillar: p,
          title: taskFor(data, p, day).title,
          status: score.pillars[p].statuses[day - 1],
          missStreak: score.pillars[p].missStreak,
        })),
      });
      if (useArcStore.getState().data?.cycle.id !== data.cycle.id) return;
      repo.saveCoachMessage(data.cycle.id, day, slot, message);
      useArcStore.getState().reloadFromDb();
    } catch (e) {
      set({ coachError: e instanceof Error ? e.message : 'Coach unavailable.' });
    } finally {
      set({ coachLoading: false });
    }
  },

  retry: () => {
    set({ attempted: new Set(), planError: null, coachError: null });
    void get().ensurePlan();
    void get().ensureCoach();
  },
}));
