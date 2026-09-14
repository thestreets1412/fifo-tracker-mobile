const { withAndroidManifest } = require('@expo/config-plugins');

/** RevenueCat requires the purchase activity to survive an external payment app. */
function setAndroidLaunchMode(modResults) {
  const application = modResults.manifest.application?.[0];
  const activity = application?.activity?.find((value) => {
    const name = value.$?.['android:name'];
    return name === '.MainActivity' || name?.endsWith('.MainActivity');
  });
  if (!activity?.$) throw new Error('MainActivity was not found for RevenueCat configuration');
  activity.$['android:launchMode'] = 'singleTop';
  return modResults;
}

function withRevenueCatLaunchMode(config) {
  return withAndroidManifest(config, (next) => {
    next.modResults = setAndroidLaunchMode(next.modResults);
    return next;
  });
}

module.exports = withRevenueCatLaunchMode;
module.exports.setAndroidLaunchMode = setAndroidLaunchMode;
