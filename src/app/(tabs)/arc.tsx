import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dateForDay } from '@/engine/dates';
import { DaySummary, PILLARS } from '@/engine/scoring';
import { taskFor, useArcStore, useScore } from '@/state/arcStore';
import { Card, Screen, SectionLabel } from '@/ui/components';
import { colors, pillarMeta } from '@/ui/theme';

const KIND_STYLE: Record<DaySummary['kind'], { bg: string; label: string }> = {
  complete: { bg: colors.success, label: 'All 4 done' },
  partial: { bg: colors.warn, label: 'Partial' },
  missed: { bg: colors.danger, label: 'Missed' },
  skipped: { bg: colors.skip, label: 'Skip day' },
  pending: { bg: colors.cardRaised, label: 'In progress' },
  future: { bg: colors.card, label: 'Upcoming' },
};

const STATUS_TEXT = {
  done: '✓ Done',
  missed: '✗ Missed',
  skipped: '— Skipped',
  pending: '… Open',
  future: 'Upcoming',
} as const;

export default function Arc() {
  const data = useArcStore((s) => s.data);
  const score = useScore();
  const [selected, setSelected] = useState<number | null>(null);
  if (!data || !score) return null;

  const sel = selected ?? Math.max(1, Math.min(100, score.currentDay));
  const completeDays = score.days.filter((d) => d.kind === 'complete').length;

  return (
    <Screen title="Your Arc" subtitle={`${completeDays} perfect days · ${score.skipsLeft} skips left`}>
      <Card>
        <View style={styles.grid}>
          {score.days.map((d) => (
            <Pressable
              key={d.day}
              onPress={() => setSelected(d.day)}
              accessibilityLabel={`Day ${d.day}: ${KIND_STYLE[d.kind].label}`}
              style={[
                styles.cell,
                { backgroundColor: KIND_STYLE[d.kind].bg },
                d.kind === 'partial' && { opacity: 0.4 + d.doneCount * 0.15 },
                d.day === score.currentDay && styles.today,
                d.day === sel && styles.selected,
              ]}
            >
              <Text style={[styles.cellText, d.kind === 'future' && { color: colors.muted }]}>{d.day}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.legend}>
          {(['complete', 'partial', 'missed', 'skipped'] as const).map((k) => (
            <View key={k} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: KIND_STYLE[k].bg }]} />
              <Text style={styles.legendText}>{KIND_STYLE[k].label}</Text>
            </View>
          ))}
        </View>
      </Card>

      <SectionLabel>
        Day {sel} · {dateForDay(data.cycle.startDate, sel)}
      </SectionLabel>
      <Card>
        {PILLARS.map((p) => {
          const status = score.pillars[p].statuses[sel - 1];
          return (
            <View key={p} style={styles.dayRow}>
              <Text style={[styles.dayPillar, { color: pillarMeta[p].color }]}>{pillarMeta[p].label}</Text>
              <Text style={styles.dayTask}>{taskFor(data, p, sel).title}</Text>
              <Text style={styles.dayStatus}>{STATUS_TEXT[status]}</Text>
            </View>
          );
        })}
      </Card>

      <SectionLabel>Pillars</SectionLabel>
      <Card>
        {PILLARS.map((p) => {
          const ps = score.pillars[p];
          return (
            <View key={p} style={styles.pillarRow}>
              <Text style={[styles.dayPillar, { color: pillarMeta[p].color, width: 80 }]}>{pillarMeta[p].label}</Text>
              <Text style={styles.pillarStat}>
                {ps.net} pts · streak {ps.currentStreak} (best {ps.bestStreak})
                {ps.outstanding > 0 ? ` · −${ps.outstanding} owed` : ''}
              </Text>
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cell: {
    width: '9.1%',
    aspectRatio: 1,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: { color: colors.bg, fontSize: 9, fontWeight: '700' },
  today: { borderWidth: 2, borderColor: colors.accent },
  selected: { borderWidth: 2, borderColor: colors.text },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  legendText: { color: colors.muted, fontSize: 12 },
  dayRow: { gap: 2, paddingVertical: 4 },
  dayPillar: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  dayTask: { color: colors.text, fontSize: 15 },
  dayStatus: { color: colors.muted, fontSize: 13 },
  pillarRow: { flexDirection: 'row', alignItems: 'center' },
  pillarStat: { color: colors.text, fontSize: 14, flex: 1 },
});
