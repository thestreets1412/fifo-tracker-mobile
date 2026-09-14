jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn() }));
import * as storage from 'expo-secure-store';
import { configureBackupSecurity, rememberedPassword, rememberPassword, validateExportSecret } from '../secrets';
test('remember/prefill fails closed without Plan 7 gate', async () => {
  expect(await rememberedPassword()).toBeNull(); await rememberPassword('secret');
  expect(storage.setItemAsync).not.toHaveBeenCalled(); expect(storage.getItemAsync).not.toHaveBeenCalled();
});
test('an unlocked session can remember a password separate from PIN', async () => {
  configureBackupSecurity({ isUnlocked: () => true, containsPin: async p => p.includes('654321') });
  (storage.getItemAsync as jest.Mock).mockResolvedValue('remembered');
  expect(await rememberedPassword()).toBe('remembered');
  await rememberPassword('cedar lantern harbor violet otter');
  expect(storage.setItemAsync).toHaveBeenCalledWith('fifo.export-password', 'cedar lantern harbor violet otter');
  await expect(validateExportSecret('cedar 654321 harbor violet otter')).rejects.toThrow('PIN');
});
test('locking while SecureStore is being read suppresses the result', async () => {
  let unlocked = true;
  configureBackupSecurity({ isUnlocked: () => unlocked, containsPin: async () => false });
  (storage.getItemAsync as jest.Mock).mockImplementation(async () => { unlocked = false; return 'secret'; });
  expect(await rememberedPassword()).toBeNull();
  await expect(validateExportSecret('password')).rejects.toThrow();
});
