import AsyncStorage from '@react-native-async-storage/async-storage';

import * as repo from '../db/repo';

import { supabase } from './supabase';

export type BackupInfo = { updatedAt: string } | null;
type Owner = { userId: string; generation: number };
type BackupMarker = { userId: string; updatedAt: string };

const PAUSED_KEY = 'autoBackupPaused';
const MARKER_KEY = 'backupReconciliation';
let localMarker: BackupMarker | null = null;
let userId: string | null = null;
let generation = 0;
let approvedGeneration: number | null = null;
let reconciling = false;
let reconciliationVersion = 0;
let pauseRevision = 0;
// Fail closed until the saved preference has loaded. A late read must not undo a newer pause.
let autoBackupPaused = true;
const pauseReady = Promise.all([
  AsyncStorage.getItem(PAUSED_KEY),
  AsyncStorage.getItem(MARKER_KEY),
]).then(([paused, savedMarker]) => {
  if (paused !== null && paused !== '0' && paused !== '1') throw new Error('Invalid backup preference.');
  const marker: unknown = savedMarker ? JSON.parse(savedMarker) : null;
  if (marker !== null) {
    if (typeof marker !== 'object' || !('userId' in marker) || !('updatedAt' in marker) ||
        typeof marker.userId !== 'string' || typeof marker.updatedAt !== 'string' || !marker.updatedAt) {
      throw new Error('Invalid backup status.');
    }
    localMarker = { userId: marker.userId, updatedAt: normalizeTime(marker.updatedAt) };
  }
  if (pauseRevision === 0) autoBackupPaused = paused === '1';
}).catch(() => {
  // Corrupt or unreadable local metadata cannot authorize an automatic overwrite.
  autoBackupPaused = true;
});

let timer: ReturnType<typeof setTimeout> | null = null;
let onAutoBackup: ((updatedAt: string) => void) | null = null;
let restoring = 0;
let chain: Promise<void> = Promise.resolve();

if (supabase) {
  // This callback only updates local state; calling Supabase here can deadlock its auth lock.
  supabase.auth.onAuthStateChange((event, session) => {
    const nextUserId = session?.user.id ?? null;
    if (nextUserId !== userId || event === 'SIGNED_OUT') {
      userId = nextUserId;
      generation += 1;
      approvedGeneration = null;
      reconciling = false;
      reconciliationVersion += 1;
      cancelScheduledBackup();
    }
  });
}

function owner(): Owner {
  if (!supabase || !userId) throw new Error('Sign in and finish 2-factor setup to back up.');
  return { userId, generation };
}

function isCurrent(expected: Owner) {
  return userId === expected.userId && generation === expected.generation;
}

function requireCurrent(expected: Owner) {
  if (!isCurrent(expected)) throw new Error('The signed-in account changed. Try again for the current account.');
}

async function requireReady(expected: Owner) {
  requireCurrent(expected);
  if (!supabase) throw new Error('Cloud is not configured.');
  const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError) throw new Error(aalError.message);
  if (aal?.currentLevel !== 'aal2') throw new Error('Finish 2-factor setup first.');
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  requireCurrent(expected);
  if (data.user?.id !== expected.userId) throw new Error('The signed-in account changed. Try again.');
}

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const run = chain.then(operation);
  chain = run.then(() => {}, () => {});
  return run;
}

export function isAutoBackupPaused() {
  return autoBackupPaused || reconciling || approvedGeneration !== generation;
}

function setAutoBackupPaused(paused: boolean) {
  pauseRevision += 1;
  autoBackupPaused = paused;
  AsyncStorage.setItem(PAUSED_KEY, paused ? '1' : '0').catch(() => {});
}

export function pauseAutoBackup() {
  setAutoBackupPaused(true);
  cancelScheduledBackup();
}

/** An explicit choice to keep this phone or a successful restore can release the conflict gate. */
export function resumeAutoBackup() {
  if (!userId) return;
  approvedGeneration = generation;
  reconciling = false;
  setAutoBackupPaused(false);
}

/** Call before verifying MFA so the newly ready session cannot upload before inspecting its cloud copy. */
export function beginBackupReconciliation() {
  reconciliationVersion += 1;
  approvedGeneration = null;
  reconciling = true;
  cancelScheduledBackup();
}

async function readLatest(expected: Owner): Promise<BackupInfo> {
  await requireReady(expected);
  if (!supabase) throw new Error('Cloud is not configured.');
  const { data, error } = await supabase.from('backups').select('updated_at').eq('user_id', expected.userId).maybeSingle();
  if (error) throw new Error(error.message);
  requireCurrent(expected);
  return data ? { updatedAt: normalizeTime(data.updated_at) } : null;
}

function normalizeTime(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('The backup did not include a valid saved time.');
  return new Date(value).toISOString();
}

function matchesLocalMarker(expected: Owner, backup: BackupInfo) {
  return !!backup && localMarker?.userId === expected.userId && localMarker.updatedAt === backup.updatedAt;
}

async function saveMarker(expected: Owner, updatedAt: string) {
  requireCurrent(expected);
  const at = normalizeTime(updatedAt);
  try {
    await AsyncStorage.setItem(MARKER_KEY, JSON.stringify({ userId: expected.userId, updatedAt: at }));
    requireCurrent(expected);
    localMarker = { userId: expected.userId, updatedAt: at };
  } catch (error) {
    if (isCurrent(expected)) {
      approvedGeneration = null;
      setAutoBackupPaused(true);
    }
    throw error;
  }
}

export async function latestBackup(): Promise<BackupInfo> {
  if (!supabase) return null;
  return readLatest(owner());
}

/**
 * A different owner/cloud timestamp or a failed lookup blocks uploads until an explicit backup or restore.
 * A confirmed absent cloud copy permits automatic backup, preserving a deliberate saved pause.
 */
export async function reconcileBackup(): Promise<BackupInfo> {
  beginBackupReconciliation();
  const expected = owner();
  const revision = reconciliationVersion;
  try {
    await pauseReady;
    const backup = await readLatest(expected);
    requireCurrent(expected);
    if (revision !== reconciliationVersion) throw new Error('A newer backup check is in progress.');
    approvedGeneration = !backup || matchesLocalMarker(expected, backup) ? expected.generation : null;
    reconciling = false;
    return backup;
  } catch (error) {
    if (isCurrent(expected) && revision === reconciliationVersion) reconciling = false;
    throw error;
  }
}

async function upload(data: repo.Snapshot, expected: Owner): Promise<string> {
  await requireReady(expected);
  if (!supabase) throw new Error('Cloud is not configured.');
  requireCurrent(expected);
  const updatedAt = new Date().toISOString();
  // Always use the owner captured with the snapshot. RLS rejects it if auth changes during the request.
  const { error } = await supabase.from('backups').upsert({
    user_id: expected.userId,
    data,
    schema_version: repo.SNAPSHOT_VERSION,
    updated_at: updatedAt,
  });
  if (error) throw new Error(error.message);
  return updatedAt;
}

export function backupNow(): Promise<string> {
  // Capture both identity and data synchronously; queued snapshots never adopt another account.
  const expected = owner();
  const data = repo.exportSnapshot();
  const revision = pauseRevision;
  return enqueue(async () => {
    await pauseReady;
    const at = await upload(data, expected);
    await saveMarker(expected, at);
    if (isCurrent(expected)) {
      approvedGeneration = expected.generation;
      reconciling = false;
      // A delete/pause requested after this backup must remain in force.
      if (pauseRevision === revision) setAutoBackupPaused(false);
    }
    return at;
  });
}

export function restoreLatest(): Promise<void> {
  const expected = owner();
  approvedGeneration = null;
  restoring += 1;
  cancelScheduledBackup();
  const run = enqueue(async () => {
    await requireReady(expected);
    if (!supabase) throw new Error('Cloud is not configured.');
    const { data, error } = await supabase.from('backups').select('data, updated_at').eq('user_id', expected.userId).maybeSingle();
    if (error) throw new Error(error.message);
    requireCurrent(expected);
    if (!data) throw new Error('No backup found for this account yet.');
    repo.importSnapshot(data.data as repo.Snapshot);
    await saveMarker(expected, data.updated_at as string);
    approvedGeneration = expected.generation;
    reconciling = false;
    cancelScheduledBackup();
  });
  return run.finally(() => { restoring -= 1; });
}

export function deleteCloudBackup(): Promise<void> {
  const expected = owner();
  const wasPaused = autoBackupPaused;
  setAutoBackupPaused(true);
  const revision = pauseRevision;
  cancelScheduledBackup();
  return enqueue(async () => {
    await requireReady(expected);
    if (!supabase) throw new Error('Cloud is not configured.');
    const { error } = await supabase.from('backups').delete().eq('user_id', expected.userId);
    if (error) throw new Error(error.message);
    requireCurrent(expected);
  }).catch((error: unknown) => {
    if (isCurrent(expected) && pauseRevision === revision) setAutoBackupPaused(wasPaused);
    throw error;
  });
}

export function setAutoBackupListener(fn: ((updatedAt: string) => void) | null) {
  onAutoBackup = fn;
}

export function cancelScheduledBackup() {
  if (timer) clearTimeout(timer);
  timer = null;
}

/** Only a checked cloud copy or an explicit user choice may release the automatic-upload gate. */
export function scheduleBackup(delayMs = 5000) {
  if (!supabase || !userId) return;
  const expected = owner();
  cancelScheduledBackup();
  timer = setTimeout(() => {
    timer = null;
    if (restoring || reconciling || !isCurrent(expected)) return;
    try {
      if (!repo.hasAnyData()) return;
      const data = repo.exportSnapshot();
      void enqueue(async () => {
        await pauseReady;
        if (autoBackupPaused || restoring || reconciling || !isCurrent(expected)) return null;
        if (approvedGeneration !== expected.generation) {
          // Restored sessions may bypass MFA UI. Check before their first automatic upload as well.
          const backup = await readLatest(expected);
          if ((backup && !matchesLocalMarker(expected, backup)) || autoBackupPaused || restoring || reconciling || !isCurrent(expected)) return null;
          approvedGeneration = expected.generation;
        }
        if (autoBackupPaused || restoring || reconciling || !isCurrent(expected)) return null;
        const at = await upload(data, expected);
        await saveMarker(expected, at);
        return at;
      }).then((at) => {
        if (at && isCurrent(expected)) onAutoBackup?.(at);
      }).catch(() => {
        // A failed metadata/auth lookup cannot be treated as "no backup". An explicit retry is available in Settings.
      });
    } catch {
      // Local reads failed; leave the existing cloud data intact.
    }
  }, delayMs);
}
