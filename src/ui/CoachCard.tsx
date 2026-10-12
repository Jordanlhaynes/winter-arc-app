import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import * as repo from '@/db/repo';
import { coachSlotFor, useAiStore } from '@/state/aiStore';
import { useArcStore } from '@/state/arcStore';
import { useAuthStore } from '@/state/authStore';

import { Card } from './components';
import { colors } from './theme';

export function CoachCard({ day }: { day: number }) {
  const data = useArcStore((s) => s.data);
  const now = useArcStore((s) => s.now);
  const authStatus = useAuthStore((s) => s.status);
  const { planning, planError, coachLoading, coachError, retry } = useAiStore();

  if (!data || authStatus === 'unavailable') return null;

  if (authStatus !== 'ready') {
    return (
      <Pressable onPress={() => router.push(authStatus === 'signedOut' ? '/account' : '/mfa')}>
        <Card style={styles.hintCard}>
          <View style={styles.row}>
            <Ionicons name="sparkles" size={18} color={colors.accent} />
            <Text style={styles.hint}>Sign in to get AI daily plans and coaching</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </View>
        </Card>
      </Pressable>
    );
  }

  const slot = coachSlotFor(now);
  const message = repo.getCoachMessage(data.cycle.id, day, slot);
  const error = coachError ?? planError;

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Ionicons name="sparkles" size={16} color={colors.accent} />
        <Text style={styles.label}>{slot === 'morning' ? 'Morning coach' : 'Evening coach'}</Text>
      </View>
      {message ? (
        <Text style={styles.message}>{message}</Text>
      ) : coachLoading ? (
        <Text style={styles.muted}>Your coach is thinking…</Text>
      ) : null}
      {planning ? <Text style={styles.muted}>Planning your next 10 days of tasks…</Text> : null}
      {error ? (
        <Pressable onPress={retry}>
          <Text style={styles.error}>
            {error} <Text style={styles.retry}>Retry</Text>
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderColor: colors.accent },
  hintCard: { paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  hint: { color: colors.text, fontSize: 15, flex: 1 },
  message: { color: colors.text, fontSize: 15, lineHeight: 22 },
  muted: { color: colors.muted, fontSize: 14 },
  error: { color: colors.warn, fontSize: 14 },
  retry: { color: colors.accent, fontWeight: '700' },
});
