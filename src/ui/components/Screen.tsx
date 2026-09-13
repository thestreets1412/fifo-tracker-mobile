import { ScrollView, View, StyleSheet, type RefreshControlProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { color, space } from '../../theme/tokens';

export function Screen({
  children, scroll = false, refreshControl,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  /** Pull-to-refresh; only meaningful together with `scroll`. */
  refreshControl?: React.ReactElement<RefreshControlProps>;
}) {
  const inner = <View style={styles.body}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : inner}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.pageBg },
  body: { flex: 1, padding: space[3] },
  scroll: { padding: space[3] },
});
