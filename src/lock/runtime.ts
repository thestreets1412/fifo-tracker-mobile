import { AppState, type AppStateStatus } from 'react-native';
import { configureBackupSecurity } from '../backup/secrets';
import { LockController } from '../services/lock';
import { lockPlatform } from './platform';

export const lockController = new LockController(lockPlatform);
configureBackupSecurity({
  isUnlocked: lockController.isUnlocked,
  containsPin: (password) => lockController.containsPin(password),
  lease: lockController.lease,
});

let started = false;
export function startLockRuntime(): () => void {
  if (started) return () => {};
  started = true;
  let previous: AppStateStatus = AppState.currentState;
  const subscription = AppState.addEventListener('change', (next) => {
    if (next === 'active') lockController.resume();
    else if (next === 'background') lockController.suspend('background');
    else if (previous === 'active' && next === 'inactive') lockController.suspend('blur');
    previous = next;
  });
  // Initialization reports failure through controller state for the gate to render.
  void lockController.initialize().catch(() => {});
  const interval = setInterval(() => lockController.tick(), 1000);
  return () => { subscription.remove(); clearInterval(interval); started = false; };
}
