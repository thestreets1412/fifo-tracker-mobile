import { useMemo } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Screen } from '../../ui/components/Screen';
import { ListRow } from '../../ui/components/ListRow';
import { EmptyState } from '../../ui/components/EmptyState';
import { Button } from '../../ui/components/Button';
import { useAppStore } from '../../store/useAppStore';
import { listLots, listSymbols, listAllocations } from '../../db/repo';
import { toDomainLot } from '../../services/ledger';
import { lotQtyRemaining } from '../../core/derive';
import { fromStored } from '../../core/money';
import { formatQty, formatPrice } from '../../ui/format';
import { color, space, font, fontFamily } from '../../theme/tokens';

export default function LotsScreen() {
  const db = useAppStore((s) => s.db)!;
  const dataVersion = useAppStore((s) => s.dataVersion);
  const router = useRouter();

  const { rows, tickerById } = useMemo(() => {
    const symbols = listSymbols(db);
    const tickerById = new Map(symbols.map((s) => [s.id, s.ticker]));
    const allocations = listAllocations(db).map((a) => ({
      saleId: a.saleId, lotId: a.lotId, qtyAllocated: fromStored(a.qtyAllocated), costBasisThb: fromStored(a.costBasisThb),
    }));
    const rows = listLots(db).map(toDomainLot).map((lot) => ({
      lot, remaining: lotQtyRemaining(lot, allocations),
    }));
    return { rows, tickerById };
  }, [db, dataVersion]);

  return (
    <Screen scroll>
      <Stack.Screen options={{ headerShown: false }} />
      <Button title="+ บันทึกการซื้อ" onPress={() => router.push('/lot/new')} style={{ marginBottom: space[3] }} />
      {rows.length === 0 ? (
        <EmptyState title="ยังไม่มีรายการซื้อ" hint="กดปุ่มด้านบนเพื่อบันทึกล็อตแรก" />
      ) : (
        rows.map(({ lot, remaining }) => (
          <ListRow key={lot.id} onPress={() => router.push(`/lot/${lot.id}`)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ticker}>{tickerById.get(lot.symbolId) ?? '—'}</Text>
              <Text style={styles.meta}>{lot.buyDate} · {formatPrice(lot.priceUsd)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.qty}>{formatQty(lot.qty)}</Text>
              <Text style={styles.meta}>เหลือ {formatQty(remaining)}</Text>
            </View>
          </ListRow>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  ticker: { color: color.textBody, fontFamily: fontFamily.monoSemibold, fontSize: font.size.md },
  qty: { color: color.textBody, fontFamily: fontFamily.monoMedium, fontSize: font.size.md },
  meta: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs, marginTop: 2 },
});
