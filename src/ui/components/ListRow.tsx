import { Pressable, View, StyleSheet } from 'react-native';
import { color, space } from '../../theme/tokens';

export function ListRow({ onPress, children }: { onPress?: () => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && onPress ? styles.pressed : null]}>
      <View style={styles.inner}>{children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { borderBottomColor: color.cardBorder, borderBottomWidth: 1 },
  inner: { paddingVertical: space[3], paddingHorizontal: space[2], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pressed: { backgroundColor: color.hover },
});
