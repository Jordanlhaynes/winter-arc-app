import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Goals } from '@/db/repo';
import { PILLARS } from '@/engine/scoring';
import { useArcStore } from '@/state/arcStore';
import { useAuthStore } from '@/state/authStore';
import { unlessLocked } from '@/state/lockStore';
import { BackupInfo, reconcileBackup, restoreLatest, resumeAutoBackup } from '@/sync/backup';
import { Button, Card, ErrorText, Screen } from '@/ui/components';
import { colors, pillarMeta } from '@/ui/theme';

const EMPTY: Goals = { personal: '', physical: '', financial: '', career: '' };

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function Setup() {
  const status = useAuthStore((s) => s.status);
  const accountId = useAuthStore((s) => s.session?.user.id ?? 'offline');
  return <SetupForm key={`${accountId}:${status}`} />;
}

function SetupForm() {
  const startArc = useArcStore((s) => s.startArc);
  const reloadFromDb = useArcStore((s) => s.reloadFromDb);
  const authStatus = useAuthStore((s) => s.status);
  const authChecked = useAuthStore((s) => s.checked);
  const accountId = useAuthStore((s) => s.session?.user.id);
  const cloud = authStatus !== 'unavailable';
  const signedIn = authStatus !== 'unavailable' && authStatus !== 'signedOut';
  const [goals, setGoals] = useState<Goals>(EMPTY);
  const [fetched, setFetched] = useState<BackupInfo>(null);
  const [busy, setBusy] = useState(false);
  const [backupChecked, setBackupChecked] = useState(false);
  const [checkedAccountId, setCheckedAccountId] = useState<string | undefined>();
  const [backupError, setBackupError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const ready = PILLARS.every((p) => goals[p].trim().length > 0);
  // This screen is also where you land right after "Erase this phone's data", which keeps the cloud backup;
  // offer it back here, since Settings (the other Restore button) is unreachable without an Arc.
  const checkedCurrentAccount = backupChecked && checkedAccountId === accountId;
  const backup = authStatus === 'ready' && checkedCurrentAccount ? fetched : null;

  useEffect(() => {
    if (authStatus !== 'ready') return;
    let cancelled = false;
    reconcileBackup()
      .then((b) => {
        if (!cancelled) {
          setFetched(b);
          setBackupChecked(true);
          setCheckedAccountId(accountId);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setBackupError(e instanceof Error ? e.message : 'Could not check your cloud backup.');
      });
    return () => {
      cancelled = true;
    };
  }, [authStatus, accountId, retry]);

  const restore = () => {
    if (!backup) return;
    Alert.alert('Restore your cloud backup?', `Backed up ${formatTime(backup.updatedAt)}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restore',
        onPress: unlessLocked(() => {
          if (useAuthStore.getState().session?.user.id !== accountId) return;
          setBusy(true);
          restoreLatest()
            .then(() => {
              reloadFromDb();
              router.replace('/today');
            })
            .catch((e: unknown) => Alert.alert('Could not restore', e instanceof Error ? e.message : 'Try again.'))
            .finally(() => setBusy(false));
        }),
      },
    ]);
  };

  const start = () => {
    if (!authChecked || busy || (authStatus === 'ready' && !checkedCurrentAccount)) return;
    const go = () => {
      if (useAuthStore.getState().session?.user.id !== accountId) return;
      if (backup) resumeAutoBackup();
      startArc({
        personal: goals.personal.trim(),
        physical: goals.physical.trim(),
        financial: goals.financial.trim(),
        career: goals.career.trim(),
      });
      router.replace('/today');
    };
    if (!backup) return go();
    // A new Arc backs itself up within seconds, replacing the cloud copy. Make sure that's the intent.
    Alert.alert(
      'Start a new Arc?',
      `Your cloud backup from ${formatTime(backup.updatedAt)} will be replaced by this new Arc the next time this phone backs up.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore backup instead', onPress: unlessLocked(restore) },
        { text: 'Start new Arc', style: 'destructive', onPress: unlessLocked(go) },
      ],
    );
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen title="Begin your Winter Arc" subtitle="100 days. 4 pillars. One goal each.">
        {backup ? (
          <Card style={{ borderColor: colors.accent }}>
            <Text style={styles.introText}>You have a cloud backup from {formatTime(backup.updatedAt)}.</Text>
            <Button label={busy ? 'Restoring…' : 'Restore it'} icon="cloud-download" onPress={restore} disabled={busy} />
          </Card>
        ) : null}
        <Card style={styles.intro}>
          <Text style={styles.introText}>
            Every pillar you complete each day earns 1 point, for a maximum of 400. Points level up your avatar
            from Grifter to Grand Master. A single missed day is forgiven, but each further miss in a row
            costs 1 point.
          </Text>
        </Card>

        {PILLARS.map((p) => {
          const meta = pillarMeta[p];
          return (
            <View key={p} style={styles.field}>
              <View style={styles.labelRow}>
                <Ionicons name={meta.icon} size={16} color={meta.color} />
                <Text style={[styles.label, { color: meta.color }]}>{meta.label}</Text>
              </View>
              <TextInput
                value={goals[p]}
                onChangeText={(t) => setGoals((g) => ({ ...g, [p]: t }))}
                placeholder={meta.hint}
                placeholderTextColor={colors.muted}
                style={styles.input}
                multiline
                maxLength={200}
              />
            </View>
          );
        })}

        <ErrorText>{backupError}</ErrorText>
        {backupError ? (
          <Button label="Retry backup check" variant="secondary" onPress={() => {
            setFetched(null);
            setBackupChecked(false);
            setCheckedAccountId(undefined);
            setBackupError(null);
            setRetry((v) => v + 1);
          }} disabled={busy} />
        ) : null}
        <Button
          label={authStatus === 'ready' && !checkedCurrentAccount && !backupError ? 'Checking cloud backup…' : 'Start Day 1'}
          icon="snow"
          onPress={start}
          disabled={!ready || busy || !authChecked || (authStatus === 'ready' && !checkedCurrentAccount)}
        />

        {/* Once signed in with 2-factor the backup card above says it all; before that, point at sign-in / the code. */}
        {cloud && authStatus !== 'ready' ? (
          <Pressable onPress={() => router.push(signedIn ? '/mfa' : '/account')}>
            <Text style={styles.restore}>Already have a backup? Sign in to restore it</Text>
          </Pressable>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  intro: { backgroundColor: colors.cardRaised },
  restore: { color: colors.accent, fontSize: 15, textAlign: 'center', padding: 8 },
  introText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  field: { gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 13, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    fontSize: 16,
    padding: 14,
    minHeight: 52,
  },
});
