# Plan 7 — Application Lock

## Scope

Implement the approved lock requirements in design spec §6.1–§6.4: PIN setup and unlock, recovery questions, biometric unlock, inactivity timeout, Android screen protection, and export-password integration. No schema change or SQLCipher is introduced.

## Decisions

- Store a versioned lock record only in Expo SecureStore. It contains two salted scrypt verifiers, recovery questions, timing settings, biometric opt-in, and persisted failed-attempt state. It never stores a PIN or recovery answer.
- A missing SecureStore record after the configured marker exists is treated as an error, not as a request to reset the PIN. This fails closed when secure credentials are unexpectedly lost.
- Use `scrypt-js` with N=32768, r=8, p=1 and a 32-byte output. It uses about 32 MiB of working memory. JavaScript does not parallelize scrypt's `p` work, so p=1 avoids serially tripling an unlock delay while retaining the memory-hard parameter.
- PIN failures begin a 30-second lock at failure five; recovery failures begin a one-hour lock at failure three. Both persist and increase exponentially with finite caps.
- Unlock accepts a 6-digit PIN. Recovery requires three self-authored questions and answers of at least four characters; answers are trim/uppercase normalized and encoded as a JSON array before hashing.
- Biometric unlock is opt-in, accepts only Expo LocalAuthentication `strong` biometrics, and disables the device credential fallback so the app PIN remains the fallback.
- App state uses wall and monotonic timestamps. It locks immediately, after 1/5/15 minutes, on clock rollback, and after a missed lifecycle heartbeat. Android FLAG_SECURE is held for the app lifetime with Expo ScreenCapture.
- Export passwords stay separate from the PIN. The backup security gate holds a session lease, rejects any password containing the actual PIN by verifier comparison, and invalidates in-flight export/restore when the session changes.

## Implementation

- `src/lock/credentials.ts` validates and parses the persisted record.
- `src/lock/kdf.ts` provides scrypt derivation and fixed-work comparison.
- `src/services/lock.ts` is the React-free state machine with injected dependencies.
- `src/lock/platform.ts`, `runtime.ts`, and `LockGate.tsx` isolate native APIs and render setup/unlock/recovery UI.
- `/settings` exposes timeout, biometric opt-in, PIN change, and full recovery-question replacement.
- `/backup` now uses the lock session gate for remembered passwords and long-running export/restore operations.

## Validation

- Jest covers setup, storage format, failed-attempt persistence and escalation, recovery, timeout/clock behavior, biometric cancellation and background invalidation, settings, PIN exclusion from export passwords, and a lease that expires during export.
- `npm run typecheck` passes.
- `npx expo export --platform android` passes after adding the Expo native modules.

## Manual verification still required

Build a fresh Android development or release app because LocalAuthentication and ScreenCapture are native modules. On a device, verify first setup, PIN/biometric/recovery flows, timeout while backgrounded, app-switcher redaction, keyboard behavior, and an export/restore interrupted by locking. SQLCipher-at-rest encryption remains explicitly out of scope for v1.