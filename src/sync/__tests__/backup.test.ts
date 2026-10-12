type Result = { data: unknown; error: { message: string } | null };
type AuthCallback = (event: string, session: { user: { id: string } } | null) => void;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const snapshot = (name: string) => ({
  version: 1, exportedAt: name, cycles: [{ id: name }], pillars: [], tasks: [],
  completions: [], skips: [], recoveries: [], coach_messages: [],
});

describe('backup races', () => {
  let backup: typeof import('../backup');
  let authChange: AuthCallback;
  let activeUser: string;
  let preference: ReturnType<typeof deferred<string | null>>;
  let metadata: jest.Mock;
  let upsert: jest.Mock;
  let remove: jest.Mock;
  let imported: jest.Mock;
  let exported: jest.Mock;
  let savedPreference: jest.Mock;
  let storedMarker: string | null;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    activeUser = 'account-a';
    storedMarker = null;
    preference = deferred<string | null>();
    metadata = jest.fn().mockResolvedValue({ data: null, error: null });
    upsert = jest.fn().mockResolvedValue({ error: null });
    remove = jest.fn().mockResolvedValue({ error: null });
    imported = jest.fn();
    exported = jest.fn(() => snapshot('phone-a'));
    savedPreference = jest.fn().mockResolvedValue(undefined);
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      __esModule: true,
      default: { getItem: (key: string) => key === 'autoBackupPaused' ? preference.promise : Promise.resolve(storedMarker), setItem: savedPreference },
    }));
    jest.doMock('../../db/repo', () => ({
      SNAPSHOT_VERSION: 1, exportSnapshot: exported, importSnapshot: imported, hasAnyData: () => true,
    }));
    jest.doMock('../supabase', () => ({
      supabase: {
        auth: {
          onAuthStateChange: (callback: AuthCallback) => {
            authChange = callback;
            return { data: { subscription: { unsubscribe: jest.fn() } } };
          },
          mfa: { getAuthenticatorAssuranceLevel: jest.fn().mockResolvedValue({ data: { currentLevel: 'aal2' }, error: null }) },
          getUser: jest.fn(async () => ({ data: { user: { id: activeUser } }, error: null })),
        },
        from: () => ({
          upsert,
          select: () => ({ eq: () => ({ maybeSingle: metadata }) }),
          delete: () => ({ eq: remove }),
        }),
      },
    }));
    backup = jest.requireActual('../backup');
    authChange('INITIAL_SESSION', { user: { id: activeUser } });
  });

  afterEach(() => { jest.useRealTimers(); });

  async function settle() {
    await jest.advanceTimersByTimeAsync(20);
  }

  it('waits for a delayed saved pause before an automatic upload', async () => {
    backup.scheduleBackup(0);
    await settle();
    expect(upsert).not.toHaveBeenCalled();
    preference.resolve('1');
    await settle();
    expect(upsert).not.toHaveBeenCalled();
    expect(backup.isAutoBackupPaused()).toBe(true);
  });

  it('keeps a stored cloud copy intact while initial reconciliation is pending', async () => {
    preference.resolve('0');
    const read = deferred<Result>();
    metadata.mockReturnValue(read.promise);
    const checking = backup.reconcileBackup();
    backup.scheduleBackup(0);
    await settle();
    expect(upsert).not.toHaveBeenCalled();
    read.resolve({ data: { updated_at: '2026-10-11' }, error: null });
    await checking;
    backup.scheduleBackup(0);
    await settle();
    expect(upsert).not.toHaveBeenCalled();
    expect(backup.isAutoBackupPaused()).toBe(true);
  });

  it('fails closed when the metadata lookup fails', async () => {
    preference.resolve('0');
    metadata.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await expect(backup.reconcileBackup()).rejects.toThrow('offline');
    backup.scheduleBackup(0);
    await settle();
    expect(upsert).not.toHaveBeenCalled();
    expect(backup.isAutoBackupPaused()).toBe(true);
  });

  it('keeps a deliberate pause after an absent backup and resumes only after manual success', async () => {
    preference.resolve('1');
    await backup.reconcileBackup();
    backup.scheduleBackup(0);
    await settle();
    expect(upsert).not.toHaveBeenCalled();
    await backup.backupNow();
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(backup.isAutoBackupPaused()).toBe(false);
  });

  it('does not retarget a queued snapshot when accounts switch', async () => {
    preference.resolve('0');
    const pending = deferred<{ error: null }>();
    upsert.mockReturnValueOnce(pending.promise);
    const first = backup.backupNow();
    const firstRejected = expect(first).rejects.toThrow('account changed');
    await settle();
    const queued = backup.backupNow();
    const rejected = expect(queued).rejects.toThrow('account changed');
    activeUser = 'account-b';
    authChange('SIGNED_IN', { user: { id: activeUser } });
    pending.resolve({ error: null });
    await firstRejected;
    await rejected;
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].user_id).toBe('account-a');
    expect(backup.isAutoBackupPaused()).toBe(true);
  });

  it('does not let an earlier manual upload undo a newer deletion pause', async () => {
    preference.resolve('0');
    await backup.reconcileBackup();
    const pending = deferred<{ error: null }>();
    upsert.mockReturnValueOnce(pending.promise);
    const writing = backup.backupNow();
    await settle();
    const deleting = backup.deleteCloudBackup();
    pending.resolve({ error: null });
    await writing;
    await deleting;
    backup.scheduleBackup(0);
    await settle();
    expect(remove).toHaveBeenCalledWith('user_id', 'account-a');
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(backup.isAutoBackupPaused()).toBe(true);
  });

  it('blocks old snapshots while a restore is replacing local data', async () => {
    preference.resolve('0');
    await backup.reconcileBackup();
    const read = deferred<Result>();
    metadata.mockReturnValue(read.promise);
    const restoring = backup.restoreLatest();
    backup.scheduleBackup(0);
    await settle();
    expect(upsert).not.toHaveBeenCalled();
    read.resolve({ data: { data: snapshot('cloud-a'), updated_at: '2026-10-11T00:00:00.000Z' }, error: null });
    await restoring;
    expect(imported).toHaveBeenCalledWith(snapshot('cloud-a'));
    expect(upsert).not.toHaveBeenCalled();
    expect(backup.isAutoBackupPaused()).toBe(false);
  });
  function restartWithMarker(marker: string) {
    storedMarker = marker;
    jest.resetModules();
    backup = jest.requireActual('../backup');
    authChange('INITIAL_SESSION', { user: { id: activeUser } });
  }

  it('continues same-account automatic backups only when the saved cloud timestamp still matches', async () => {
    const at = '2026-10-11T00:00:00.000Z';
    restartWithMarker(JSON.stringify({ userId: 'account-a', updatedAt: at }));
    preference.resolve('0');
    metadata.mockResolvedValue({ data: { updated_at: '2026-10-11T00:00:00+00:00' }, error: null });
    backup.scheduleBackup(0);
    await settle();
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].user_id).toBe('account-a');
    expect(backup.isAutoBackupPaused()).toBe(false);
  });

  it('does not overwrite a newer cloud copy after a same-account restart', async () => {
    restartWithMarker(JSON.stringify({ userId: 'account-a', updatedAt: '2026-10-10T00:00:00.000Z' }));
    preference.resolve('0');
    metadata.mockResolvedValue({ data: { updated_at: '2026-10-11T00:00:00.000Z' }, error: null });
    backup.scheduleBackup(0);
    await settle();
    expect(upsert).not.toHaveBeenCalled();
    expect(backup.isAutoBackupPaused()).toBe(true);
  });

  it('fails closed on a corrupt persisted owner marker', async () => {
    restartWithMarker('{invalid');
    preference.resolve('0');
    backup.scheduleBackup(0);
    await settle();
    expect(upsert).not.toHaveBeenCalled();
    expect(backup.isAutoBackupPaused()).toBe(true);
  });

});
