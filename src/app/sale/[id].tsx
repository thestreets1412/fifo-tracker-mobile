import { useMemo } from 'react';
import { Text, View, Image, Alert, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/components/Screen';
import { Card, CardTitle } from '../../ui/components/Card';
import { Button } from '../../ui/components/Button';
import { GainLoss } from '../../ui/components/GainLoss';
import { EmptyState } from '../../ui/components/EmptyState';
import { useAppStore } from '../../store/useAppStore';
import { getSale, listLots, listAllocations, listSymbols } from '../../db/repo';
import { toDomainSale, toDomainLot, deleteSale } from '../../services/ledger';
import { resolveEvidenceUri } from '../../services/evidence';
import { fromStored } from '../../core/money';
import { buildSaleDetail } from '../../ui/saleDetail';
import { formatQty, formatPrice, formatFxRate, formatMoneyThb, formatSignedThb } from '../../ui/format';
import { color, space, font, fontFamily } from '../../theme/tokens';

export default function SaleDetailScreen() {
  const db = useAppStore((s) => s.db)!;
  const dataVersion = useAppStore((s) => s.dataVersion);
  const reload = useAppStore((s) => s.reload);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const saleId = Number(id);

  const detail = useMemo(() => {
    const row = getSale(db, saleId);
    if (!row) return null;
    const sale = toDomainSale(row);
    const symbol = listSymbols(db).find((s) => s.id === sale.symbolId) ?? { id: sale.symbolId, ticker: '—', name: '' };
    const lots = listLots(db).map(toDomainLot);
    const allocations = listAllocations(db).map((a) => ({
      saleId: a.saleId, lotId: a.lotId, qtyAllocated: fromStored(a.qtyAllocated), costBasisThb: fromStored(a.costBasisThb),
    }));
    return buildSaleDetail(symbol, sale, lots, allocations);
  }, [db, dataVersion, saleId]);

  if (!detail) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'ไม่พบการขาย', headerShown: true }} />
        <EmptyState title="ไม่พบรายการนี้" hint="อาจถูกลบไปแล้ว" />
      </Screen>
    );
  }

  function remove() {
    Alert.alert('ลบการขาย', 'ยืนยันการลบ? การจัดสรรจะถูกคำนวณใหม่ทั้งหมด', [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ลบ', style: 'destructive', onPress: () => { deleteSale(db, saleId); reload(); router.back(); } },
    ]);
  }

  const { symbol, sale, lines, proceedsThb, costBasisThb, capitalGainThb } = detail;
  return (
    <Screen scroll>
      <Stack.Screen options={{ title: `${symbol.ticker} · ขาย`, headerShown: true }} />
      <Card>
        <CardTitle>{symbol.ticker}</CardTitle>
        <Row label="วันที่ขาย" value={sale.sellDate} />
        <Row label="จำนวนที่ขาย" value={formatQty(sale.qtySold)} />
        <Row label="ราคาขาย (USD)" value={formatPrice(sale.salePriceUsd)} />
        <Row label="เรต USD/THB" value={formatFxRate(sale.fxRateUsdThb)} />
        <Row label="รายรับ" value={formatMoneyThb(proceedsThb)} />
        <Row label="ต้นทุน (FIFO)" value={formatMoneyThb(costBasisThb)} />
        <View style={styles.gainRow}>
          <Text style={styles.gainLabel}>กำไร/ขาดทุน</Text>
          <GainLoss value={capitalGainThb.toString()} display={formatSignedThb(capitalGainThb)} />
        </View>
      </Card>

      <Card style={{ marginTop: space[3] }}>
        <CardTitle>ขายจากล็อต (เก่าสุดก่อน)</CardTitle>
        {lines.map((line) => (
          <View key={line.lotId} style={styles.allocRow}>
            <View>
              <Text style={styles.allocDate}>{line.buyDate}</Text>
              <Text style={styles.allocMeta}>ล็อต #{line.lotId}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.allocQty}>{formatQty(line.qtyAllocated)} หน่วย</Text>
              <Text style={styles.allocMeta}>ต้นทุน {formatMoneyThb(line.costBasisThb)}</Text>
            </View>
          </View>
        ))}
      </Card>

      {sale.evidenceFile ? (
        <Image
          source={{ uri: resolveEvidenceUri(sale.evidenceFile) }}
          style={{ width: '100%', height: 220, borderRadius: 8, marginTop: 16 }}
          resizeMode="contain"
        />
      ) : null}

      <View style={styles.actions}>
        <Button title="แก้ไข" variant="outline" onPress={() => router.push(`/sale/${saleId}/edit`)} style={{ flex: 1 }} />
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
  gainRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: space[3], marginTop: space[2], borderTopColor: color.cardBorder, borderTopWidth: 1 },
  gainLabel: { color: color.textBody, fontFamily: fontFamily.sansSemibold, fontSize: font.size.md },
  allocRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space[2], borderBottomColor: color.cardBorder, borderBottomWidth: StyleSheet.hairlineWidth },
  allocDate: { color: color.textBody, fontFamily: fontFamily.monoMedium, fontSize: font.size.sm },
  allocQty: { color: color.textBody, fontFamily: fontFamily.monoMedium, fontSize: font.size.sm },
  allocMeta: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs, marginTop: 2 },
  actions: { flexDirection: 'row', gap: space[3], marginTop: space[4] },
});
