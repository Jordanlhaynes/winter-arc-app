import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs, usePathname } from 'expo-router';

import { useJournalSync } from '@/state/journalStore';
import { colors } from '@/ui/theme';

// Web companion: only the cloud-backed tabs. The Arc tabs depend on the phone's local database.
const PHONE_ONLY = ['today', 'arc', 'avatar', 'settings'];

export default function TabLayout() {
  useJournalSync();
  const pathname = usePathname();

  // `href: null` hides the tab but a typed or bookmarked URL still reaches the route and renders blank.
  if (PHONE_ONLY.includes(pathname.replace(/^\//, ''))) return <Redirect href="/notes" />;

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
        name="notes"
        options={{ title: 'Notes', tabBarIcon: ({ color, size }) => <Ionicons name="document-text" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="log"
        options={{ title: 'Log', tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} /> }}
      />
      {PHONE_ONLY.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ href: null }} />
      ))}
    </Tabs>
  );
}
