import { router } from 'expo-router';
import { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';

import { useAuthStore } from '@/state/authStore';
import { useJournalStore } from '@/state/journalStore';

import { Button, Card, Screen } from './components';
import { colors } from './theme';

/** Notes and the log live in the cloud, so they need a 2-factor session before showing anything. */
export function JournalGate({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const authStatus = useAuthStore((s) => s.status);
  const status = useJournalStore((s) => s.status);
  const error = useJournalStore((s) => s.error);
  const reload = useJournalStore((s) => s.reload);

  if (authStatus !== 'ready') {
    const message =
      authStatus === 'unavailable'
        ? 'Cloud is not configured for this build.'
        : authStatus === 'signedOut'
          ? 'Sign in to sync notes and your log between your phone and the web.'
          : 'Finish 2-factor to unlock your notes and log.';
    return (
      <Screen title={title} subtitle={subtitle}>
        <Card>
          <Text style={styles.body}>{message}</Text>
          {authStatus === 'signedOut' ? <Button label="Sign in" onPress={() => router.push('/account')} /> : null}
          {authStatus === 'needsMfaSetup' || authStatus === 'needsMfaCode' ? (
            <Button label="Enter code" onPress={() => router.push('/mfa')} />
          ) : null}
        </Card>
      </Screen>
    );
  }

  if (status === 'error') {
    return (
      <Screen title={title} subtitle={subtitle}>
        <Card>
          <Text style={styles.body}>Could not load: {error}</Text>
          <Button label="Try again" variant="secondary" onPress={() => void reload().catch(() => {})} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title={title} subtitle={subtitle}>
      {status === 'ready' ? children : <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
});
