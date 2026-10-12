import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useAuthStore } from '@/state/authStore';
import { Button, Card, ErrorText, Field, Screen } from '@/ui/components';
import { colors } from '@/ui/theme';

// Web version: code entry only. Enrolling an authenticator and restoring backups happen in the phone app.
export default function Mfa() {
  const status = useAuthStore((s) => s.status);
  const verifiedFactorId = useAuthStore((s) => s.verifiedFactorId);
  const verifyCode = useAuthStore((s) => s.verifyCode);
  const signOut = useAuthStore((s) => s.signOut);

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = async () => {
    setError(null);
    if (!verifiedFactorId) return setError('Set up 2-factor in the phone app first.');
    if (!/^\d{6}$/.test(code.trim())) return setError('Enter the 6-digit code from your authenticator app.');
    setBusy(true);
    try {
      await verifyCode(verifiedFactorId, code);
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

  return (
    <Screen title="Enter your code" subtitle="From your authenticator app">
      {status === 'needsMfaSetup' ? (
        <Card>
          <Text style={styles.body}>
            This account doesn&apos;t have 2-factor yet. Open Winter Arc on your phone, go to Settings, and set it up
            there, then come back and sign in.
          </Text>
        </Card>
      ) : (
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
      )}
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
});
