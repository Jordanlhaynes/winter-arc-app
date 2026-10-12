import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useJournalStore } from '@/state/journalStore';
import { Note } from '@/sync/journal';
import { Button, Card, ErrorText, SectionLabel } from '@/ui/components';
import { JournalGate } from '@/ui/JournalGate';
import { colors } from '@/ui/theme';

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function Notes() {
  const notes = useJournalStore((s) => s.notes);
  const error = useJournalStore((s) => s.error);
  const saveNote = useJournalStore((s) => s.saveNote);
  const deleteNote = useJournalStore((s) => s.deleteNote);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  // The note being edited can be deleted from the other device at any moment (Realtime drops it from the list
  // at once, and a failed save does the same). Treat a dead id as "new note": the button turns into "Add note"
  // and one tap brings the text back as a new note. What was typed is never discarded.
  const editing = editingId && notes.some((n) => n.id === editingId) ? editingId : null;

  const clear = () => {
    setEditingId(null);
    setTitle('');
    setBody('');
  };

  const edit = (note: Note) => {
    setEditingId(note.id);
    setTitle(note.title);
    setBody(note.body);
  };

  const save = async () => {
    if (!title.trim() && !body.trim()) return;
    setBusy(true);
    try {
      await saveNote(editing, title.trim(), body);
      clear();
    } catch {
      // Shown via the store's error.
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await deleteNote(editing);
      clear();
    } catch {
      // Shown via the store's error.
    } finally {
      setBusy(false);
    }
  };

  return (
    <JournalGate title="Notes" subtitle="Synced between your phone and the web">
      <Card>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
          placeholderTextColor={colors.muted}
          style={styles.title}
        />
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Write anything…"
          placeholderTextColor={colors.muted}
          multiline
          textAlignVertical="top"
          style={styles.body}
        />
        <ErrorText>{error}</ErrorText>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Button label={busy ? 'Saving…' : editing ? 'Save changes' : 'Add note'} onPress={save} disabled={busy} />
          </View>
          {editing ? (
            <>
              <Button label="Cancel" variant="secondary" onPress={clear} disabled={busy} />
              <Button label="Delete" variant="danger" onPress={remove} disabled={busy} />
            </>
          ) : null}
        </View>
      </Card>

      <SectionLabel>{notes.length ? `${notes.length} notes` : 'No notes yet'}</SectionLabel>
      {notes.map((note) => (
        <Pressable key={note.id} onPress={() => edit(note)}>
          <Card style={note.id === editing ? styles.selected : undefined}>
            <Text style={styles.noteTitle}>{note.title || 'Untitled'}</Text>
            {note.body ? (
              <Text style={styles.preview} numberOfLines={4}>
                {note.body}
              </Text>
            ) : null}
            <Text style={styles.meta}>Edited {formatTime(note.updated_at)}</Text>
          </Card>
        </Pressable>
      ))}
    </JournalGate>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 20, fontWeight: '700', paddingVertical: 4 },
  body: { color: colors.text, fontSize: 16, lineHeight: 22, minHeight: 140 },
  row: { flexDirection: 'row', gap: 8 },
  selected: { borderColor: colors.accent },
  noteTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  preview: { color: colors.text, fontSize: 15, lineHeight: 21, opacity: 0.85 },
  meta: { color: colors.muted, fontSize: 12 },
});
