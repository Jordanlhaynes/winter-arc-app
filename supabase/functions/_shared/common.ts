// Pinned to the version the app uses, so a cold start can't pull a different client than was tested.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

export const PILLARS = ['personal', 'physical', 'financial', 'career'] as const;
export type Pillar = (typeof PILLARS)[number];

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export type Authorized =
  | { denied: Response; release?: undefined }
  | { denied?: undefined; release: () => Promise<void> };

/**
 * Verifies the caller (signed in, 2-factor) and claims one unit of AI quota.
 * Returns `denied` (a Response to send back) or `release`, to call if the Claude request itself
 * fails so a transient outage doesn't eat the user's daily allowance.
 */
export async function authorize(req: Request, kind: 'plan' | 'coach'): Promise<Authorized> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { denied: json({ error: 'Not signed in.' }, 401) };

  // Supabase injects these automatically into every Edge Function.
  const url = Deno.env.get('SUPABASE_URL')!;
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  const supabase = createClient(url, publicKey!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: allowed, error } = await supabase.rpc('claim_ai_quota', { p_kind: kind });
  if (error) return { denied: json({ error: 'Sign in with 2-factor to use AI features.' }, 401) };
  if (!allowed) return { denied: json({ error: "Today's AI limit is reached. Try again tomorrow." }, 429) };

  // Captured now, not at release time: the refund can run a minute or more later, after the caller's
  // token may have expired, and claim_ai_quota wrote today's row in UTC (the database's current_date).
  const userId = jwtSubject(authHeader);
  const day = new Date().toISOString().slice(0, 10);

  return {
    release: async () => {
      if (!userId) return;
      // The refund goes through the service role, so a signed-in user can't call it to reset their own cap.
      const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY');
      const admin = createClient(url, secretKey!);
      // Best effort: the quota row is a spending guard, not an audit log.
      const { error: releaseError } = await admin.rpc('release_ai_quota', {
        p_user_id: userId,
        p_kind: kind,
        p_day: day,
      });
      if (releaseError) console.error('release_ai_quota failed', releaseError);
    },
  };
}

/** The `sub` claim of a bearer JWT. Not re-verified here: claim_ai_quota has just accepted the same token. */
function jwtSubject(authHeader: string): string | null {
  const payload = authHeader.replace(/^Bearer\s+/i, '').split('.')[1];
  if (!payload) return null;
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
    const claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))));
    return typeof claims.sub === 'string' ? claims.sub : null;
  } catch {
    return null;
  }
}

export function clip(value: unknown, max: number): string {
  return String(value ?? '').slice(0, max);
}
