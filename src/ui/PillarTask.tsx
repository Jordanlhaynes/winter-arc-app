import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { PillarDayStatus, PillarType } from '@/engine/scoring';

import { colors, pillarMeta, radius } from './theme';

type Props = {
  pillar: PillarType;
  title: string;
  detail?: string | null;
  status: PillarDayStatus;
  editable: boolean;
  /** Shown under the title, e.g. streak or penalty warnings. */
  note?: { text: string; tone: 'warn' | 'danger' | 'muted' };
  onToggle: () => void;
  onEditTitle: (title: string) => void;
};

export function PillarTask({ pillar, title, detail, status, editable, note, onToggle, onEditTitle }: Props) {
  const meta = pillarMeta[pillar];
  const done = status === 'done';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  const noteColor = note?.tone === 'danger' ? colors.danger : note?.tone === 'warn' ? colors.warn : colors.muted;

  return (
    <View style={[styles.row, done && { borderColor: meta.color }]}>
      <Pressable
        onPress={onToggle}
        disabled={!editable}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done, disabled: !editable }}
        accessibilityLabel={`${meta.label}: ${title}`}
        style={[styles.check, { borderColor: meta.color }, done && { backgroundColor: meta.color }]}
      >
        {done ? <Ionicons name="checkmark" size={20} color={colors.bg} /> : null}
      </Pressable>

      <View style={styles.body}>
        <View style={styles.labelRow}>
          <Ionicons name={meta.icon} size={14} color={meta.color} />
          <Text style={[styles.label, { color: meta.color }]}>{meta.label}</Text>
        </View>
        {editing ? (
          <TextInput
            value={draft}
            onChangeText={setDraft}
            autoFocus
            multiline
            style={styles.input}
            onBlur={() => {
              setEditing(false);
              if (draft.trim() && draft !== title) onEditTitle(draft);
              else setDraft(title);
            }}
          />
        ) : (
          <Pressable
            onLongPress={() => {
              if (!editable) return;
              setDraft(title);
              setEditing(true);
            }}
          >
            <Text style={[styles.title, done && styles.titleDone]}>{title}</Text>
          </Pressable>
        )}
        {detail && !editing && !done ? <Text style={styles.detail}>{detail}</Text> : null}
        {note ? <Text style={[styles.note, { color: noteColor }]}>{note.text}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  check: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  body: { flex: 1, gap: 4 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: 16, lineHeight: 22 },
  titleDone: { color: colors.muted, textDecorationLine: 'line-through' },
  input: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    borderBottomWidth: 1,
    borderBottomColor: colors.accent,
    paddingVertical: 2,
  },
  note: { fontSize: 13 },
  detail: { color: colors.muted, fontSize: 14, lineHeight: 19 },
});
