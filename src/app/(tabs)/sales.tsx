import { useMemo } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Screen } from '../../ui/components/Screen';
import { ListRow } from '../../ui/components/ListRow';
import { EmptyState } from '../../ui/components/EmptyState';
import { Button } from '../../ui/components/Button';
import { GainLoss } from '../../ui/components/GainLoss';
import { useAppStore } from '../../store/useAppStore';
import { listSales, listAllocations, listSymbols } from '../../db/repo';
import { toDomainSale } from '../../services/ledger';
import { saleCapitalGainThb } from '../../core/derive';
import { fromStored } from '../../core/money';
import { formatQty, formatSignedThb } from '../../ui/format';
import { color, space, font, fontFamily } from '../../theme/tokens';

export default function SalesScreen() {
  const db = useAppStore((s) => s.db)!;
  const dataVersion = useAppStore((s) => s.dataVersion);
  const router = useRouter();

  const { rows, tickerById } = useMemo(() => {
    const symbols = listSymbols(db);
    const tickerById = new Map(symbols.map((s) => [s.id, s.ticker]));
    const allocations = listAllocations(db).map((a) => ({
      saleId: a.saleId, lotId: a.lotId, qtyAllocated: fromStored(a.qtyAllocated), costBasisThb: fromStored(a.costBasisThb),
    }));
    const rows = listSales(db).map(toDomainSale).map((sale) => ({
      sale, gain: saleCapitalGainThb(sale, allocations),
    }));
    return { rows, tickerById };
  }, [db, dataVersion]);

  return (
    <Screen scroll>
      <Stack.Screen options={{ headerShown: false }} />
      <Button title="+ บันทึกการขาย" onPress={() => router.push('/sale/new')} style={{ marginBottom: space[3] }} />
      {rows.length === 0 ? (
        <EmptyState title="ยังไม่มีรายการขาย" hint="กดปุ่มด้านบนเพื่อบันทึกการขาย" />
      ) : (
        rows.map(({ sale, gain }) => (
          <ListRow key={sale.id} onPress={() => router.push(`/sale/${sale.id}`)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ticker}>{tickerById.get(sale.symbolId) ?? '—'}</Text>
              <Text style={styles.meta}>{sale.sellDate} · {formatQty(sale.qtySold)} หน่วย</Text>
            </View>
            <GainLoss value={gain.toString()} display={formatSignedThb(gain)} />
          </ListRow>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  ticker: { color: color.textBody, fontFamily: fontFamily.monoSemibold, fontSize: font.size.md },
  meta: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs, marginTop: 2 },
});
