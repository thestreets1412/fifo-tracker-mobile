import { useState } from 'react';
import { Platform, Pressable, Text, StyleSheet } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { FormField } from './Field';
import { isValidYmd, todayYmd } from '../dateInput';
import { color, space, radius, font, fontFamily } from '../../theme/tokens';

export function DateField({
  label, value, onChange, error,
}: {
  label: string;
  value: string;
  onChange: (ymd: string) => void;
  error?: string;
}) {
  const [show, setShow] = useState(false);
  const current = isValidYmd(value) ? new Date(`${value}T00:00:00`) : new Date(`${todayYmd()}T00:00:00`);

  function handle(event: DateTimePickerEvent, date?: Date) {
    setShow(false);
    if (event.type === 'set' && date) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      onChange(`${y}-${m}-${d}`);
    }
  }

  return (
    <FormField label={label} error={error}>
      <Pressable onPress={() => setShow(true)} style={[styles.box, error ? styles.boxError : null]}>
        <Text style={styles.text}>{value || 'เลือกวันที่'}</Text>
      </Pressable>
      {show ? (
        <DateTimePicker value={current} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={handle} />
      ) : null}
    </FormField>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: color.inputBg, borderColor: color.cardBorder, borderWidth: 1, borderRadius: radius.md, paddingVertical: space[2], paddingHorizontal: space[3] },
  boxError: { borderColor: color.loss },
  text: { color: color.textBody, fontFamily: fontFamily.monoRegular, fontSize: font.size.md },
});
