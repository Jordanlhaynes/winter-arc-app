import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, Text, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';

import { useArcStore } from '@/state/arcStore';
import { useAuthStore } from '@/state/authStore';
import { useLockStore } from '@/state/lockStore';
import { Button } from '@/ui/components';
import { LockScreen } from '@/ui/LockScreen';
import { colors } from '@/ui/theme';

export default function RootLayout() {
  const loaded = useArcStore((s) => s.loaded);
  const init = useArcStore((s) => s.init);
  const tick = useArcStore((s) => s.tick);
  const locked = useLockStore((s) => s.locked);
  const lockInitialized = useLockStore((s) => s.initialized);
  const lockError = useLockStore((s) => s.initError);

  useEffect(() => {
    init();
    useAuthStore.getState().init();
    void useLockStore.getState().init();
  }, [init]);

  // Keep "today" and day locks current; re-lock when the app is backgrounded.
  useEffect(() => {
    const interval = setInterval(tick, 60_000);
    let previous = AppState.currentState;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        tick();
        // Returning from the background: the lock engaged there, where no prompt could show, so prompt now.
        // Only from 'background' — the Face ID sheet itself bounces the app inactive -> active, and prompting
        // on that would re-open the sheet every time it's cancelled.
        if (previous === 'background' && useLockStore.getState().locked) void useLockStore.getState().unlock();
      }
      // Only 'background' — the Face ID prompt itself makes the app briefly 'inactive'.
      if (state === 'background') useLockStore.getState().lockIfEnabled();
      previous = state;
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [tick]);

  if (!loaded || !lockInitialized) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        {lockError ? (
          <View style={{ padding: 32, gap: 16 }}>
            <Text style={{ color: colors.text }}>{lockError}</Text>
            <Button label="Try again" onPress={() => void useLockStore.getState().init()} />
          </View>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="account" options={{ presentation: 'modal' }} />
        <Stack.Screen name="mfa" options={{ presentation: 'modal' }} />
      </Stack>
      {/*
        The account and mfa sheets are presented above the root view on iOS, where a plain overlay (or a root
        <Modal>, which UIKit refuses while a sheet is up) can't cover them. FullWindowOverlay lives at the
        UIWindow level, above presented controllers, so the sheet stays mounted (2-factor needs the user to
        switch to their authenticator mid-flow) and is simply covered. Alerts still float above it: see unlessLocked.
      */}
      {locked ? (
        <FullWindowOverlay>
          <LockScreen />
        </FullWindowOverlay>
      ) : null}
    </>
  );
}
