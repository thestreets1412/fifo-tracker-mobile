# Plan 8 — PDF Monetization

## Scope

Implement design spec §8 and §8.1. PDF preview, saving, and sharing require one RevenueCat-backed Google Play entitlement. CSV reports and encrypted backup/restore stay free.

## Decisions

- Use `react-native-purchases` 10.9.1 through an injected, React-free entitlement controller. The controller has no database or report imports and receives no portfolio data.
- The default RevenueCat entitlement is `pdf_reports`. It can be overridden only at build time with `EXPO_PUBLIC_REVENUECAT_PDF_ENTITLEMENT`.
- Read the Android public RevenueCat SDK key only from `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`. No key is committed. A build without it fails closed: all PDF actions remain locked while CSV and backups work.
- Use only the lifetime package from the current RevenueCat offering. The Google Play localized price is rendered from the package; the app never hardcodes a charge amount or falls back to a subscription.
- Use anonymous RevenueCat users. Do not set subscriber attributes, user IDs, diagnostics, analytics, or device-attribution collection. Purchase infrastructure still necessarily exchanges billing and anonymous app-install state with Google Play and RevenueCat; it never receives portfolio data.
- Add an Expo config plugin that sets Android MainActivity to `singleTop`, as required for payment apps that temporarily background the app. It is compatible with Expo CNG and avoids committing generated Android files.

## Implementation

- `src/services/purchase.ts` owns state, entitlement checking, purchase, restore, and fail-closed errors through injected dependencies.
- `src/purchase/platform.ts` is the only RevenueCat import. It configures the native SDK lazily, maps the current offering, checks the active entitlement, and treats a cancelled purchase as non-entitled.
- `/report` gates every PDF action before preview/file creation/share. A Thai custom paywall shows the store price, purchase, restore, and configuration/network failures. It never gates CSV.
- `plugins/withRevenueCatLaunchMode.js` applies `singleTop` during Android prebuild.

## Required external setup before release

1. Create the Google Play one-time product and connect it to a RevenueCat project.
2. Create entitlement `pdf_reports`, attach the product, and publish a current offering with a lifetime package.
3. Set `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` in the EAS build environment. Optionally set the entitlement override.
4. Build a fresh Android development or release app; RevenueCat is native and is unavailable in Expo Go.

## Validation

- Jest covers absent configuration, entitlement/loading, cancellation, receipt without entitlement, restore, and provider failure.
- `npm run typecheck` passes.
- Android Expo config resolves the local MainActivity launch-mode plugin and the Android Metro/Hermes export passes. A physical Google Play test remains required.
