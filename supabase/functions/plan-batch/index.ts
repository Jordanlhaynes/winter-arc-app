// Generates up to 10 days of micro-tasks (one per pillar per day) with Claude Sonnet 5.5.
import Anthropic from 'npm:@anthropic-ai/sdk@0.132.1';

import { authorize, clip, json, Pillar, PILLARS } from '../_shared/common.ts';

// Edge functions are killed at the 150 s wall clock (free plan). A hung request must fail INSIDE the
// handler so the catch below can refund the quota: 60 s x (1 retry + 1) + backoff stays well under it.
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY'), timeout: 60_000, maxRetries: 1 });

const SYSTEM = `You are the planning engine for Winter Arc, a 100-day habit app with four pillars: personal, physical, financial, career.
Break each pillar's 100-day goal into one concrete micro-task per day.

Rules for every task:
- Doable in 10 to 45 minutes, by one person, with no special equipment unless the goal implies it.
- Specific and checkable: someone could say "yes, done" or "no".
- Title: an imperative phrase under 70 characters. Detail: one sentence under 160 characters on how or why.
- Progress across the days: build on earlier days, vary the work, and include an easier recovery task about once a week.
- Adapt to recent completion rates: below 50% means make tasks smaller and easier to start; above 85% means stretch a little.
- Never give medical, legal, or investment advice. Financial tasks are about budgeting, saving, earning, and learning, not buying specific securities.`;

const SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day: { type: 'integer' },
          pillar: { type: 'string', enum: [...PILLARS] },
          title: { type: 'string' },
          detail: { type: 'string' },
        },
        required: ['day', 'pillar', 'title', 'detail'],
        additionalProperties: false,
      },
    },
  },
  required: ['tasks'],
  additionalProperties: false,
};

type Body = {
  goals: Record<Pillar, string>;
  fromDay: number;
  toDay: number;
  /** 0..1 completion rate over the last 7 days, per pillar */
  recentRates?: Partial<Record<Pillar, number>>;
  /** Recent task titles per pillar, so the plan continues rather than repeats */
  recentTasks?: Partial<Record<Pillar, string[]>>;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  const fromDay = Math.max(1, Math.floor(Number(body.fromDay)));
  const toDay = Math.min(100, Math.floor(Number(body.toDay)), fromDay + 9);
  if (!body.goals || !(toDay >= fromDay)) return json({ error: 'Invalid day range or goals.' }, 400);

  const auth = await authorize(req, 'plan');
  if (auth.denied) return auth.denied;

  const lines = PILLARS.map((p) => {
    const rate = body.recentRates?.[p];
    const recent = (body.recentTasks?.[p] ?? []).slice(-5).map((t) => clip(t, 80));
    return [
      `## ${p}`,
      `Goal: ${clip(body.goals[p], 200)}`,
      rate == null ? 'Recent completion: no data yet' : `Recent completion: ${Math.round(rate * 100)}%`,
      recent.length ? `Recent tasks: ${recent.join(' | ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }).join('\n\n');

  const prompt = `Plan days ${fromDay} to ${toDay} of 100: exactly one task for each pillar on each of those days (${
    (toDay - fromDay + 1) * 4
  } tasks).\n\n${lines}`;

  try {
    const response = await anthropic.beta.messages.create({
      model: 'claude-sonnet-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    } as never);

    // deno-lint-ignore no-explicit-any
    const res = response as any;
    if (res.stop_reason === 'refusal') return json({ error: 'The planner declined this request.' }, 422);
    const text = (res.content as { type: string; text?: string }[]).find((b) => b.type === 'text')?.text;
    if (!text) return json({ error: 'Empty plan.' }, 502);

    const parsed = JSON.parse(text) as { tasks: { day: number; pillar: Pillar; title: string; detail: string }[] };
    const tasks = parsed.tasks
      .filter((t) => t.day >= fromDay && t.day <= toDay && PILLARS.includes(t.pillar))
      .map((t) => ({ day: t.day, pillar: t.pillar, title: clip(t.title, 90), detail: clip(t.detail, 200) }));

    return json({ tasks });
  } catch (e) {
    console.error('plan-batch failed', e);
    await auth.release();
    return json({ error: 'Planning failed. Try again later.' }, 502);
  }
});
