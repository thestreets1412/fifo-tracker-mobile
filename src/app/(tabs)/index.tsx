import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import Decimal from 'decimal.js';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/components/Screen';
import { Card, CardTitle } from '../../ui/components/Card';
import { ListRow } from '../../ui/components/ListRow';
import { EmptyState } from '../../ui/components/EmptyState';
import { GainLoss } from '../../ui/components/GainLoss';
import { StatTile } from '../../ui/components/StatTile';
import { AllocationBar } from '../../ui/components/AllocationBar';
import { useAppStore } from '../../store/useAppStore';
import { buildPortfolioSummary, listPortfolioSymbols, type LivePrice } from '../../services/portfolio';
import { getQuote } from '../../services/quotes';
import { getTodayFxRate, type FxRateResult } from '../../services/fx';
import { lotQtyRemaining } from '../../core/derive';
import { fromStored } from '../../core/money';
import { listLots, listAllocations } from '../../db/repo';
import { toDomainLot } from '../../services/ledger';
import { buildAllocationSegments } from '../../ui/allocation';
import { formatQuoteAge } from '../../ui/quoteAge';
import { formatMoneyThb, formatSignedThb, formatQty, formatFxRate } from '../../ui/format';
import { color, space, font, fontFamily } from '../../theme/tokens';

export default function DashboardScreen() {
  const db = useAppStore((s) => s.db)!;
  const dataVersion = useAppStore((s) => s.dataVersion);
  const router = useRouter();

  const [prices, setPrices] = useState<ReadonlyMap<number, LivePrice>>(new Map());
  const [fx, setFx] = useState<FxRateResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Which symbols actually need a price: only those still holding shares.
   * A fully-sold position has no live value, so requesting its quote would
   * be a wasted round trip and a needless disclosure of a ticker the user
   * no longer holds.
   */
  const symbolsNeedingPrice = useMemo(() => {
    const allocations = listAllocations(db).map((a) => ({
      saleId: a.saleId, lotId: a.lotId,
      qtyAllocated: fromStored(a.qtyAllocated), costBasisThb: fromStored(a.costBasisThb),
    }));
    return listPortfolioSymbols(db).filter((symbol) => {
      const remaining = listLots(db, symbol.id)
        .map(toDomainLot)
        .reduce((total, lot) => total.plus(lotQtyRemaining(lot, allocations)), new Decimal(0));
      return remaining.greaterThan(0);
    });
  }, [db, dataVersion]);

  const loadLive = useCallback(
    async (isCancelled: () => boolean) => {
      const rate = await getTodayFxRate(db);
      if (isCancelled()) return;
      setFx(rate);

      // allSettled, not all: spec §5 requires one failed lookup to degrade
      // that symbol only. getQuote already resolves to null instead of
      // throwing, so a rejection here would mean a genuine bug — it is
      // still tolerated so the other symbols survive it.
      const results = await Promise.allSettled(
        symbolsNeedingPrice.map(async (symbol) => ({ symbol, quote: await getQuote(db, symbol.ticker) })),
      );
      if (isCancelled()) return;

      const next = new Map<number, LivePrice>();
      for (const result of results) {
        if (result.status !== 'fulfilled' || !result.value.quote) continue;
        const { symbol, quote } = result.value;
        next.set(symbol.id, { priceUsd: quote.priceUsd, fetchedAt: quote.fetchedAt, stale: quote.stale });
      }
      setPrices(next);
    },
    [db, symbolsNeedingPrice],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadLive(() => cancelled).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [loadLive]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadLive(() => false).finally(() => setRefreshing(false));
  }, [loadLive]);

  const summary = useMemo(
    () => buildPortfolioSummary(db, prices, fx?.rate ?? null),
    [db, dataVersion, prices, fx],
  );

  const segments = useMemo(
    () => buildAllocationSegments(summary.rows.map((row) => ({ ticker: row.symbol.ticker, costThb: row.costThb }))),
    [summary],
  );

  const now = new Date();
  const unrealized = summary.totalUnrealizedGainThb;

  if (summary.rows.length === 0) {
    return (
      <Screen scroll>
        <EmptyState title="ยังไม่มีข้อมูลพอร์ต" hint="บันทึกการซื้อรายการแรกในแท็บ “ซื้อ”" />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.actionPrimary} />
      }
    >
      <View style={styles.tiles}>
        <StatTile
          label="มูลค่าพอร์ต"
          value={summary.totalValueThb ? formatMoneyThb(summary.totalValueThb) : '—'}
          sub={summary.totalValueThb ? undefined : 'ราคาบางตัวยังดึงไม่ได้'}
        />
        <StatTile
          label="กำไรยังไม่รับรู้"
          value={unrealized ? formatSignedThb(unrealized) : '—'}
          tone={unrealized ? (unrealized.greaterThanOrEqualTo(0) ? 'gain' : 'loss') : 'neutral'}
        />
        <StatTile label="ต้นทุนคงเหลือ" value={formatMoneyThb(summary.totalCostThb)} />
        <StatTile
          label="กำไรรับรู้แล้ว"
          value={formatSignedThb(summary.totalRealizedGainThb)}
          tone={summary.totalRealizedGainThb.greaterThanOrEqualTo(0) ? 'gain' : 'loss'}
        />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={color.actionPrimary} />
          <Text style={styles.note}>กำลังดึงราคาล่าสุด…</Text>
        </View>
      ) : null}

      {fx ? (
        <Text style={styles.note}>
          เรต USD/THB {formatFxRate(fx.rate)}
          {fx.stale ? ` · ของวันที่ ${fx.rateDate} (ออฟไลน์)` : ''}
        </Text>
      ) : (
        <Text style={styles.warn}>ดึงเรตแลกเงินไม่ได้ — แสดงเฉพาะต้นทุน</Text>
      )}

      {segments.length > 0 ? (
        <Card style={{ marginTop: space[3] }}>
          <CardTitle>สัดส่วนต้นทุน</CardTitle>
          <AllocationBar segments={segments} />
        </Card>
      ) : null}

      <Card style={{ marginTop: space[3] }}>
        <CardTitle>รายตัว</CardTitle>
        {summary.rows.map((row) => (
          <ListRow key={row.symbol.id} onPress={() => router.push('/lots')}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ticker}>{row.symbol.ticker}</Text>
              <Text style={styles.meta}>
                {formatQty(row.remainingQty)} หน่วย · ต้นทุน {formatMoneyThb(row.costThb)}
              </Text>
              {row.priceFetchedAt ? (
                <Text style={row.priceStale ? styles.warnSmall : styles.meta}>
                  ราคา{formatQuoteAge(row.priceFetchedAt, now)}
                </Text>
              ) : row.remainingQty.greaterThan(0) ? (
                <Text style={styles.warnSmall}>ดึงราคาไม่ได้</Text>
              ) : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.value}>
                {row.currentValueThb ? formatMoneyThb(row.currentValueThb) : '—'}
              </Text>
              {row.unrealizedGainThb ? (
                <GainLoss
                  value={row.unrealizedGainThb.toString()}
                  display={`${formatSignedThb(row.unrealizedGainThb)}${
                    row.unrealizedGainPct ? ` (${row.unrealizedGainPct.toFixed(2)}%)` : ''
                  }`}
                />
              ) : null}
            </View>
          </ListRow>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  loading: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[3] },
  note: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs, marginTop: space[3] },
  warn: { color: color.warning, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs, marginTop: space[3] },
  warnSmall: { color: color.warning, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs, marginTop: 2 },
  ticker: { color: color.textBody, fontFamily: fontFamily.monoSemibold, fontSize: font.size.md },
  value: { color: color.textBody, fontFamily: fontFamily.monoMedium, fontSize: font.size.md },
  meta: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs, marginTop: 2 },
});
