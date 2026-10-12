import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { toDateString } from '@/engine/dates';
import { useJournalStore } from '@/state/journalStore';
import { LogEntry } from '@/sync/journal';
import { Button, Card, ErrorText, SectionLabel } from '@/ui/components';
import { JournalGate } from '@/ui/JournalGate';
import { colors } from '@/ui/theme';

function dayLabel(dateStr: string, now: Date) {
  const today = toDateString(now);
  const yesterday = toDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

/** Entries arrive newest-first, so consecutive runs of the same local date form each group. */
function groupByDay(entries: LogEntry[]) {
  const groups: { date: string; entries: LogEntry[] }[] = [];
  for (const entry of entries) {
    const date = toDateString(new Date(entry.created_at));
    const last = groups[groups.length - 1];
    if (last?.date === date) last.entries.push(entry);
    else groups.push({ date, entries: [entry] });
  }
  return groups;
}

export default function Log() {
  const log = useJournalStore((s) => s.log);
  const error = useJournalStore((s) => s.error);
  const addLog = useJournalStore((s) => s.addLog);
  const deleteLog = useJournalStore((s) => s.deleteLog);

  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const groups = useMemo(() => groupByDay(log), [log]);
  const now = new Date();

  const add = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      await addLog(body);
      setText('');
    } catch {
      // Shown via the store's error.
    } finally {
      setBusy(false);
    }
  };

  return (
    <JournalGate title="Log" subtitle="Quick timestamped entries, newest first">
      <Card>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="What happened?"
          placeholderTextColor={colors.muted}
          multiline
          style={styles.input}
          onSubmitEditing={add}
          submitBehavior="submit"
        />
        <ErrorText>{error}</ErrorText>
        <Button label={busy ? 'Adding…' : 'Add to log'} icon="add" onPress={add} disabled={busy || !text.trim()} />
      </Card>

      {groups.length === 0 ? <SectionLabel>Nothing logged yet</SectionLabel> : null}
      {groups.map((group) => (
        <View key={group.date} style={{ gap: 8 }}>
          <SectionLabel>{dayLabel(group.date, now)}</SectionLabel>
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {group.entries.map((entry, i) => (
              <View key={entry.id} style={[styles.entry, i > 0 && styles.divider]}>
                <Text style={styles.time}>
                  {new Date(entry.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </Text>
                <Text style={styles.body}>{entry.body}</Text>
                <Pressable onPress={() => void deleteLog(entry.id).catch(() => {})} hitSlop={10}>
                  <Ionicons name="close" size={16} color={colors.muted} />
                </Pressable>
              </View>
            ))}
          </Card>
        </View>
      ))}
    </JournalGate>
  );
}

const styles = StyleSheet.create({
  input: { color: colors.text, fontSize: 16, lineHeight: 22, minHeight: 48 },
  entry: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  time: { color: colors.muted, fontSize: 13, width: 64, paddingTop: 2 },
  body: { color: colors.text, fontSize: 15, lineHeight: 21, flex: 1 },
});
