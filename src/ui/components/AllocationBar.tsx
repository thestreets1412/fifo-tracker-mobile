import { View, Text, StyleSheet } from 'react-native';
import type { AllocationSegment } from '../allocation';
import { formatMoneyThb } from '../format';
import { color, radius, space, font, fontFamily } from '../../theme/tokens';

/**
 * Spec §7.1's allocation chart as a stacked bar plus legend. No chart
 * library: a flex-weighted row of Views renders this exactly, adds no
 * native dependency, and cannot break on an Expo SDK bump.
 *
 * `segment.percent` drives flex only. Every money figure in the legend
 * comes from `segment.costThb`, the exact decimal string.
 */
export function AllocationBar({ segments }: { segments: readonly AllocationSegment[] }) {
  if (segments.length === 0) return null;

  return (
    <View>
      <View style={styles.bar}>
        {segments.map((segment) => (
          <View key={segment.ticker} style={{ flex: segment.percent, backgroundColor: segment.color }} />
        ))}
      </View>
      <View style={styles.legend}>
        {segments.map((segment) => (
          <View key={segment.ticker} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: segment.color }]} />
            <Text style={styles.legendTicker}>{segment.ticker}</Text>
            <Text style={styles.legendValue}>
              {segment.percent.toFixed(1)}% · {formatMoneyThb(segment.costThb)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', height: 14, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: color.inputBg },
  legend: { marginTop: space[3], gap: space[2] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  swatch: { width: 10, height: 10, borderRadius: radius.pill },
  legendTicker: { color: color.textBody, fontFamily: fontFamily.monoSemibold, fontSize: font.size.sm, minWidth: 56 },
  legendValue: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs },
});
