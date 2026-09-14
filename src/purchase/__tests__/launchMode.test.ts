const { setAndroidLaunchMode } = require('../../../plugins/withRevenueCatLaunchMode');

test('RevenueCat config plugin keeps the main activity alive across payment apps', () => {
  const manifest = { manifest: { application: [{ activity: [{ $: { 'android:name': '.MainActivity', 'android:launchMode': 'singleTask' } }] }] } };
  expect(setAndroidLaunchMode(manifest).manifest.application[0].activity[0].$['android:launchMode']).toBe('singleTop');
});

test('RevenueCat config plugin rejects a manifest without MainActivity', () => {
  expect(() => setAndroidLaunchMode({ manifest: { application: [{ activity: [] }] } })).toThrow('MainActivity');
});
