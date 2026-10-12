import { router } from 'expo-router';
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { useAuthStore } from '@/state/authStore';
import { Button, Card, ErrorText, Field, Screen } from '@/ui/components';
import { colors } from '@/ui/theme';

// Web version: sets up an authenticator (scan the QR code with a phone) and takes codes. Restoring backups
// happens in the phone app.
export default function Mfa() {
  const status = useAuthStore((s) => s.status);
  const verifiedFactorId = useAuthStore((s) => s.verifiedFactorId);
  const startEnrollment = useAuthStore((s) => s.startEnrollment);
  const verifyCode = useAuthStore((s) => s.verifyCode);
  const signOut = useAuthStore((s) => s.signOut);

  const [enrollment, setEnrollment] = useState<{ factorId: string; secret: string; qrCode: string } | null>(null);
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

  const verify = async () => {
    const factorId = enrollment?.factorId ?? verifiedFactorId;
    setError(null);
    if (!factorId) return setError('Start setup first.');
    if (!/^\d{6}$/.test(code.trim())) return setError('Enter the 6-digit code from your authenticator app.');
    setBusy(true);
    try {
      await verifyCode(factorId, code);
      router.replace('/notes');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code did not work. Try the newest one.');
    } finally {
      setBusy(false);
    }
  };

  if (status === 'ready') {
    return (
      <Screen title="You're in" subtitle="Notes and your log are unlocked.">
        <Button label="Go to notes" onPress={() => router.replace('/notes')} />
      </Screen>
    );
  }

  const enrolling = status === 'needsMfaSetup';

  return (
    <Screen
      title={enrolling ? 'Set up 2-factor' : 'Enter your code'}
      subtitle={enrolling ? 'One-time setup with an authenticator app' : 'From your authenticator app'}
    >
      {enrolling && !enrollment ? (
        <Card>
          <Text style={styles.body}>
            You need an authenticator app on your phone, such as the iPhone Passwords app, Google Authenticator or
            Microsoft Authenticator. It shows a new 6-digit code every 30 seconds.
          </Text>
          <ErrorText>{error}</ErrorText>
          <Button label={busy ? 'Working…' : 'Start setup'} onPress={setup} disabled={busy} />
        </Card>
      ) : null}

      {enrollment ? (
        <Card>
          <Text style={styles.step}>1. Scan this with your phone</Text>
          <Text style={styles.muted}>
            On iPhone, point the Camera at it and tap the yellow link, or use Add Code in the Passwords app.
          </Text>
          <View style={styles.qrWrap}>
            <Image source={{ uri: enrollment.qrCode }} style={styles.qr} accessibilityLabel="Authenticator QR code" />
          </View>
          <Text style={styles.muted}>Can&apos;t scan? Type this setup key into your authenticator app:</Text>
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
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            onSubmitEditing={verify}
          />
          <ErrorText>{error}</ErrorText>
          <Button label={busy ? 'Checking…' : 'Verify'} onPress={verify} disabled={busy} />
        </Card>
      ) : null}

      <Button
        label="Sign out"
        variant="secondary"
        onPress={async () => {
          await signOut();
          router.replace('/notes');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  step: { color: colors.text, fontSize: 16, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 14 },
  qrWrap: { alignSelf: 'center', backgroundColor: '#FFFFFF', padding: 12, borderRadius: 12 },
  qr: { width: 200, height: 200 },
  secret: {
    color: colors.accent,
    fontSize: 16,
    fontFamily: 'monospace',
    letterSpacing: 1,
    backgroundColor: colors.cardRaised,
    padding: 12,
    borderRadius: 10,
  },
});
