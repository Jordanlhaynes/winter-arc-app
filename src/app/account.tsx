import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text } from 'react-native';

import { useAuthStore } from '@/state/authStore';
import { Button, Card, ErrorText, Field, Screen } from '@/ui/components';
import { colors } from '@/ui/theme';

export default function Account() {
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sendPasswordReset = useAuthStore((s) => s.sendPasswordReset);

  // Web only for now: the email link opens the reset page in this browser.
  const forgot = async () => {
    setError(null);
    setNotice(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Type your email above first.');
    setBusy(true);
    try {
      await sendPasswordReset(email.trim(), `${window.location.origin}/reset-password`);
      setNotice('Check your email for a reset link. Open it in this browser.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the email. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Use a password of at least 8 characters.');
    setBusy(true);
    try {
      if (mode === 'signUp') {
        const { needsEmailConfirm } = await signUp(email.trim(), password);
        if (needsEmailConfirm) {
          Alert.alert(
            'Check your email',
            'Tap the confirmation link we sent you, then come back here and sign in. (If the link opens an error page, that is fine — your account is still confirmed.)',
          );
          setMode('signIn');
          return;
        }
      } else {
        await signIn(email.trim(), password);
      }
      router.replace('/mfa');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen
        title={mode === 'signIn' ? 'Sign in' : 'Create account'}
        subtitle="For secure cloud backup of your Arc"
      >
        <Card>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@example.com"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
            textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
            placeholder="At least 8 characters"
          />
          <ErrorText>{error}</ErrorText>
          <Button
            label={busy ? 'Working…' : mode === 'signIn' ? 'Sign in' : 'Create account'}
            onPress={submit}
            disabled={busy}
          />
        </Card>
        {mode === 'signIn' && Platform.OS === 'web' ? (
          <Pressable onPress={forgot} disabled={busy}>
            <Text style={styles.switch}>Forgot password?</Text>
          </Pressable>
        ) : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {/* The public web page is sign-in only; new accounts are made from the phone app (sign-ups are off). */}
        {Platform.OS !== 'web' ? (
          <Pressable onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
            <Text style={styles.switch}>
              {mode === 'signIn' ? 'New here? Create an account' : 'Have an account? Sign in'}
            </Text>
          </Pressable>
        ) : null}
        <Text style={styles.note}>
          Next you will set up a 6-digit code from an authenticator app (2-factor). Backups only work after that.
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  switch: { color: colors.accent, fontSize: 15, textAlign: 'center', padding: 8 },
  note: { color: colors.muted, fontSize: 13, textAlign: 'center' },
  notice: { color: colors.success, fontSize: 14, textAlign: 'center' },
});
