import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Keyboard } from 'react-native';
import { create } from 'zustand';

const KEY = 'appLockEnabled';

const NOTHING_TO_UNLOCK_WITH = 'Set up Face ID, Touch ID or a passcode on this iPhone first.';

let unlocking: Promise<boolean> | null = null;

/** No passcode and no biometrics enrolled: nothing could ever satisfy the prompt. */
async function deviceUnprotected() {
  return (await LocalAuthentication.getEnrolledLevelAsync()) === LocalAuthentication.SecurityLevel.NONE;
}

type LockState = {
  enabled: boolean;
  locked: boolean;
  initialized: boolean;
  initError: string | null;
  init: () => Promise<void>;
  /** Called when the app goes to the background. */
  lockIfEnabled: () => void;
  unlock: () => Promise<boolean>;
  setEnabled: (enabled: boolean) => Promise<{ ok: boolean; message?: string }>;
};

async function authenticate(promptMessage: string) {
  // Falls back to the device passcode (Face ID itself needs a dev build; Expo Go uses passcode).
  const result = await LocalAuthentication.authenticateAsync({ promptMessage, disableDeviceFallback: false });
  return result.success;
}

/**
 * Wraps an Alert button handler. On iOS, alerts live in their own window above the lock overlay, so a
 * confirmation left open while the phone was locked is still tappable; destructive ones must not run then.
 */
export function unlessLocked<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  return (...args) => {
    const state = useLockStore.getState();
    if (state.initialized && !state.locked) fn(...args);
  };
}

export const useLockStore = create<LockState>((set, get) => ({
  enabled: false,
  locked: true,
  initialized: false,
  initError: null,

  init: async () => {
    set({ initialized: false, initError: null, locked: true });
    try {
      const enabled = (await SecureStore.getItemAsync(KEY)) === '1';
      // Removing the device passcode also removes the means to unlock.
      if (enabled && (await deviceUnprotected())) {
        await SecureStore.setItemAsync(KEY, '0');
        set({ enabled: false, locked: false, initialized: true });
        return;
      }
      set({ enabled, locked: enabled, initialized: true });
    } catch {
      // Do not render private content when the persisted lock setting is unknown.
      set({ initError: 'Could not check the app lock. Try again.', initialized: false, locked: true });
    }
  },

  lockIfEnabled: () => {
    if (!get().enabled) return;
    // A focused input under the overlay would otherwise keep the keyboard, and its keystrokes.
    Keyboard.dismiss();
    set({ locked: true });
  },

  unlock: () => {
    // One prompt at a time: the lock screen's mount effect, the foreground handler and the Unlock button can
    // all ask, and overlapping native prompts can stack on iOS.
    if (unlocking) return unlocking;
    unlocking = (async () => {
      try {
        if (!get().locked) return true;
        if (await deviceUnprotected()) {
          await SecureStore.setItemAsync(KEY, '0');
          set({ enabled: false, locked: false });
          return true;
        }
        if (!get().locked) return true;
        const ok = await authenticate('Unlock Winter Arc');
        if (ok) set({ locked: false });
        return ok;
      } finally {
        unlocking = null;
      }
    })();
    return unlocking;
  },

  setEnabled: async (enabled) => {
    if (enabled && (await deviceUnprotected())) return { ok: false, message: NOTHING_TO_UNLOCK_WITH };
    // Confirm it's really you before changing the setting either way.
    if (!(await authenticate(enabled ? 'Turn on app lock' : 'Turn off app lock'))) return { ok: false };
    await SecureStore.setItemAsync(KEY, enabled ? '1' : '0');
    set({ enabled, locked: false });
    return { ok: true };
  },
}));
