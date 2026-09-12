import { useMemo } from 'react';
import { Text, View, Image, Alert, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/components/Screen';
import { Card, CardTitle } from '../../ui/components/Card';
import { Button } from '../../ui/components/Button';
import { EmptyState } from '../../ui/components/EmptyState';
import { useAppStore } from '../../store/useAppStore';
import { getLot, listSymbols } from '../../db/repo';
import { toDomainLot, deleteLot } from '../../services/ledger';
import { resolveEvidenceUri } from '../../services/evidence';
import { lotCostThb } from '../../core/derive';
import { formatQty, formatPrice, formatFxRate, formatMoneyThb } from '../../ui/format';
import { color, space, font, fontFamily } from '../../theme/tokens';

export default function LotDetailScreen() {
  const db = useAppStore((s) => s.db)!;
  const dataVersion = useAppStore((s) => s.dataVersion);
  const reload = useAppStore((s) => s.reload);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const lotId = Number(id);

  const data = useMemo(() => {
    const row = getLot(db, lotId);
    if (!row) return null;
    const lot = toDomainLot(row);
    const ticker = listSymbols(db).find((s) => s.id === lot.symbolId)?.ticker ?? '—';
    return { lot, ticker, cost: lotCostThb(lot) };
  }, [db, dataVersion, lotId]);

  if (!data) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'ไม่พบล็อต', headerShown: true }} />
        <EmptyState title="ไม่พบรายการนี้" hint="อาจถูกลบไปแล้ว" />
      </Screen>
    );
  }

  function remove() {
    Alert.alert('ลบการซื้อ', 'ยืนยันการลบล็อตนี้? การจัดสรรจะถูกคำนวณใหม่ทั้งหมด', [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ลบ', style: 'destructive', onPress: () => { deleteLot(db, lotId); reload(); router.back(); } },
    ]);
  }

  const { lot, ticker, cost } = data;
  return (
    <Screen scroll>
      <Stack.Screen options={{ title: `${ticker} · ซื้อ`, headerShown: true }} />
      <Card>
        <CardTitle>{ticker}</CardTitle>
        <Row label="วันที่ซื้อ" value={lot.buyDate} />
        <Row label="ราคา (USD)" value={formatPrice(lot.priceUsd)} />
        <Row label="จำนวน" value={formatQty(lot.qty)} />
        <Row label="เรต USD/THB" value={formatFxRate(lot.fxRateUsdThb)} />
        <Row label="ต้นทุนรวม" value={formatMoneyThb(cost)} />
      </Card>
      {lot.evidenceFile ? (
        <Image
          source={{ uri: resolveEvidenceUri(lot.evidenceFile) }}
          style={{ width: '100%', height: 220, borderRadius: 8, marginTop: 16 }}
          resizeMode="contain"
        />
      ) : null}
      <View style={styles.actions}>
        <Button title="แก้ไข" variant="outline" onPress={() => router.push(`/lot/${lotId}/edit`)} style={{ flex: 1 }} />
        <Button title="ลบ" variant="danger" onPress={remove} style={{ flex: 1 }} />
      </View>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space[2] },
  label: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.sm },
  value: { color: color.textBody, fontFamily: fontFamily.monoMedium, fontSize: font.size.sm },
  actions: { flexDirection: 'row', gap: space[3], marginTop: space[4] },
});
