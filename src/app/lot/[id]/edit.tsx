import { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../../ui/components/Screen';
import { Button } from '../../../ui/components/Button';
import { FormField, DecimalInput } from '../../../ui/components/Field';
import { DateField } from '../../../ui/components/DateField';
import { SymbolCombo } from '../../../ui/components/SymbolCombo';
import { EmptyState } from '../../../ui/components/EmptyState';
import { useAppStore } from '../../../store/useAppStore';
import { listSymbols, getLot, createSymbol, DuplicateTickerError } from '../../../db/repo';
import type { SymbolRow } from '../../../core/types';
import { editLot } from '../../../services/ledger';
import { validateLotForm, type LotFormState, type LotFormErrors } from '../../../ui/lotForm';

export default function EditLotScreen() {
  const db = useAppStore((s) => s.db)!;
  const dataVersion = useAppStore((s) => s.dataVersion);
  const reload = useAppStore((s) => s.reload);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const lotId = Number(id);

  const symbols = useMemo(() => listSymbols(db), [db, dataVersion]);
  const existing = useMemo(() => getLot(db, lotId), [db, lotId]);

  const initialTicker = existing ? (symbols.find((s) => s.id === existing.symbolId)?.ticker ?? '') : '';
  const [query, setQuery] = useState(initialTicker);
  const [form, setForm] = useState<LotFormState | null>(
    existing
      ? {
          symbolId: existing.symbolId,
          buyDate: existing.buyDate,
          priceUsd: existing.priceUsd,
          qty: existing.qty,
          fxRateUsdThb: existing.fxRateUsdThb,
          evidenceFile: existing.evidenceFile,
        }
      : null,
  );
  const [errors, setErrors] = useState<LotFormErrors>({});

  if (!existing || !form) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'แก้ไขการซื้อ', headerShown: true }} />
        <EmptyState title="ไม่พบรายการนี้" />
      </Screen>
    );
  }

  function pick(symbol: SymbolRow) { setForm((f) => (f ? { ...f, symbolId: symbol.id } : f)); setQuery(symbol.ticker); }
  function add(ticker: string) {
    try { const c = createSymbol(db, ticker); reload(); pick(c); }
    catch (e) { if (e instanceof DuplicateTickerError) Alert.alert('มีสัญลักษณ์นี้แล้ว', ticker); else throw e; }
  }
  function save() {
    const { input, errors: errs } = validateLotForm(form!);
    setErrors(errs);
    if (!input) return;
    editLot(db, lotId, input);
    reload();
    router.back();
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'แก้ไขการซื้อ', headerShown: true }} />
      <SymbolCombo
        symbols={symbols} query={query} symbolId={form.symbolId}
        onPick={pick} onAdd={add}
        onChangeQuery={(t) => { setQuery(t); setForm((f) => (f ? { ...f, symbolId: null } : f)); }}
        error={errors.symbol}
      />
      <DateField label="วันที่ซื้อ" value={form.buyDate} onChange={(buyDate) => setForm((f) => (f ? { ...f, buyDate } : f))} error={errors.buyDate} />
      <FormField label="ราคา (USD)" error={errors.priceUsd}>
        <DecimalInput value={form.priceUsd} onChangeText={(priceUsd) => setForm((f) => (f ? { ...f, priceUsd } : f))} />
      </FormField>
      <FormField label="จำนวน" error={errors.qty}>
        <DecimalInput value={form.qty} onChangeText={(qty) => setForm((f) => (f ? { ...f, qty } : f))} />
      </FormField>
      <FormField label="เรตแลกเงิน USD/THB" error={errors.fxRateUsdThb}>
        <DecimalInput value={form.fxRateUsdThb} onChangeText={(fxRateUsdThb) => setForm((f) => (f ? { ...f, fxRateUsdThb } : f))} />
      </FormField>
      <Button title="บันทึกการแก้ไข" onPress={save} />
    </Screen>
  );
}
