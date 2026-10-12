import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, StyleSheet, Text } from 'react-native';

import * as repo from '@/db/repo';
import { useArcStore } from '@/state/arcStore';
import { useAuthStore } from '@/state/authStore';
import { unlessLocked } from '@/state/lockStore';
import {
  beginBackupReconciliation,
  isAutoBackupPaused,
  reconcileBackup,
  restoreLatest,
  resumeAutoBackup,
  scheduleBackup,
} from '@/sync/backup';
import { Button, Card, ErrorText, Field, Screen } from '@/ui/components';
import { colors } from '@/ui/theme';

export default function Mfa() {
  const status = useAuthStore((s) => s.status);
  const verifiedFactorId = useAuthStore((s) => s.verifiedFactorId);
  const startEnrollment = useAuthStore((s) => s.startEnrollment);
  const verifyCode = useAuthStore((s) => s.verifyCode);
  const signOut = useAuthStore((s) => s.signOut);
  const reloadFromDb = useArcStore((s) => s.reloadFromDb);

  const [enrollment, setEnrollment] = useState<{ factorId: string; secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setup = async () => {
    setError(null);
    setBusy(true);
    try {
      setEnrollment(await startEnrollment());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start setup.');
    } finally {
      setBusy(false);
    }
  };

  /** After 2-factor succeeds: pull an existing backup onto a fresh phone, otherwise back up this one. */
  const afterVerified = async () => {
    const accountId = useAuthStore.getState().session?.user.id;
    const forThisAccount = (fn: () => void) => unlessLocked(() => {
      if (useAuthStore.getState().session?.user.id === accountId) fn();
    });
    const backup = await reconcileBackup();
    if (useAuthStore.getState().session?.user.id !== accountId) throw new Error('The signed-in account changed. Try again.');
    if (backup && !repo.hasAnyData()) {
      await restoreLatest();
      reloadFromDb();
      Alert.alert('Welcome back', 'Your Arc was restored from your cloud backup.');
      router.replace('/');
      return;
    }
    if (!backup || (repo.hasAnyData() && !isAutoBackupPaused())) {
      scheduleBackup(0);
      router.back();
      return;
    }
    // Both this phone and the cloud have data: never overwrite either silently. Automatic backups stay paused
    // until the user answers, so a tap swallowed by the lock (alerts float above it) can't let the phone win by
    // default; Settings then shows both ways out (Back up now / Restore).
    beginBackupReconciliation();
    Alert.alert(
      'Which copy should we keep?',
      `You have a cloud backup from ${new Date(backup.updatedAt).toLocaleString()} and data on this phone.`,
      [
        {
          text: 'Keep this phone',
          onPress: forThisAccount(() => {
            resumeAutoBackup();
            scheduleBackup(0);
            router.back();
          }),
        },
        {
          text: 'Restore cloud backup',
          style: 'destructive',
          onPress: forThisAccount(() => {
            restoreLatest()
              .then(() => {
                resumeAutoBackup();
                reloadFromDb();
                router.replace('/');
              })
              .catch((e: unknown) =>
                Alert.alert('Could not restore', e instanceof Error ? e.message : 'Try again from Settings.'),
              );
          }),
        },
      ],
      { cancelable: false },
    );
  };

  const verify = async () => {
    const factorId = enrollment?.factorId ?? verifiedFactorId;
    setError(null);
    if (!factorId) return setError('Start setup first.');
    if (!/^\d{6}$/.test(code.trim())) return setError('Enter the 6-digit code from your authenticator app.');
    setBusy(true);
    try {
      beginBackupReconciliation();
      await verifyCode(factorId, code);
      await afterVerified();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code did not work. Try the newest one.');
    } finally {
      setBusy(false);
    }
  };

  if (status === 'ready') {
    return (
      <Screen title="2-factor is on" subtitle="Your account is protected.">
        <ErrorText>{error}</ErrorText>
        {error ? (
          <Button
            label={busy ? 'Checking backup…' : 'Retry backup check'}
            disabled={busy}
            onPress={async () => {
              setError(null);
              setBusy(true);
              try {
                await afterVerified();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not check your cloud backup. Automatic backup stays paused.');
              } finally {
                setBusy(false);
              }
            }}
          />
        ) : null}
        <Button label={busy ? 'Checking backup…' : 'Done'} disabled={busy} onPress={() => router.back()} />
      </Screen>
    );
  }

  const enrolling = status === 'needsMfaSetup';

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen
        title={enrolling ? 'Set up 2-factor' : 'Enter your code'}
        subtitle={enrolling ? 'One-time setup with an authenticator app' : 'From your authenticator app'}
      >
        {enrolling && !enrollment ? (
          <Card>
            <Text style={styles.body}>
              You need an authenticator app, such as Google Authenticator, Microsoft Authenticator, or the iPhone
              Passwords app. It shows a new 6-digit code every 30 seconds.
            </Text>
            <Button label={busy ? 'Working…' : 'Start setup'} onPress={setup} disabled={busy} />
          </Card>
        ) : null}

        {enrollment ? (
          <Card>
            <Text style={styles.step}>1. Add Winter Arc to your authenticator</Text>
            <Button
              label="Open authenticator app"
              variant="secondary"
              icon="key"
              onPress={() =>
                Linking.openURL(enrollment.uri).catch(() =>
                  Alert.alert('No app opened', 'Copy the setup key below into your authenticator app instead.'),
                )
              }
            />
            <Text style={styles.muted}>Or type this setup key into the app (press and hold to copy):</Text>
            <Text selectable style={styles.secret}>
              {enrollment.secret}
            </Text>
            <Text style={styles.step}>2. Enter the 6-digit code it shows</Text>
          </Card>
        ) : null}

        {enrollment || !enrolling ? (
          <Card>
            <Field
              label="6-digit code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
            />
            <ErrorText>{error}</ErrorText>
            <Button label={busy ? 'Checking…' : 'Verify'} onPress={verify} disabled={busy} />
          </Card>
        ) : (
          <ErrorText>{error}</ErrorText>
        )}

        <Button
          label="Sign out"
          variant="secondary"
          onPress={async () => {
            await signOut();
            router.back();
          }}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  step: { color: colors.text, fontSize: 16, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 14 },
  secret: {
    color: colors.accent,
    fontSize: 16,
    fontFamily: 'Courier',
    letterSpacing: 1,
    backgroundColor: colors.cardRaised,
    padding: 12,
    borderRadius: 10,
  },
});
