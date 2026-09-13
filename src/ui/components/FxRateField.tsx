import { useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Button } from './Button';
import { FormField, DecimalInput } from './Field';
import { useAppStore } from '../../store/useAppStore';
import { getFxRateForDate } from '../../services/fx';
import { isValidYmd } from '../dateInput';
import { DP } from '../../core/money';
import { color, space, font, fontFamily } from '../../theme/tokens';

/**
 * The FX rate field, with a button that fills it from Frankfurter for the
 * date already entered on the form.
 *
 * The lookup is a convenience and never a gate (spec §5 names manual entry
 * as the fallback): the field stays fully typeable, a failure only prints a
 * line of text, and saving never waits on the network.
 */
export function FxRateField({
  value, date, onChange, error,
}: {
  value: string;
  /** The buy or sell date already on the form, 'YYYY-MM-DD'. */
  date: string;
  onChange: (text: string) => void;
  error?: string;
}) {
  const db = useAppStore((s) => s.db)!;
  const [fetching, setFetching] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const dateUsable = isValidYmd(date);

  async function fill() {
    setFetching(true);
    setStatus(null);
    try {
      const result = await getFxRateForDate(db, date);
      if (!result) {
        setStatus('ดึงเรตไม่สำเร็จ — กรอกเอง');
        return;
      }
      onChange(result.rate.toFixed(DP.fxRate));
      setStatus(result.stale ? `เรตวันที่ ${result.rateDate} (จากแคช)` : `เรตวันที่ ${result.rateDate}`);
    } finally {
      setFetching(false);
    }
  }

  return (
    <FormField label="เรตแลกเงิน USD/THB" error={error}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <DecimalInput value={value} onChangeText={onChange} placeholder="36.21" error={!!error} />
        </View>
        {fetching ? (
          <ActivityIndicator color={color.actionPrimary} style={styles.spinner} />
        ) : (
          <Button title="ดึงเรต" variant="outline" disabled={!dateUsable} onPress={() => { void fill(); }} />
        )}
      </View>
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </FormField>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  spinner: { width: 64 },
  status: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs, marginTop: space[1] },
});
