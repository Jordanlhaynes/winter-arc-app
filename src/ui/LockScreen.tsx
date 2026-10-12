import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { useLockStore } from '@/state/lockStore';

import { Button } from './components';
import { colors } from './theme';

export function LockScreen() {
  const unlock = useLockStore((s) => s.unlock);

  useEffect(() => {
    // Cold start: prompt right away. When the lock engaged in the background the prompt would fail unseen,
    // so the root layout prompts on the return to the foreground instead.
    if (AppState.currentState === 'active') void unlock();
  }, [unlock]);

  return (
    <View style={styles.wrap}>
      <Ionicons name="lock-closed" size={48} color={colors.accent} />
      <Text style={styles.title}>Winter Arc is locked</Text>
      <View style={{ alignSelf: 'stretch' }}>
        <Button label="Unlock" icon="scan" onPress={() => void unlock()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: 32,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
});
