import { Link } from 'expo-router';
import { Text, View, StyleSheet } from 'react-native';
import { Screen } from '../../ui/components/Screen';
import { ListRow } from '../../ui/components/ListRow';
import { color, font, fontFamily } from '../../theme/tokens';

export default function MoreScreen() {
  return (
    <Screen scroll>
      <Link href="/symbols" asChild>
        <ListRow onPress={() => {}}>
          <Text style={styles.item}>จัดการสัญลักษณ์</Text>
          <Text style={styles.chev}>›</Text>
        </ListRow>
      </Link>
      <Link href="/backup" asChild>
        <ListRow onPress={() => {}}>
          <Text style={styles.item}>สำรอง / กู้คืนข้อมูล</Text>
          <Text style={styles.chev}>›</Text>
        </ListRow>
      </Link>
      <Link href="/report" asChild>
        <ListRow onPress={() => {}}>
          <Text style={styles.item}>รายงาน PDF / CSV</Text>
          <Text style={styles.chev}>›</Text>
        </ListRow>
      </Link>
      <Link href="/settings" asChild>
        <ListRow onPress={() => {}}>
          <Text style={styles.item}>ตั้งค่าและล็อก</Text>
          <Text style={styles.chev}>›</Text>
        </ListRow>
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { color: color.textBody, fontFamily: fontFamily.sansMedium, fontSize: font.size.md },
  chev: { color: color.textMuted, fontSize: font.size.lg },
  disabledRow: { paddingVertical: 16, paddingHorizontal: 8, borderBottomColor: color.cardBorder, borderBottomWidth: 1 },
  disabled: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.md },
});
