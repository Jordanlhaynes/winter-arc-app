import { FunctionsHttpError } from '@supabase/supabase-js';

import { PillarType } from '@/engine/scoring';

import { supabase } from './supabase';

export type PlanRequest = {
  goals: Record<PillarType, string>;
  fromDay: number;
  toDay: number;
  recentRates: Partial<Record<PillarType, number>>;
  recentTasks: Partial<Record<PillarType, string[]>>;
};
export type PlannedTask = { day: number; pillar: PillarType; title: string; detail: string };

export type CoachRequest = {
  slot: 'morning' | 'evening';
  day: number;
  phaseTitle: string;
  netPoints: number;
  pointsToNext: number | null;
  nextPhaseTitle: string | null;
  tasks: { pillar: PillarType; title: string; status: string; missStreak: number }[];
};

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.error ?? 'The AI service had a problem.');
    }
    throw new Error("Couldn't reach the AI service. Check your connection.");
  }
  return data as T;
}

export async function requestPlan(req: PlanRequest): Promise<PlannedTask[]> {
  return (await invoke<{ tasks: PlannedTask[] }>('plan-batch', { ...req })).tasks;
}

export async function requestCoach(req: CoachRequest): Promise<string> {
  return (await invoke<{ message: string }>('daily-coach', { ...req })).message;
}
