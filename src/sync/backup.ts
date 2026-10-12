import AsyncStorage from '@react-native-async-storage/async-storage';

import * as repo from '@/db/repo';

import { supabase } from './supabase';

export type BackupInfo = { updatedAt: string } | null;

const PAUSED_KEY = 'autoBackupPaused';

async function readyUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== 'aal2') return null; // backups require 2-factor
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * "Delete cloud backup" (and an unanswered "which copy?" question) pauses automatic backups, otherwise the next
 * change, or an AI plan already in flight, would quietly put the data straight back. An explicit backup that
 * succeeds resumes them. Survives restarts.
 */
let autoBackupPaused = false;
void AsyncStorage.getItem(PAUSED_KEY)
  .then((v) => {
    autoBackupPaused = v === '1';
  })
  .catch(() => {});

export function isAutoBackupPaused() {
  return autoBackupPaused;
}

function setAutoBackupPaused(paused: boolean) {
  if (autoBackupPaused === paused) return;
  autoBackupPaused = paused;
  AsyncStorage.setItem(PAUSED_KEY, paused ? '1' : '0').catch(() => {});
}

export function pauseAutoBackup() {
  setAutoBackupPaused(true);
}

export function resumeAutoBackup() {
  setAutoBackupPaused(false);
}

/**
 * Uploads run strictly one after another, in the order they were requested, so an older snapshot can never
 * land after a newer one. Always settles (errors swallowed) so delete/restore can simply await it.
 */
let chain: Promise<unknown> = Promise.resolve();
/** True while a restore is replacing the local database; nothing may upload meanwhile. */
let restoring = false;

async function upload(data: repo.Snapshot): Promise<string> {
  const userId = await readyUserId();
  if (!supabase || !userId) throw new Error('Sign in and finish 2-factor setup to back up.');
  const updatedAt = new Date().toISOString();
  const { error } = await supabase.from('backups').upsert({
    user_id: userId,
    data,
    schema_version: repo.SNAPSHOT_VERSION,
    updated_at: updatedAt,
  });
  if (error) throw new Error(error.message);
  return updatedAt;
}

export function backupNow(): Promise<string> {
  // Snapshot first, synchronously. The auth checks in upload() take a network round-trip, and an erase that
  // lands during that wait must not be what gets uploaded.
  const data = repo.exportSnapshot();
  const run = chain.then(() => upload(data));
  chain = run.catch(() => {});
  // An explicit backup that actually lands is also how automatic backups resume after "Delete cloud backup".
  run.then(
    () => setAutoBackupPaused(false),
    () => {},
  );
  return run;
}

export async function latestBackup(): Promise<BackupInfo> {
  const userId = await readyUserId();
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from('backups')
    .select('updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { updatedAt: data.updated_at as string } : null;
}

export async function restoreLatest(): Promise<void> {
  // Nothing may upload while the restore is out: a snapshot of the data being replaced (even one scheduled by a
  // tap on another tab during the wait) would land after the restore and undo it in the cloud.
  restoring = true;
  try {
    cancelScheduledBackup();
    await chain;
    const userId = await readyUserId();
    if (!supabase || !userId) throw new Error('Sign in and finish 2-factor setup to restore.');
    const { data, error } = await supabase.from('backups').select('data').eq('user_id', userId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('No backup found for this account yet.');
    repo.importSnapshot(data.data as repo.Snapshot);
    cancelScheduledBackup();
  } finally {
    restoring = false;
  }
}

export async function deleteCloudBackup(): Promise<void> {
  // Pause first so nothing scheduled meanwhile goes up, then let any upload already in progress finish, so
  // a backup from a change made moments ago can't land after the delete.
  const wasPaused = autoBackupPaused;
  setAutoBackupPaused(true);
  cancelScheduledBackup();
  await chain;
  try {
    const userId = await readyUserId();
    if (!supabase || !userId) throw new Error('Sign in first.');
    const { error } = await supabase.from('backups').delete().eq('user_id', userId);
    if (error) throw new Error(error.message);
  } catch (e) {
    setAutoBackupPaused(wasPaused);
    throw e;
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
let onAutoBackup: ((updatedAt: string) => void) | null = null;

export function setAutoBackupListener(fn: ((updatedAt: string) => void) | null) {
  onAutoBackup = fn;
}

/** Drop a pending auto-backup, e.g. right before erasing local data so an empty snapshot never overwrites the cloud. */
export function cancelScheduledBackup() {
  if (timer) clearTimeout(timer);
  timer = null;
}

/** Debounced backup after local changes. Silently skips if not signed in, paused, or mid-restore. */
export function scheduleBackup(delayMs = 5000) {
  if (!supabase) return;
  cancelScheduledBackup();
  timer = setTimeout(() => {
    timer = null;
    if (autoBackupPaused || restoring) return;
    try {
      // The auto path never uploads an empty database: after an erase, any late scheduler (e.g. an AI plan
      // that was already in flight) would otherwise replace the kept cloud backup with nothing.
      if (!repo.hasAnyData()) return;
      backupNow()
        .then((at) => onAutoBackup?.(at))
        .catch(() => {
          // Offline or signed out: the next change or a manual backup will retry.
        });
    } catch {
      // Reading the local database failed; same outcome as a failed upload, the next change retries.
    }
  }, delayMs);
}
