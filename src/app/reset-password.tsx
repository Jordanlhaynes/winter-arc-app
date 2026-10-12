import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useAuthStore } from '@/state/authStore';
import { Button, Card, ErrorText, Field, Screen } from '@/ui/components';
import { colors } from '@/ui/theme';

// Opened from the password-reset email. The link signs you in for this one step;
// with 2-factor on, the 6-digit code is required too, so the email alone can't change the password.
export default function ResetPassword() {
  const status = useAuthStore((s) => s.status);
  const verifiedFactorId = useAuthStore((s) => s.verifiedFactorId);
  const verifyCode = useAuthStore((s) => s.verifyCode);
  const updatePassword = useAuthStore((s) => s.updatePassword);

  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const checked = useAuthStore((s) => s.checked);
  const needsCode = status === 'needsMfaCode';

  const save = async () => {
    setError(null);
    if (password.length < 8) return setError('Use a password of at least 8 characters.');
    if (needsCode && !/^\d{6}$/.test(code.trim())) return setError('Enter the 6-digit code from your authenticator app.');
    setBusy(true);
    try {
      if (needsCode && verifiedFactorId) await verifyCode(verifiedFactorId, code);
      await updatePassword(password);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the password. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Screen title="Password changed" subtitle="Use the new one next time you sign in.">
        <Button label="Go to notes" onPress={() => router.replace('/notes')} />
      </Screen>
    );
  }

  if (!checked) return <Screen title="Reset password">{null}</Screen>;

  if (status === 'signedOut' || status === 'unavailable') {
    return (
      <Screen title="Reset password" subtitle="This page opens from the email link">
        <Card>
          <Text style={styles.body}>
            The reset link has expired or was already used. Go back to Sign in and choose &quot;Forgot password?&quot; to get
            a new one.
          </Text>
          <Button label="Back to sign in" onPress={() => router.replace('/account')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Choose a new password">
      <Card>
        <Field
          label="New password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          placeholder="At least 8 characters"
        />
        {needsCode ? (
          <Field
            label="6-digit code from your authenticator"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
          />
        ) : null}
        <ErrorText>{error}</ErrorText>
        <Button label={busy ? 'Saving…' : 'Save new password'} onPress={save} disabled={busy} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
});
