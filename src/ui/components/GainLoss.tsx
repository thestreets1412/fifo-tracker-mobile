import { Text, StyleSheet } from 'react-native';
import Decimal from 'decimal.js';
import { color, font, fontFamily } from '../../theme/tokens';

/** `value` is a decimal string (e.g. "982.0260"); `display` is the already-formatted label. */
export function GainLoss({ value, display }: { value: string; display: string }) {
  const isGain = new Decimal(value).greaterThanOrEqualTo(0);
  return <Text style={[styles.base, { color: isGain ? color.gain : color.loss }]}>{display}</Text>;
}

const styles = StyleSheet.create({
  base: { fontFamily: fontFamily.monoSemibold, fontSize: font.size.md },
});
