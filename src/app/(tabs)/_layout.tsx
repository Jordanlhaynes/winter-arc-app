import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import { useEffect } from 'react';

import { useAiStore } from '@/state/aiStore';
import { useArcStore } from '@/state/arcStore';
import { useAuthStore } from '@/state/authStore';
import { useJournalSync } from '@/state/journalStore';
import { colors } from '@/ui/theme';

export default function TabLayout() {
  const hasArc = useArcStore((s) => s.data !== null);
  const now = useArcStore((s) => s.now);
  const authReady = useAuthStore((s) => s.status === 'ready');
  useJournalSync();

  // AI plans and coaching run automatically once signed in with 2-factor.
  // Both are no-ops when there's nothing new to fetch, so re-running each minute is cheap.
  useEffect(() => {
    if (!hasArc || !authReady) return;
    void useAiStore.getState().ensurePlan();
    void useAiStore.getState().ensureCoach();
  }, [hasArc, authReady, now]);

  if (!hasArc) return <Redirect href="/setup" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{ title: 'Today', tabBarIcon: ({ color, size }) => <Ionicons name="today" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="arc"
        options={{ title: 'Arc', tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="notes"
        options={{ title: 'Notes', tabBarIcon: ({ color, size }) => <Ionicons name="document-text" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="log"
        options={{ title: 'Log', tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="avatar"
        options={{ title: 'Avatar', tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
