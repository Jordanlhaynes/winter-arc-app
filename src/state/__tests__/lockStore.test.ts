import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

import { unlessLocked, useLockStore } from '../lockStore';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));
jest.mock('expo-local-authentication', () => ({
  getEnrolledLevelAsync: jest.fn(),
  authenticateAsync: jest.fn(),
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC: 2 },
}));

beforeEach(() => {
  jest.clearAllMocks();
  useLockStore.setState({ initialized: false, initError: null, enabled: false, locked: true });
  jest.mocked(LocalAuthentication.getEnrolledLevelAsync).mockResolvedValue(LocalAuthentication.SecurityLevel.BIOMETRIC);
});

it('keeps content and alert actions locked until persisted settings have loaded', async () => {
  let resolve!: (value: string | null) => void;
  jest.mocked(SecureStore.getItemAsync).mockReturnValue(new Promise((ok) => { resolve = ok; }));
  const action = jest.fn();
  const init = useLockStore.getState().init();
  unlessLocked(action)();
  expect(action).not.toHaveBeenCalled();
  expect(useLockStore.getState().initialized).toBe(false);
  resolve('1');
  await init;
  expect(useLockStore.getState()).toMatchObject({ initialized: true, locked: true, enabled: true });
  unlessLocked(action)();
  expect(action).not.toHaveBeenCalled();
});

it('fails closed on a storage failure and allows retry', async () => {
  jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error('keychain unavailable')).mockResolvedValueOnce(null);
  await useLockStore.getState().init();
  expect(useLockStore.getState()).toMatchObject({ initialized: false, locked: true });
  expect(useLockStore.getState().initError).toBeTruthy();
  await useLockStore.getState().init();
  expect(useLockStore.getState()).toMatchObject({ initialized: true, locked: false, initError: null });
});

it('allows guarded actions only after initialization and unlocking', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue('1');
  jest.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({ success: true });
  await useLockStore.getState().init();
  await useLockStore.getState().unlock();
  const action = jest.fn();
  unlessLocked(action)();
  expect(action).toHaveBeenCalledTimes(1);
});
