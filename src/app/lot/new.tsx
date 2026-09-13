import { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Screen } from '../../ui/components/Screen';
import { Button } from '../../ui/components/Button';
import { FormField, DecimalInput } from '../../ui/components/Field';
import { DateField } from '../../ui/components/DateField';
import { SymbolCombo } from '../../ui/components/SymbolCombo';
import { EvidencePicker } from '../../ui/components/EvidencePicker';
import { FxRateField } from '../../ui/components/FxRateField';
import { useAppStore } from '../../store/useAppStore';
import { listSymbols, createSymbol, DuplicateTickerError } from '../../db/repo';
import type { SymbolRow } from '../../core/types';
import { addLot } from '../../services/ledger';
import { validateLotForm, type LotFormState, type LotFormErrors } from '../../ui/lotForm';
import { todayYmd } from '../../ui/dateInput';

export default function NewLotScreen() {
  const db = useAppStore((s) => s.db)!;
  const dataVersion = useAppStore((s) => s.dataVersion);
  const reload = useAppStore((s) => s.reload);
  const router = useRouter();
  const symbols = useMemo(() => listSymbols(db), [db, dataVersion]);

  const [query, setQuery] = useState('');
  const [form, setForm] = useState<LotFormState>({
    symbolId: null, buyDate: todayYmd(), priceUsd: '', qty: '', fxRateUsdThb: '', evidenceFile: null,
  });
  const [errors, setErrors] = useState<LotFormErrors>({});

  function pick(symbol: SymbolRow) {
    setForm((f) => ({ ...f, symbolId: symbol.id }));
    setQuery(symbol.ticker);
  }

  function add(ticker: string) {
    try {
      const created = createSymbol(db, ticker);
      reload();
      pick(created);
    } catch (e) {
      if (e instanceof DuplicateTickerError) Alert.alert('มีสัญลักษณ์นี้แล้ว', ticker);
      else throw e;
    }
  }

  function save() {
    const { input, errors: errs } = validateLotForm(form);
    setErrors(errs);
    if (!input) return;
    addLot(db, input);
    reload();
    router.back();
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'บันทึกการซื้อ', headerShown: true }} />
      <SymbolCombo
        symbols={symbols} query={query} symbolId={form.symbolId}
        onPick={pick} onAdd={add}
        onChangeQuery={(t) => { setQuery(t); setForm((f) => ({ ...f, symbolId: null })); }}
        error={errors.symbol}
      />
      <DateField label="วันที่ซื้อ" value={form.buyDate} onChange={(buyDate) => setForm((f) => ({ ...f, buyDate }))} error={errors.buyDate} />
      <FormField label="ราคา (USD)" error={errors.priceUsd}>
        <DecimalInput value={form.priceUsd} onChangeText={(priceUsd) => setForm((f) => ({ ...f, priceUsd }))} placeholder="142.35" />
      </FormField>
      <FormField label="จำนวน" error={errors.qty}>
        <DecimalInput value={form.qty} onChangeText={(qty) => setForm((f) => ({ ...f, qty }))} placeholder="10" />
      </FormField>
      <FxRateField
        value={form.fxRateUsdThb}
        date={form.buyDate}
        onChange={(fxRateUsdThb) => setForm((f) => ({ ...f, fxRateUsdThb }))}
        error={errors.fxRateUsdThb}
      />
      <EvidencePicker
        filename={form.evidenceFile}
        onChange={(evidenceFile) => setForm((f) => ({ ...f, evidenceFile }))}
      />
      <Button title="บันทึก" onPress={save} />
    </Screen>
  );
}
