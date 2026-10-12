import 'react-native-get-random-values';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as aesjs from 'aes-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isCloudConfigured = !!url && !!key;

/**
 * Sessions are larger than SecureStore's 2KB limit, so the session is AES-encrypted
 * into AsyncStorage and only the 256-bit key lives in the iOS Keychain.
 */
class LargeSecureStore {
  private async encrypt(storageKey: string, value: string) {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encrypted = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(storageKey, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encrypted);
  }

  private async decrypt(storageKey: string, value: string) {
    const encryptionKeyHex = await SecureStore.getItemAsync(storageKey);
    if (!encryptionKeyHex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(encryptionKeyHex), new aesjs.Counter(1));
    return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(value)));
  }

  async getItem(storageKey: string) {
    const encrypted = await AsyncStorage.getItem(storageKey);
    return encrypted ? this.decrypt(storageKey, encrypted) : null;
  }

  async setItem(storageKey: string, value: string) {
    await AsyncStorage.setItem(storageKey, await this.encrypt(storageKey, value));
  }

  async removeItem(storageKey: string) {
    await AsyncStorage.removeItem(storageKey);
    await SecureStore.deleteItemAsync(storageKey);
  }
}

export const supabase: SupabaseClient | null = isCloudConfigured
  ? createClient(url!, key!, {
      auth: {
        // Web has no Keychain; supabase-js falls back to the browser's localStorage when storage is undefined.
        storage: Platform.OS === 'web' ? undefined : new LargeSecureStore(),
        autoRefreshToken: true,
        persistSession: true,
        // Web: pick up the session from password-reset email links (#access_token=...&type=recovery).
        detectSessionInUrl: Platform.OS === 'web',
      },
    })
  : null;

if (supabase) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
