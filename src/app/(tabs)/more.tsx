import { View, Text, StyleSheet } from 'react-native';
import { color, fontFamily, font, space } from '../../theme/tokens';

export default function MoreScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>เพิ่มเติม</Text>
      <Text style={styles.muted}>มูลค่าพอร์ตและกำไรจะมาในเวอร์ชันถัดไป</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.pageBg, alignItems: 'center', justifyContent: 'center', padding: space[4] },
  title: { color: color.textBody, fontFamily: fontFamily.sansBold, fontSize: font.size.lg, marginBottom: space[2] },
  muted: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.sm, textAlign: 'center' },
});
