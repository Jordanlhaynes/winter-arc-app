// Short morning / evening coaching message with Claude Haiku 4.5.
import Anthropic from 'npm:@anthropic-ai/sdk@0.132.1';

import { authorize, clip, json, PILLARS } from '../_shared/common.ts';

// Bounded so a hung request fails inside the handler (and refunds quota) before the 150 s wall clock kills us.
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY'), timeout: 60_000, maxRetries: 1 });

const SYSTEM = `You are the coach inside Winter Arc, a 100-day habit app where the user's avatar levels up through a medieval ladder (Grifter, Servant, Stable Hand, Blacksmith, Soldier, Knight, King, Grand Master) as they earn points.
Write one coaching message of 40 to 70 words. Plain text only: no markdown, no lists, no emoji.
Tone: supportive and direct, like a good trainer, with a light RPG flavour ("XP", "next phase") used sparingly. Never shame the user.
Morning: name today's single most important task and give one practical tip to start it.
Evening: reflect honestly on what got done today, and if a pillar has a miss streak, say clearly that tomorrow matters for it.
Never give medical, legal, or investment advice.`;

type Body = {
  slot: 'morning' | 'evening';
  day: number;
  phaseTitle: string;
  netPoints: number;
  pointsToNext: number | null;
  nextPhaseTitle: string | null;
  tasks: { pillar: string; title: string; status: string; missStreak: number }[];
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  if (body.slot !== 'morning' && body.slot !== 'evening') return json({ error: 'Invalid slot.' }, 400);

  const auth = await authorize(req, 'coach');
  if (auth.denied) return auth.denied;

  const tasks = (body.tasks ?? [])
    .filter((t) => (PILLARS as readonly string[]).includes(t.pillar))
    .map(
      (t) =>
        `- ${t.pillar}: "${clip(t.title, 90)}" (${clip(t.status, 10)}${t.missStreak > 0 ? `, missed ${t.missStreak} in a row before today` : ''})`,
    )
    .join('\n');

  const prompt = [
    `${body.slot === 'morning' ? 'Morning' : 'Evening'} message for day ${Math.floor(body.day)} of 100.`,
    `Avatar: ${clip(body.phaseTitle, 40)}, ${Math.floor(body.netPoints)} of 400 points.`,
    body.nextPhaseTitle && body.pointsToNext != null
      ? `${Math.floor(body.pointsToNext)} points to ${clip(body.nextPhaseTitle, 40)}.`
      : 'Final phase reached.',
    `Today's tasks:\n${tasks}`,
  ].join('\n');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });
    if (response.stop_reason === 'refusal') return json({ error: 'Coach unavailable.' }, 422);
    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return json({ error: 'Empty message.' }, 502);
    return json({ message: clip(text.text.trim(), 800) });
  } catch (e) {
    console.error('daily-coach failed', e);
    await auth.release();
    return json({ error: 'Coach failed. Try again later.' }, 502);
  }
});
