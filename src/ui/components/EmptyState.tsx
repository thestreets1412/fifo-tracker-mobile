import { View, Text, StyleSheet } from 'react-native';
import { color, space, font, fontFamily } from '../../theme/tokens';

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', padding: space[5] },
  title: { color: color.textBody, fontFamily: fontFamily.sansMedium, fontSize: font.size.md, marginBottom: space[1] },
  hint: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.sm, textAlign: 'center' },
});
