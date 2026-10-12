import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import { PillarType } from '@/engine/scoring';

export const colors = {
  bg: '#0B1220',
  card: '#141C2F',
  cardRaised: '#1B2540',
  border: '#24304A',
  text: '#E8EEF9',
  muted: '#8A97B2',
  accent: '#7CC4FF',
  success: '#5BD6A0',
  danger: '#FF6B7A',
  warn: '#FFC266',
  skip: '#9B8CFF',
};

type IconName = ComponentProps<typeof Ionicons>['name'];

export const pillarMeta: Record<PillarType, { label: string; color: string; icon: IconName; hint: string }> = {
  personal: {
    label: 'Personal',
    color: '#C59BFF',
    icon: 'leaf',
    hint: 'Mental health, reading, lifestyle',
  },
  physical: {
    label: 'Physical',
    color: '#5BD6A0',
    icon: 'barbell',
    hint: 'Exercise, steps, nutrition, sleep',
  },
  financial: {
    label: 'Financial',
    color: '#FFC266',
    icon: 'cash',
    hint: 'Budgeting, savings, revenue',
  },
  career: {
    label: 'Career',
    color: '#7CC4FF',
    icon: 'briefcase',
    hint: 'Milestones, skills, networking',
  },
};

export const radius = 14;
export const gap = 12;
