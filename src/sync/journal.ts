import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { supabase } from './supabase';

// Notes and the log are cloud-first (not in local SQLite) so the phone and the web page share them.

export type Note = { id: string; title: string; body: string; created_at: string; updated_at: string };
export type LogEntry = { id: string; body: string; created_at: string };

export type JournalTable = 'notes' | 'log_entries';
export type Change<T extends { id: string }> = RealtimePostgresChangesPayload<T>;

function client() {
  if (!supabase) throw new Error('Cloud is not configured.');
  return supabase;
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function listNotes(): Promise<Note[]> {
  const { data, error } = await client().from('notes').select('*').order('updated_at', { ascending: false });
  fail(error);
  return (data ?? []) as Note[];
}

export async function listLog(limit = 200): Promise<LogEntry[]> {
  const { data, error } = await client()
    .from('log_entries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  fail(error);
  return (data ?? []) as LogEntry[];
}

export async function createNote(title: string, body: string): Promise<Note> {
  const { data, error } = await client().from('notes').insert({ title, body }).select().single();
  fail(error);
  return data as Note;
}

export const NOTE_GONE = 'This note was deleted on another device.';

export async function updateNote(id: string, title: string, body: string): Promise<Note> {
  // `updated_at` is stamped by a database trigger (migration 0005), never by this device's clock:
  // the merge in journalStore compares those stamps across devices, so they must all come from one clock.
  const { data, error } = await client()
    .from('notes')
    .update({ title, body })
    .eq('id', id)
    .select()
    .maybeSingle();
  fail(error);
  // Zero rows: deleted elsewhere since this editor opened (`.single()` would surface a raw PostgREST error).
  if (!data) throw new Error(NOTE_GONE);
  return data as Note;
}

export async function addLogEntry(body: string): Promise<LogEntry> {
  const { data, error } = await client().from('log_entries').insert({ body }).select().single();
  fail(error);
  return data as LogEntry;
}

export async function deleteRow(table: JournalTable, id: string): Promise<void> {
  const { error } = await client().from(table).delete().eq('id', id);
  fail(error);
}

export type SubscribeStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';

let channelSeq = 0;

/**
 * Live changes from any device signed in to this account. Returns an unsubscribe function.
 * `onStatus` fires as the channel connects; fetch the initial rows on `SUBSCRIBED`, not before,
 * or a change made in between is missed until the next reload.
 */
export function subscribe(
  userId: string,
  onNote: (change: Change<Note>) => void,
  onLog: (change: Change<LogEntry>) => void,
  onStatus: (status: SubscribeStatus) => void,
): () => void {
  const sb = client();
  // No `filter`: Realtime can't filter DELETE events, so a filter would drop deletes from the other device.
  // RLS already limits inserts/updates to this user's rows; a DELETE only carries the id, so unknown ids are no-ops.
  // `wait`: hold SUBSCRIBED until the server confirms the postgres_changes stream is actually live. By default
  // it fires as soon as the channel joins, which can be before replication starts, and the store fetches on it.
  // A fresh topic per subscription: for a topic still leaving (stop() then start() in one tick, e.g. Fast
  // Refresh) realtime-js hands back the old channel object, on which subscribe() is a silent no-op.
  const topic = `journal:${userId}:${++channelSeq}`;
  const channel = sb
    .channel(topic, { config: { postgres_changes_options: { wait: true } } })
    .on<Note>('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, onNote)
    .on<LogEntry>('postgres_changes', { event: '*', schema: 'public', table: 'log_entries' }, onLog)
    .subscribe((status) => onStatus(status));
  return () => {
    void sb.removeChannel(channel);
  };
}
