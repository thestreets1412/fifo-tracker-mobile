import * as SecureStore from 'expo-secure-store';

// The lock runtime installs this session gate before the backup screen can render.
interface SecurityGate { isUnlocked(): boolean; containsPin(password: string): Promise<boolean>; lease?(): () => void }
let gate: SecurityGate | null = null;
export function configureBackupSecurity(value: SecurityGate): void { gate = value; }
export async function validateExportSecret(password: string): Promise<() => void> {
  if (!gate?.isUnlocked()) throw new Error('กรุณาปลดล็อกแอปก่อน');
  if (await gate.containsPin(password)) throw new Error('รหัสผ่านสำรองต้องไม่มี PIN อยู่ภายใน');
  return gate.lease?.() ?? (() => {});
}
export async function rememberedPassword(): Promise<string | null> {
  if (!gate?.isUnlocked()) return null;
  const result = await SecureStore.getItemAsync('fifo.export-password');
  return gate.isUnlocked() ? result : null;
}
export async function rememberPassword(password: string): Promise<void> {
  if (!gate?.isUnlocked()) return;
  await validateExportSecret(password);
  if (!gate.isUnlocked()) return;
  await SecureStore.setItemAsync('fifo.export-password', password);
}
