import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { useAuthStore } from '@/state/authStore';
import { colors } from '@/ui/theme';

// Web companion: no local SQLite Arc and no Face ID lock, just the account and cloud-backed screens.
export default function RootLayout() {
  useEffect(() => {
    useAuthStore.getState().init();
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="account" options={{ presentation: 'modal' }} />
      <Stack.Screen name="mfa" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
