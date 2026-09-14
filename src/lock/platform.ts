import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { checkSecret, deriveSecret, hex } from './kdf';
import type { LockDependencies } from '../services/lock';

const RECORD_KEY = 'fifo.lock-record.v1';
const MARKER_KEY = 'fifo.lock-configured.v1';

export const lockPlatform: LockDependencies = {
  read: () => SecureStore.getItemAsync(RECORD_KEY),
  write: (value) => SecureStore.setItemAsync(RECORD_KEY, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  }),
  hasMarker: async () => (await SecureStore.getItemAsync(MARKER_KEY)) === '1',
  markConfigured: () => SecureStore.setItemAsync(MARKER_KEY, '1', {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  }),
  derive: deriveSecret,
  verify: checkSecret,
  salt: () => hex(Crypto.getRandomValues(new Uint8Array(16))),
  now: () => Date.now(),
  monotonic: () => globalThis.performance?.now?.() ?? Date.now(),
  async biometricAvailable() {
    return await LocalAuthentication.hasHardwareAsync() && await LocalAuthentication.isEnrolledAsync();
  },
  async authenticate() {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'ปลดล็อก FIFO Tracker',
      promptDescription: 'ยืนยันด้วยลายนิ้วมือหรือใบหน้า',
      cancelLabel: 'ใช้ PIN',
      disableDeviceFallback: true,
      biometricsSecurityLevel: 'strong',
    });
    if (result.success) return 'success';
    return ['user_cancel', 'system_cancel', 'app_cancel', 'user_fallback'].includes(result.error ?? '') ? 'cancelled' : 'failure';
  },
};
