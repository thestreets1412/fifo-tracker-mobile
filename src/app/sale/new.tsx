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
import { addSale } from '../../services/ledger';
import { backfillSymbolName } from '../../services/symbolLookup';
import { InsufficientLotsError } from '../../core/fifo';
import { validateSaleForm, type SaleFormState, type SaleFormErrors } from '../../ui/saleForm';
import { todayYmd } from '../../ui/dateInput';
import { insufficientLotsMessage } from '../../ui/errors';

export default function NewSaleScreen() {
  const db = useAppStore((s) => s.db)!;
  const dataVersion = useAppStore((s) => s.dataVersion);
  const reload = useAppStore((s) => s.reload);
  const router = useRouter();
  const symbols = useMemo(() => listSymbols(db), [db, dataVersion]);

  const [query, setQuery] = useState('');
  const [form, setForm] = useState<SaleFormState>({
    symbolId: null, sellDate: todayYmd(), qtySold: '', salePriceUsd: '', feeUsd: '', fxRateUsdThb: '', evidenceFile: null,
  });
  const [errors, setErrors] = useState<SaleFormErrors>({});

  function pick(symbol: SymbolRow) { setForm((f) => ({ ...f, symbolId: symbol.id })); setQuery(symbol.ticker); }
  function add(ticker: string) {
    try {
      const c = createSymbol(db, ticker);
      reload();
      pick(c);
      // Advisory only (spec §7.4): the symbol already exists and the form
      // is already usable. If a name comes back, the list refreshes; if
      // not, nothing happens and nothing is reported.
      void backfillSymbolName(db, c).then((name) => { if (name) reload(); });
    } catch (e) {
      if (e instanceof DuplicateTickerError) Alert.alert('มีสัญลักษณ์นี้แล้ว', ticker);
      else throw e;
    }
  }

  function save() {
    const { input, errors: errs } = validateSaleForm(form);
    setErrors(errs);
    if (!input) return;
    try {
      addSale(db, input);
      reload();
      router.back();
    } catch (e) {
      if (e instanceof InsufficientLotsError) {
        Alert.alert('จำนวนไม่พอขาย', insufficientLotsMessage(e, symbols));
      } else throw e;
    }
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'บันทึกการขาย', headerShown: true }} />
      <SymbolCombo
        symbols={symbols} query={query} symbolId={form.symbolId}
        onPick={pick} onAdd={add}
        onChangeQuery={(t) => { setQuery(t); setForm((f) => ({ ...f, symbolId: null })); }}
        error={errors.symbol}
      />
      <DateField label="วันที่ขาย" value={form.sellDate} onChange={(sellDate) => setForm((f) => ({ ...f, sellDate }))} error={errors.sellDate} />
      <FormField label="จำนวนที่ขาย" error={errors.qtySold}>
        <DecimalInput value={form.qtySold} onChangeText={(qtySold) => setForm((f) => ({ ...f, qtySold }))} placeholder="5" />
      </FormField>
      <FormField label="ราคาขาย (USD)" error={errors.salePriceUsd}>
        <DecimalInput value={form.salePriceUsd} onChangeText={(salePriceUsd) => setForm((f) => ({ ...f, salePriceUsd }))} placeholder="150" />
      </FormField>
      <FormField label="ค่าธรรมเนียม (USD)" error={errors.feeUsd} helpText="เว้นว่างได้ = 0">
        <DecimalInput value={form.feeUsd} onChangeText={(feeUsd) => setForm((f) => ({ ...f, feeUsd }))} placeholder="0" />
      </FormField>
      <FxRateField
        value={form.fxRateUsdThb}
        date={form.sellDate}
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
