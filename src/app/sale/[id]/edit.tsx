import { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../../ui/components/Screen';
import { Button } from '../../../ui/components/Button';
import { FormField, DecimalInput } from '../../../ui/components/Field';
import { DateField } from '../../../ui/components/DateField';
import { SymbolCombo } from '../../../ui/components/SymbolCombo';
import { EvidencePicker } from '../../../ui/components/EvidencePicker';
import { EmptyState } from '../../../ui/components/EmptyState';
import { useAppStore } from '../../../store/useAppStore';
import { listSymbols, getSale, createSymbol, DuplicateTickerError } from '../../../db/repo';
import type { SymbolRow } from '../../../core/types';
import { editSale } from '../../../services/ledger';
import { InsufficientLotsError } from '../../../core/fifo';
import { validateSaleForm, type SaleFormState, type SaleFormErrors } from '../../../ui/saleForm';
import { formatQty } from '../../../ui/format';

export default function EditSaleScreen() {
  const db = useAppStore((s) => s.db)!;
  const dataVersion = useAppStore((s) => s.dataVersion);
  const reload = useAppStore((s) => s.reload);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const saleId = Number(id);

  const symbols = useMemo(() => listSymbols(db), [db, dataVersion]);
  const existing = useMemo(() => getSale(db, saleId), [db, saleId]);
  const initialTicker = existing ? (symbols.find((s) => s.id === existing.symbolId)?.ticker ?? '') : '';
  const [query, setQuery] = useState(initialTicker);
  const [form, setForm] = useState<SaleFormState | null>(
    existing
      ? {
          symbolId: existing.symbolId, sellDate: existing.sellDate, qtySold: existing.qtySold,
          salePriceUsd: existing.salePriceUsd, feeUsd: existing.feeUsd, fxRateUsdThb: existing.fxRateUsdThb,
          evidenceFile: existing.evidenceFile,
        }
      : null,
  );
  const [errors, setErrors] = useState<SaleFormErrors>({});

  if (!existing || !form) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'แก้ไขการขาย', headerShown: true }} />
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
    const { input, errors: errs } = validateSaleForm(form!);
    setErrors(errs);
    if (!input) return;
    try {
      editSale(db, saleId, input);
      reload();
      router.back();
    } catch (e) {
      if (e instanceof InsufficientLotsError) {
        const ticker = symbols.find((s) => s.id === e.symbolId)?.ticker ?? '';
        Alert.alert('จำนวนไม่พอขาย', `ขาย ${ticker} จำนวน ${formatQty(e.requested)} ในวันที่ ${e.sellDate} ไม่ได้ — มีอยู่เพียง ${formatQty(e.available)} ณ วันนั้น`);
      } else throw e;
    }
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'แก้ไขการขาย', headerShown: true }} />
      <SymbolCombo
        symbols={symbols} query={query} symbolId={form.symbolId}
        onPick={pick} onAdd={add}
        onChangeQuery={(t) => { setQuery(t); setForm((f) => (f ? { ...f, symbolId: null } : f)); }}
        error={errors.symbol}
      />
      <DateField label="วันที่ขาย" value={form.sellDate} onChange={(sellDate) => setForm((f) => (f ? { ...f, sellDate } : f))} error={errors.sellDate} />
      <FormField label="จำนวนที่ขาย" error={errors.qtySold}>
        <DecimalInput value={form.qtySold} onChangeText={(qtySold) => setForm((f) => (f ? { ...f, qtySold } : f))} />
      </FormField>
      <FormField label="ราคาขาย (USD)" error={errors.salePriceUsd}>
        <DecimalInput value={form.salePriceUsd} onChangeText={(salePriceUsd) => setForm((f) => (f ? { ...f, salePriceUsd } : f))} />
      </FormField>
      <FormField label="ค่าธรรมเนียม (USD)" error={errors.feeUsd} helpText="เว้นว่างได้ = 0">
        <DecimalInput value={form.feeUsd} onChangeText={(feeUsd) => setForm((f) => (f ? { ...f, feeUsd } : f))} />
      </FormField>
      <FormField label="เรตแลกเงิน USD/THB" error={errors.fxRateUsdThb}>
        <DecimalInput value={form.fxRateUsdThb} onChangeText={(fxRateUsdThb) => setForm((f) => (f ? { ...f, fxRateUsdThb } : f))} />
      </FormField>
      <EvidencePicker
        filename={form.evidenceFile}
        onChange={(evidenceFile) => setForm((f) => (f ? { ...f, evidenceFile } : f))}
      />
      <Button title="บันทึกการแก้ไข" onPress={save} />
    </Screen>
  );
}
