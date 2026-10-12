import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';

import { PILLARS } from '@/engine/scoring';
import { useArcStore } from '@/state/arcStore';
import { useAuthStore } from '@/state/authStore';
import { unlessLocked, useLockStore } from '@/state/lockStore';
import {
  backupNow,
  deleteCloudBackup,
  isAutoBackupPaused,
  latestBackup,
  restoreLatest,
  setAutoBackupListener,
} from '@/sync/backup';
import { Button, Card, Screen, SectionLabel } from '@/ui/components';
import { colors, pillarMeta } from '@/ui/theme';

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function Settings() {
  const data = useArcStore((s) => s.data);
  const resetAll = useArcStore((s) => s.resetAll);
  const reloadFromDb = useArcStore((s) => s.reloadFromDb);
  const status = useAuthStore((s) => s.status);
  const email = useAuthStore((s) => s.email);
  const signOut = useAuthStore((s) => s.signOut);
  const lockEnabled = useLockStore((s) => s.enabled);
  const setLockEnabled = useLockStore((s) => s.setEnabled);

  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadBackupInfo = useCallback(() => {
    setPaused(isAutoBackupPaused());
    if (status !== 'ready') return setLastBackup(null);
    latestBackup()
      .then((b) => setLastBackup(b?.updatedAt ?? null))
      .catch(() => setLastBackup(null));
  }, [status]);

  useFocusEffect(loadBackupInfo);

  useEffect(() => {
    setAutoBackupListener((at) => {
      setLastBackup(at);
      setPaused(isAutoBackupPaused());
    });
    return () => setAutoBackupListener(null);
  }, []);

  if (!data) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Something went wrong', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Settings">
      <SectionLabel>Account and backup</SectionLabel>
      <Card>
        {status === 'unavailable' ? (
          <Text style={styles.muted}>{"Cloud backup isn't connected in this build yet."}</Text>
        ) : status === 'signedOut' ? (
          <>
            <Text style={styles.muted}>
              Sign in to back up your Arc to the cloud, protected by a password and 2-factor code.
            </Text>
            <Button label="Sign in or create account" icon="person-circle" onPress={() => router.push('/account')} />
          </>
        ) : status === 'ready' ? (
          <>
            <Text style={styles.text}>{email}</Text>
            <Text style={styles.muted}>
              {lastBackup ? `Last backup: ${formatTime(lastBackup)}` : 'No backup yet.'}{' '}
              {paused ? 'Automatic backup is off until you tap Back up now.' : 'Changes back up automatically.'}
            </Text>
            <Button
              label={busy ? 'Working…' : 'Back up now'}
              icon="cloud-upload"
              disabled={busy}
              onPress={() =>
                run(async () => {
                  try {
                    setLastBackup(await backupNow());
                  } finally {
                    // Resumes only if the upload landed; keep the copy honest either way.
                    setPaused(isAutoBackupPaused());
                  }
                })
              }
            />
            <Button
              label="Restore from backup"
              variant="secondary"
              icon="cloud-download"
              disabled={busy || !lastBackup}
              onPress={() =>
                Alert.alert('Restore from backup?', 'This replaces everything on this phone with your last backup.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Restore',
                    style: 'destructive',
                    onPress: unlessLocked(() =>
                      run(async () => {
                        await restoreLatest();
                        reloadFromDb();
                      }),
                    ),
                  },
                ])
              }
            />
            <Button label="Sign out" variant="secondary" onPress={() => run(signOut)} />
          </>
        ) : (
          <>
            <Text style={styles.text}>{email}</Text>
            <Text style={[styles.muted, { color: colors.warn }]}>
              {status === 'needsMfaSetup'
                ? 'Finish 2-factor setup to turn on backups.'
                : 'Enter your 2-factor code to turn on backups.'}
            </Text>
            <Button
              label={status === 'needsMfaSetup' ? 'Set up 2-factor' : 'Enter code'}
              icon="shield-checkmark"
              onPress={() => router.push('/mfa')}
            />
            <Button label="Sign out" variant="secondary" onPress={() => run(signOut)} />
          </>
        )}
      </Card>

      <SectionLabel>Privacy</SectionLabel>
      <Card>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.text}>App lock</Text>
            <Text style={styles.muted}>Ask for Face ID or your passcode when opening the app.</Text>
          </View>
          <Switch
            value={lockEnabled}
            onValueChange={async (v) => {
              const res = await setLockEnabled(v);
              if (!res.ok && res.message) Alert.alert('App lock', res.message);
            }}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </View>
        <Text style={styles.muted}>
          AI plans and coaching send your goal text, task titles and completion stats to Anthropic (Claude) to generate
          responses. Nothing else leaves your phone except your encrypted backup.
        </Text>
      </Card>

      <SectionLabel>This Arc</SectionLabel>
      <Card>
        <Text style={styles.muted}>Started {data.cycle.startDate}</Text>
        {PILLARS.map((p) => (
          <View key={p} style={{ gap: 2 }}>
            <Text style={[styles.label, { color: pillarMeta[p].color }]}>{pillarMeta[p].label}</Text>
            <Text style={styles.text}>{data.goals[p]}</Text>
          </View>
        ))}
      </Card>

      <SectionLabel>Data</SectionLabel>
      <Button
        label="Erase this phone's data"
        variant="danger"
        icon="trash"
        onPress={() =>
          Alert.alert(
            'Erase this phone?',
            status === 'ready'
              ? 'Deletes your goals and progress from this phone. Your cloud backup is kept: restore it from the setup screen before starting a new Arc, which would replace it.'
              : 'This permanently deletes your goals, progress and history.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Erase', style: 'destructive', onPress: unlessLocked(resetAll) },
            ],
          )
        }
      />
      {status === 'ready' ? (
        <Button
          label="Delete cloud backup"
          variant="danger"
          icon="cloud-offline"
          disabled={busy || !lastBackup}
          onPress={() =>
            Alert.alert(
              'Delete cloud backup?',
              'Your backup is removed from the cloud. This phone keeps its data, and automatic backups stay off until you tap Back up now.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: unlessLocked(() =>
                    run(async () => {
                      await deleteCloudBackup();
                      setLastBackup(null);
                      setPaused(true);
                    }),
                  ),
                },
              ],
            )
          }
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  label: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  text: { color: colors.text, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
