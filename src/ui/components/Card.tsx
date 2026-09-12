import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { color, radius, space, font, fontFamily } from '../../theme/tokens';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: color.cardBg, borderColor: color.cardBorder, borderWidth: 1, borderRadius: radius.lg, padding: space[4] },
  title: { color: color.textBody, fontFamily: fontFamily.sansSemibold, fontSize: font.size.lg, marginBottom: space[3] },
});
