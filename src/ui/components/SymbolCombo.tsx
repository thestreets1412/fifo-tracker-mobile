import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { SymbolRow } from '../../core/types';
import { filterSymbols } from '../symbolCombo';
import { FormField, TextInput } from './Field';
import { color, space, radius, font, fontFamily } from '../../theme/tokens';

export function SymbolCombo({
  symbols, query, symbolId, onPick, onChangeQuery, onAdd, error,
}: {
  symbols: readonly SymbolRow[];
  query: string;
  symbolId: number | null;
  onPick: (symbol: SymbolRow) => void;
  onChangeQuery: (text: string) => void;
  onAdd: (ticker: string) => void;
  error?: string;
}) {
  const { matches, canAdd, addTicker } = filterSymbols(query, symbols);
  const showList = query.trim() !== '' && symbolId === null;

  return (
    <FormField label="สัญลักษณ์" error={error}>
      <TextInput
        value={query}
        onChangeText={onChangeQuery}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="เช่น NVDA"
        error={!!error}
      />
      {showList ? (
        <View style={styles.dropdown}>
          {matches.map((s) => (
            <Pressable key={s.id} onPress={() => onPick(s)} style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}>
              <Text style={styles.ticker}>{s.ticker}</Text>
              {s.name ? <Text style={styles.name}>{s.name}</Text> : null}
            </Pressable>
          ))}
          {canAdd ? (
            <Pressable onPress={() => onAdd(addTicker)} style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}>
              <Text style={styles.add}>เพิ่ม “{addTicker}”</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </FormField>
  );
}

const styles = StyleSheet.create({
  dropdown: { marginTop: space[1], borderColor: color.cardBorder, borderWidth: 1, borderRadius: radius.md, backgroundColor: color.inputBg, overflow: 'hidden' },
  row: { paddingVertical: space[2], paddingHorizontal: space[3], borderBottomColor: color.cardBorder, borderBottomWidth: StyleSheet.hairlineWidth },
  pressed: { backgroundColor: color.hover },
  ticker: { color: color.textBody, fontFamily: fontFamily.monoSemibold, fontSize: font.size.md },
  name: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs },
  add: { color: color.actionPrimary, fontFamily: fontFamily.sansSemibold, fontSize: font.size.md },
});
