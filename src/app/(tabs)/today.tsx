import { Alert, StyleSheet, Text, View } from 'react-native';

import { CYCLE_LENGTH, isDayEditable } from '@/engine/dates';
import { nextPhase, progressToNext } from '@/engine/phases';
import { ArcScore, PILLARS, PillarType } from '@/engine/scoring';
import { backlogFor, taskFor, useArcStore, useScore } from '@/state/arcStore';
import { CoachCard } from '@/ui/CoachCard';
import { Button, Card, ProgressBar, Screen, SectionLabel } from '@/ui/components';
import { PhaseAvatar } from '@/ui/PhaseAvatar';
import { PillarTask } from '@/ui/PillarTask';
import { colors, pillarMeta } from '@/ui/theme';

export default function Today() {
  const data = useArcStore((s) => s.data);
  const now = useArcStore((s) => s.now);
  const score = useScore();
  if (!data || !score) return null;

  if (score.isComplete) return <ArcComplete score={score} />;

  const day = Math.max(1, Math.min(CYCLE_LENGTH, score.currentDay));
  const yesterday = day - 1;
  const showYesterday =
    yesterday >= 1 &&
    isDayEditable(data.cycle.startDate, yesterday, now) &&
    !score.skipDays.has(yesterday) &&
    score.days[yesterday - 1].doneCount < PILLARS.length;
  const penalized = PILLARS.filter((p) => score.pillars[p].outstanding > 0);

  return (
    <Screen title={`Day ${day}`} subtitle={`of ${CYCLE_LENGTH} · Winter Arc`}>
      <PointsCard score={score} />
      <CoachCard day={day} />

      {score.skipDays.has(day) ? (
        <SkippedCard day={day} />
      ) : (
        <>
          <SectionLabel>{"Today's quests"}</SectionLabel>
          <DayTasks day={day} score={score} />
          <Text style={styles.hint}>Tap the box to complete a task. Long-press a task to edit it.</Text>
        </>
      )}

      {showYesterday ? (
        <>
          <SectionLabel>Yesterday · editable until noon</SectionLabel>
          <DayTasks day={yesterday} score={score} />
        </>
      ) : null}

      {penalized.length > 0 ? <MakeUpCard pillars={penalized} score={score} /> : null}

      {!score.skipDays.has(day) ? <SkipButton day={day} score={score} /> : null}
    </Screen>
  );
}

function PointsCard({ score }: { score: ArcScore }) {
  const next = nextPhase(score.phase);
  return (
    <Card>
      <View style={styles.pointsRow}>
        <PhaseAvatar phase={score.phase} size={64} />
        <View style={{ flex: 1 }}>
          <Text style={styles.phase}>
            Phase {score.phase.level} · {score.phase.title}
          </Text>
          <Text style={styles.points}>
            {score.net} <Text style={styles.pointsOf}>/ 400 pts</Text>
          </Text>
        </View>
      </View>
      <ProgressBar value={progressToNext(score.net)} />
      <Text style={styles.muted}>
        {next ? `${next.minPoints - score.net} pts to ${next.title}` : 'Final form reached'}
      </Text>
      {score.demotionRisk ? (
        <Text style={[styles.muted, { color: colors.danger }]}>
          {"You're slipping. One more repeat miss will drop you back a phase."}
        </Text>
      ) : null}
    </Card>
  );
}

function DayTasks({ day, score }: { day: number; score: ArcScore }) {
  const data = useArcStore((s) => s.data)!;
  const now = useArcStore((s) => s.now);
  const toggleDone = useArcStore((s) => s.toggleDone);
  const editTask = useArcStore((s) => s.editTask);
  const editable = isDayEditable(data.cycle.startDate, day, now);

  return (
    <View style={{ gap: 10 }}>
      {PILLARS.map((p) => {
        const ps = score.pillars[p];
        const status = ps.statuses[day - 1];
        let note: { text: string; tone: 'warn' | 'danger' | 'muted' } | undefined;
        if (status !== 'done' && ps.missStreak >= 1 && day === score.currentDay) {
          note = { text: 'Missed last time. Miss again and it costs 1 point.', tone: 'warn' };
        }
        const task = taskFor(data, p, day);
        return (
          <PillarTask
            key={`${p}:${day}`}
            pillar={p}
            title={task.title}
            detail={task.detail}
            status={status}
            editable={editable}
            note={note}
            onToggle={() => toggleDone(p, day)}
            onEditTitle={(t) => editTask(p, day, t)}
          />
        );
      })}
    </View>
  );
}

function MakeUpCard({ pillars, score }: { pillars: PillarType[]; score: ArcScore }) {
  const data = useArcStore((s) => s.data)!;
  const makeUp = useArcStore((s) => s.makeUp);

  return (
    <>
      <SectionLabel>Work off penalties</SectionLabel>
      <Card>
        <Text style={styles.muted}>
          Complete a missed task from your backlog to win back 1 point.
        </Text>
        {pillars.map((p) => {
          const meta = pillarMeta[p];
          const forDay = backlogFor(data, score, p)[0] ?? null;
          const title = forDay ? taskFor(data, p, forDay).title : 'Any bonus task for this pillar';
          return (
            <View key={p} style={styles.makeUp}>
              <Text style={[styles.makeUpLabel, { color: meta.color }]}>
                {meta.label} · −{score.pillars[p].outstanding} pts
              </Text>
              <Text style={styles.makeUpTitle}>
                {forDay ? `Day ${forDay}: ` : ''}
                {title}
              </Text>
              <Button
                label="I did it (+1)"
                variant="secondary"
                onPress={() =>
                  Alert.alert('Log make-up task?', title, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Yes, done', onPress: () => makeUp(p, forDay) },
                  ])
                }
              />
            </View>
          );
        })}
      </Card>
    </>
  );
}

function SkippedCard({ day }: { day: number }) {
  const setSkip = useArcStore((s) => s.setSkip);
  return (
    <Card style={{ borderColor: colors.skip }}>
      <Text style={[styles.phase, { color: colors.skip }]}>Skip day: rest up</Text>
      <Text style={styles.muted}>No points today, and your streaks are safe.</Text>
      <Button label="Undo skip" variant="secondary" onPress={() => setSkip(day, false)} />
    </Card>
  );
}

function SkipButton({ day, score }: { day: number; score: ArcScore }) {
  const setSkip = useArcStore((s) => s.setSkip);
  const doneToday = score.days[day - 1].doneCount;
  return (
    <Button
      label={`Use a skip day (${score.skipsLeft} left)`}
      icon="bed"
      variant="secondary"
      disabled={score.skipsLeft === 0}
      onPress={() =>
        Alert.alert(
          'Skip today?',
          `You have ${score.skipsLeft} of 5 skips left this Arc. All 4 pillars pause for the day: no points and no penalties.` +
            (doneToday > 0 ? `\n\nThe ${doneToday} task(s) you completed today won't count.` : ''),
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Skip today', onPress: () => setSkip(day, true) },
          ],
        )
      }
    />
  );
}

function ArcComplete({ score }: { score: ArcScore }) {
  const finishArc = useArcStore((s) => s.finishArc);
  const best = Math.max(...PILLARS.map((p) => score.pillars[p].bestStreak));
  return (
    <Screen title="Arc complete" subtitle="100 days, done.">
      <Card style={{ alignItems: 'center' }}>
        <PhaseAvatar phase={score.phase} size={160} />
        <Text style={styles.phase}>
          Phase {score.phase.level} · {score.phase.title}
        </Text>
        <Text style={styles.points}>
          {score.net} <Text style={styles.pointsOf}>/ 400 pts</Text>
        </Text>
      </Card>
      <Card>
        {PILLARS.map((p) => (
          <Text key={p} style={styles.summaryRow}>
            <Text style={{ color: pillarMeta[p].color, fontWeight: '700' }}>{pillarMeta[p].label}</Text>
            {`  ${score.pillars[p].earned}/100 days · best streak ${score.pillars[p].bestStreak}`}
          </Text>
        ))}
        <Text style={styles.muted}>
          Longest streak: {best} days · Skips used: {score.skipsUsed}
        </Text>
      </Card>
      <Button
        label="Start a new Arc"
        icon="snow"
        onPress={() =>
          Alert.alert('Start a new Arc?', 'Your avatar resets to Phase 1. This Arc is saved in your history.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Start', onPress: finishArc },
          ])
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pointsRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  phase: { color: colors.text, fontSize: 16, fontWeight: '700' },
  points: { color: colors.text, fontSize: 32, fontWeight: '800' },
  pointsOf: { color: colors.muted, fontSize: 16, fontWeight: '600' },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  hint: { color: colors.muted, fontSize: 13, textAlign: 'center' },
  makeUp: { gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  makeUpLabel: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  makeUpTitle: { color: colors.text, fontSize: 15 },
  summaryRow: { color: colors.text, fontSize: 15 },
});
