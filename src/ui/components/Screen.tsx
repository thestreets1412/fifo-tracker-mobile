import { ScrollView, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { color, space } from '../../theme/tokens';

export function Screen({ children, scroll = false }: { children: React.ReactNode; scroll?: boolean }) {
  const inner = <View style={styles.body}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">{children}</ScrollView> : inner}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.pageBg },
  body: { flex: 1, padding: space[3] },
  scroll: { padding: space[3] },
});
