import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import * as journal from '@/sync/journal';
import { Change, LogEntry, Note } from '@/sync/journal';

import { useAuthStore } from './authStore';

type JournalState = {
  userId: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  notes: Note[];
  log: LogEntry[];

  /** Load everything and start listening for changes from other devices. Returns a stop function. */
  start: (userId: string) => () => void;
  reload: () => Promise<void>;
  saveNote: (id: string | null, title: string, body: string) => Promise<Note>;
  deleteNote: (id: string) => Promise<void>;
  addLog: (body: string) => Promise<void>;
  deleteLog: (id: string) => Promise<void>;
};

/**
 * Insert `row` into a list kept newest-first by `sortKey`, or replace the existing row with the same id.
 * Called both for our own writes and for Realtime echoes of them, so the same row can arrive twice,
 * and an older version can arrive after a newer one.
 */
export function upsert<T extends { id: string }>(list: T[], row: T, sortKey: keyof T & string): T[] {
  const existing = list.find((r) => r.id === row.id);
  if (existing && existing[sortKey] > row[sortKey]) return list;
  const others = list.filter((r) => r.id !== row.id);
  return [row, ...others].sort((a, b) => (a[sortKey] < b[sortKey] ? 1 : -1));
}

export function applyChange<T extends { id: string }>(list: T[], change: Change<T>, sortKey: keyof T & string): T[] {
  if (change.eventType === 'DELETE') return list.filter((r) => r.id !== change.old.id);
  return upsert(list, change.new, sortKey);
}

const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

export const useJournalStore = create<JournalState>((set, get) => {
  /** Invalidates every outstanding fetch, mutation and subscription on an account change. */
  let session = 0;
  /** A user action: clear the previous error first so an old message doesn't outlive a later success. */
  const mutate = async <R>(fn: (mySession: number) => Promise<R>): Promise<R> => {
    const mySession = session;
    set({ error: null });
    try {
      return await fn(mySession);
    } catch (e) {
      if (mySession === session) set({ error: message(e) });
      throw e;
    }
  };

  /**
   * While a reload's queries are out, every change (Realtime or our own write) queues here and replays on top
   * of the snapshot, which predates it. Each applier reads the current state when it runs, so order is safe.
   */
  let pending: (() => void)[] | null = null;
  let inFlight: Promise<void> | null = null;
  let again = false;

  const applyNow = (fn: () => void, mySession: number) => {
    const apply = () => {
      if (mySession === session) fn();
    };
    if (pending) pending.push(apply);
    else apply();
  };

  const fetchOnce = async (mySession: number) => {
    pending = [];
    let notes: Note[];
    let log: LogEntry[];
    try {
      [notes, log] = await Promise.all([journal.listNotes(), journal.listLog()]);
    } catch (e) {
      const queued = pending;
      pending = null;
      if (mySession === session) {
        // The changes that arrived meanwhile are still good; only the snapshot failed.
        queued?.forEach((apply) => apply());
        // Show the failure only where the gate will display it: a background refetch keeps the list and stays quiet.
        if (get().status !== 'ready') set({ error: message(e) });
      }
      throw e;
    }
    const queued = pending;
    pending = null;
    if (mySession !== session) return;
    set(get().status === 'ready' ? { notes, log } : { notes, log, error: null, status: 'ready' });
    queued.forEach((apply) => apply());
  };

  return {
    userId: null,
    status: 'idle',
    error: null,
    notes: [],
    log: [],

    start: (userId) => {
      const mySession = ++session;
      set({ userId, status: 'loading', error: null, notes: [], log: [] });
      let unsubscribe: (() => void) | null = null;
      let retry: ReturnType<typeof setTimeout> | undefined;
      let backoff = 1000;

      const load = () => {
        get()
          .reload()
          .catch(() => {
            // A failed refetch keeps showing what we have; only the first load can fail the screen.
            if (mySession === session && get().status !== 'ready') set({ status: 'error' });
          });
      };

      const connect = () => {
        unsubscribe = journal.subscribe(
          userId,
          (c) => applyNow(() => set({ notes: applyChange(get().notes, c, 'updated_at') }), mySession),
          (c) => applyNow(() => set({ log: applyChange(get().log, c, 'created_at') }), mySession),
          (status) => {
            if (mySession !== session) return;
            if (status === 'SUBSCRIBED') {
              // The first join and every rejoin after a drop: events during the gap were lost, so refetch.
              backoff = 1000;
              load();
            } else if (status === 'CLOSED') {
              // The server closed the channel (e.g. token expiry) and realtime-js won't rejoin on its own.
              unsubscribe?.();
              unsubscribe = null;
              retry = setTimeout(connect, backoff);
              backoff = Math.min(backoff * 2, 30_000);
            }
            // TIMED_OUT / CHANNEL_ERROR: the library keeps retrying the join by itself.
          },
        );
      };

      // REST doesn't depend on the channel, so fetch at once for a fast first paint. The refetch on SUBSCRIBED
      // (coalesced onto this one if it's still running) is what closes the gap between snapshot and stream.
      load();
      connect();

      return () => {
        clearTimeout(retry);
        unsubscribe?.();
        if (mySession !== session) return;
        session++;
        pending = null;
        set({ userId: null, status: 'idle', notes: [], log: [], error: null });
      };
    },

    reload: () => {
      // Coalesce overlapping callers (a rejoin and the foreground reload fire together), but always run once
      // more after the current fetch so the later request still sees a snapshot taken after it was asked for.
      if (inFlight) {
        again = true;
        return inFlight;
      }
      const run = (async () => {
        let lastError: unknown;
        try {
          do {
            again = false;
            try {
              await fetchOnce(session);
              lastError = undefined;
            } catch (e) {
              // Keep going if someone asked for another pass meanwhile; report only the final outcome.
              lastError = e;
            }
          } while (again);
        } finally {
          inFlight = null;
        }
        if (lastError !== undefined) throw lastError;
      })();
      inFlight = run;
      return run;
    },

    saveNote: (id, title, body) =>
      mutate(async (mySession) => {
        try {
          const note = id ? await journal.updateNote(id, title, body) : await journal.createNote(title, body);
          if (mySession !== session) return note;
          // Deleted elsewhere while our update was out: the row is gone server-side, don't resurrect it here.
          if (id && !get().notes.some((n) => n.id === id)) throw new Error(journal.NOTE_GONE);
          applyNow(() => set({ notes: upsert(get().notes, note, 'updated_at') }), mySession);
          return note;
        } catch (e) {
          if (id && e instanceof Error && e.message === journal.NOTE_GONE) {
            applyNow(() => set({ notes: get().notes.filter((n) => n.id !== id) }), mySession);
          }
          throw e;
        }
      }),

    deleteNote: (id) =>
      mutate(async (mySession) => {
        await journal.deleteRow('notes', id);
        applyNow(() => set({ notes: get().notes.filter((n) => n.id !== id) }), mySession);
      }),

    addLog: (body) =>
      mutate(async (mySession) => {
        const entry = await journal.addLogEntry(body);
        applyNow(() => set({ log: upsert(get().log, entry, 'created_at') }), mySession);
      }),

    deleteLog: (id) =>
      mutate(async (mySession) => {
        await journal.deleteRow('log_entries', id);
        applyNow(() => set({ log: get().log.filter((e) => e.id !== id) }), mySession);
      }),
  };
});

/** Mount once in a tab layout: syncs notes and the log while signed in with 2-factor. */
export function useJournalSync() {
  const ready = useAuthStore((s) => s.status === 'ready');
  const userId = useAuthStore((s) => s.session?.user.id ?? null);

  useEffect(() => {
    if (!ready || !userId) return;
    const stop = useJournalStore.getState().start(userId);
    // Realtime misses events while the phone is asleep or the tab is hidden, so catch up on return.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void useJournalStore.getState().reload().catch(() => {});
    });
    return () => {
      sub.remove();
      stop();
    };
  }, [ready, userId]);
}
