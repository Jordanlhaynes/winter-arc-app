import { Image, ImageSourcePropType, StyleSheet, View } from 'react-native';

import type { Phase } from '@/engine/phases';
import { colors } from '@/ui/theme';

/** require() paths must be static, so each phase is listed explicitly. */
const PHASE_ART: Record<number, ImageSourcePropType> = {
  1: require('../../assets/avatars/phase-1.png'),
  2: require('../../assets/avatars/phase-2.png'),
  3: require('../../assets/avatars/phase-3.png'),
  4: require('../../assets/avatars/phase-4.png'),
  5: require('../../assets/avatars/phase-5.png'),
  6: require('../../assets/avatars/phase-6.png'),
  7: require('../../assets/avatars/phase-7.png'),
  8: require('../../assets/avatars/phase-8.png'),
};

type Props = {
  phase: Phase;
  size: number;
  /** Phases the user hasn't reached yet. */
  locked?: boolean;
};

export function PhaseAvatar({ phase, size, locked = false }: Props) {
  const frame = { width: size, height: size, borderRadius: size / 2 };

  if (locked) {
    return (
      <View style={[styles.frame, frame]}>
        <Image source={PHASE_ART[phase.level]} style={frame} blurRadius={8} />
      </View>
    );
  }

  return (
    <View style={[styles.frame, frame]}>
      <Image source={PHASE_ART[phase.level]} style={frame} accessibilityLabel={phase.title} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
