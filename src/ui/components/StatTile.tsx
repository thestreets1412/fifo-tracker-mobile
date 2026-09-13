import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { color, radius, space, font, fontFamily } from '../../theme/tokens';

export function StatTile({
  label, value, tone = 'neutral', sub, style,
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'gain' | 'loss';
  sub?: string;
  style?: ViewStyle;
}) {
  const valueColor = tone === 'gain' ? color.gain : tone === 'loss' ? color.loss : color.textBody;
  return (
    <View style={[styles.tile, style]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1, flexBasis: '46%',
    backgroundColor: color.cardBg, borderColor: color.cardBorder, borderWidth: 1,
    borderRadius: radius.lg, padding: space[3],
  },
  label: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs },
  value: { fontFamily: fontFamily.monoSemibold, fontSize: font.size.lg, marginTop: space[1] },
  sub: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs, marginTop: 2 },
});
