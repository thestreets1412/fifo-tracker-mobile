import './streams';
import { getRandomValues } from 'expo-crypto';

// Use the native CSPRNG, never getRandomBytes' development Math.random fallback.
if (!globalThis.crypto?.getRandomValues) {
  Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues }, configurable: true });
}
