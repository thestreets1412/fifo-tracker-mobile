import { useMemo, useState } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Screen } from '../../ui/components/Screen';
import { ListRow } from '../../ui/components/ListRow';
import { EmptyState } from '../../ui/components/EmptyState';
import { Button } from '../../ui/components/Button';
import { FormField, TextInput } from '../../ui/components/Field';
import { useAppStore } from '../../store/useAppStore';
import { listSymbolsWithCounts } from '../../services/symbols';
import { renameSymbol, deleteSymbol, SymbolInUseError } from '../../db/repo';
import { color, space, font, fontFamily } from '../../theme/tokens';

export default function SymbolsScreen() {
  const db = useAppStore((s) => s.db)!;
  const dataVersion = useAppStore((s) => s.dataVersion);
  const reload = useAppStore((s) => s.reload);
  const rows = useMemo(() => listSymbolsWithCounts(db), [db, dataVersion]);
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);

  function saveName() {
    if (!editing) return;
    renameSymbol(db, editing.id, editing.name.trim());
    setEditing(null);
    reload();
  }

  function remove(id: number, ticker: string, inUse: boolean) {
    if (inUse) return;
    Alert.alert('ลบสัญลักษณ์', `ลบ ${ticker}?`, [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบ', style: 'destructive',
        onPress: () => {
          try {
            deleteSymbol(db, id);
            reload();
          } catch (e) {
            if (e instanceof SymbolInUseError) Alert.alert('ลบไม่ได้', 'สัญลักษณ์นี้ถูกใช้งานอยู่');
            else throw e;
          }
        },
      },
    ]);
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'จัดการสัญลักษณ์', headerShown: true }} />
      {rows.length === 0 ? (
        <EmptyState title="ยังไม่มีสัญลักษณ์" hint="เพิ่มได้จากฟอร์มบันทึกการซื้อ" />
      ) : (
        rows.map(({ symbol, lotCount, saleCount }) => {
          const inUse = lotCount > 0 || saleCount > 0;
          return (
            <ListRow key={symbol.id}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ticker}>{symbol.ticker}</Text>
                <Text style={styles.meta}>
                  {symbol.name ? `${symbol.name} · ` : ''}{lotCount} ซื้อ · {saleCount} ขาย
                </Text>
              </View>
              <View style={styles.actions}>
                <Button title="แก้ชื่อ" variant="outline" onPress={() => setEditing({ id: symbol.id, name: symbol.name })} />
                <Button title="ลบ" variant="danger" disabled={inUse} onPress={() => remove(symbol.id, symbol.ticker, inUse)} />
              </View>
            </ListRow>
          );
        })
      )}

      {editing ? (
        <View style={styles.editor}>
          <FormField label="ชื่อที่แสดง">
            <TextInput value={editing.name} onChangeText={(name) => setEditing({ ...editing, name })} autoFocus />
          </FormField>
          <View style={styles.actions}>
            <Button title="บันทึก" onPress={saveName} />
            <Button title="ยกเลิก" variant="outline" onPress={() => setEditing(null)} />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  ticker: { color: color.textBody, fontFamily: fontFamily.monoSemibold, fontSize: font.size.md },
  meta: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs, marginTop: 2 },
  actions: { flexDirection: 'row', gap: space[2] },
  editor: { marginTop: space[4], borderTopColor: color.cardBorder, borderTopWidth: 1, paddingTop: space[3] },
});
