import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '@/sync/supabase';

/**
 * signedOut      – no account session (the app still works fully offline)
 * needsMfaSetup  – signed in, no authenticator enrolled yet
 * needsMfaCode   – signed in with password, 6-digit code still required
 * ready          – fully authenticated (aal2); backups allowed
 */
export type AuthStatus = 'unavailable' | 'signedOut' | 'needsMfaSetup' | 'needsMfaCode' | 'ready';

type Enrollment = { factorId: string; secret: string; uri: string };

type AuthState = {
  status: AuthStatus;
  /** False until the first session check finishes, so screens don't flash "signed out". */
  checked: boolean;
  session: Session | null;
  email: string | null;
  verifiedFactorId: string | null;

  init: () => void;
  refresh: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsEmailConfirm: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Emails a reset link that opens `redirectTo`. */
  sendPasswordReset: (email: string, redirectTo: string) => Promise<void>;
  /** Needs a session: from the reset link, or signed in normally. */
  updatePassword: (password: string) => Promise<void>;
  startEnrollment: () => Promise<Enrollment>;
  verifyCode: (factorId: string, code: string) => Promise<void>;
};

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

// Parked on globalThis rather than in a module variable: in development, saving this file re-evaluates the
// module (fresh variables) while src/sync/supabase.ts keeps its client and its listener list, so a module-level
// handle would be forgotten and the old listener would leak.
const UNSUBSCRIBE_KEY = '__winterArcUnsubscribeAuth';
const handles = globalThis as typeof globalThis & { [UNSUBSCRIBE_KEY]?: () => void };

export const useAuthStore = create<AuthState>((set, get) => ({
  status: supabase ? 'signedOut' : 'unavailable',
  checked: !supabase,
  session: null,
  email: null,
  verifiedFactorId: null,

  init: () => {
    if (!supabase) return;
    // Fast Refresh re-runs the layout effect; drop the previous listener so refresh() isn't called twice per event.
    handles[UNSUBSCRIBE_KEY]?.();
    const { data } = supabase.auth.onAuthStateChange(() => {
      // Defer: calling supabase inside this callback can deadlock the auth lock.
      setTimeout(() => void get().refresh(), 0);
    });
    handles[UNSUBSCRIBE_KEY] = () => data.subscription.unsubscribe();
    void get().refresh();
  },

  refresh: async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) {
      set({ status: 'signedOut', checked: true, session: null, email: null, verifiedFactorId: null });
      return;
    }
    const [{ data: aal }, { data: factors }] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);
    const verified = factors?.totp.find((f) => f.status === 'verified') ?? null;
    let status: AuthStatus;
    if (aal?.currentLevel === 'aal2') status = 'ready';
    else if (verified) status = 'needsMfaCode';
    else status = 'needsMfaSetup';
    set({ status, checked: true, session, email: session.user.email ?? null, verifiedFactorId: verified?.id ?? null });
  },

  signUp: async (email, password) => {
    if (!supabase) throw new Error('Cloud is not configured.');
    const { data, error } = await supabase.auth.signUp({ email, password });
    fail(error);
    await get().refresh();
    return { needsEmailConfirm: !data.session };
  },

  signIn: async (email, password) => {
    if (!supabase) throw new Error('Cloud is not configured.');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    fail(error);
    await get().refresh();
  },

  signOut: async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    await get().refresh();
  },

  sendPasswordReset: async (email, redirectTo) => {
    if (!supabase) throw new Error('Cloud is not configured.');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    fail(error);
  },

  updatePassword: async (password) => {
    if (!supabase) throw new Error('Cloud is not configured.');
    const { error } = await supabase.auth.updateUser({ password });
    fail(error);
    await get().refresh();
  },

  startEnrollment: async () => {
    if (!supabase) throw new Error('Cloud is not configured.');
    // Clear half-finished enrollments so a fresh secret is issued.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const f of factors?.all ?? []) {
      if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Winter Arc ${Date.now()}`,
    });
    fail(error);
    return { factorId: data!.id, secret: data!.totp.secret, uri: data!.totp.uri };
  },

  verifyCode: async (factorId, code) => {
    if (!supabase) throw new Error('Cloud is not configured.');
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    fail(error);
    await get().refresh();
  },
}));
