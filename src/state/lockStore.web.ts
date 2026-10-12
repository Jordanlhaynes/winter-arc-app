import { create } from 'zustand';

// Web build: Face ID / passcode lock is phone-only. Same shape as lockStore.ts so shared screens still compile.
type LockState = {
  enabled: boolean;
  locked: boolean;
  initialized: boolean;
  initError: string | null;
  init: () => Promise<void>;
  lockIfEnabled: () => void;
  unlock: () => Promise<boolean>;
  setEnabled: (enabled: boolean) => Promise<{ ok: boolean; message?: string }>;
};

/** Web never locks; same export surface as lockStore.ts so shared screens resolve it. */
export function unlessLocked<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  return fn;
}

export const useLockStore = create<LockState>(() => ({
  enabled: false,
  locked: false,
  initialized: true,
  initError: null,
  init: async () => {},
  lockIfEnabled: () => {},
  unlock: async () => true,
  setEnabled: async () => ({ ok: false, message: 'App lock is only available in the phone app.' }),
}));
