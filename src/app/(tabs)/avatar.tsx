import { StyleSheet, Text, View } from 'react-native';

import { nextPhase, PHASES, progressToNext } from '@/engine/phases';
import { useScore } from '@/state/arcStore';
import { Card, ProgressBar, Screen, SectionLabel } from '@/ui/components';
import { PhaseAvatar } from '@/ui/PhaseAvatar';
import { colors } from '@/ui/theme';

export default function Avatar() {
  const score = useScore();
  if (!score) return null;
  const next = nextPhase(score.phase);

  return (
    <Screen title="Avatar" subtitle="Your life, one phase at a time">
      <Card style={styles.hero}>
        <PhaseAvatar phase={score.phase} size={200} />
        <Text style={styles.heroLevel}>PHASE {score.phase.level}</Text>
        <Text style={styles.heroTitle}>{score.phase.title}</Text>
        <View style={{ alignSelf: 'stretch', gap: 6 }}>
          <ProgressBar value={progressToNext(score.net)} />
          <Text style={styles.muted}>
            {next ? `${score.net} / ${next.minPoints} pts to ${next.title}` : `${score.net} pts. Final form.`}
          </Text>
        </View>
      </Card>

      <SectionLabel>The path</SectionLabel>
      {PHASES.map((p) => {
        const unlocked = score.net >= p.minPoints;
        const current = p.level === score.phase.level;
        return (
          <View key={p.level} style={[styles.row, current && styles.rowCurrent, !unlocked && { opacity: 0.45 }]}>
            <PhaseAvatar phase={p} size={48} locked={!unlocked} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                {p.level}. {p.title}
              </Text>
              <Text style={styles.muted}>{p.minPoints} pts</Text>
            </View>
            {current ? <Text style={styles.badge}>YOU</Text> : null}
          </View>
        );
      })}
      <Text style={styles.note}>Penalties can drop you back a phase.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: 24 },
  heroLevel: { color: colors.accent, fontSize: 13, fontWeight: '800', letterSpacing: 2 },
  heroTitle: { color: colors.text, fontSize: 24, fontWeight: '800', marginBottom: 8 },
  muted: { color: colors.muted, fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
  },
  rowCurrent: { borderColor: colors.accent },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  badge: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  note: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 4 },
});
