import { View, Text, TextInput as RNTextInput, StyleSheet, type TextInputProps } from 'react-native';
import { color, radius, space, font, fontFamily } from '../../theme/tokens';

export function FormField({
  label, error, helpText, children,
}: {
  label: string;
  error?: string;
  helpText?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {helpText ? <Text style={styles.help}>{helpText}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function TextInput({ error, style, ...rest }: TextInputProps & { error?: boolean }) {
  return (
    <RNTextInput
      placeholderTextColor={color.textMuted}
      style={[styles.input, error ? styles.inputError : null, style]}
      {...rest}
    />
  );
}

/** Decimal entry: numeric keypad, and `,` stripped so grouping chars never reach parseInput. */
export function DecimalInput({ value, onChangeText, error, style, ...rest }: TextInputProps & { error?: boolean }) {
  return (
    <TextInput
      keyboardType="decimal-pad"
      inputMode="decimal"
      value={value}
      onChangeText={(t) => onChangeText?.(t.replace(/,/g, ''))}
      error={error}
      style={style}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: space[3] },
  label: { color: color.textBody, fontFamily: fontFamily.sansMedium, fontSize: font.size.sm, marginBottom: space[1] },
  input: {
    backgroundColor: color.inputBg, borderColor: color.cardBorder, borderWidth: 1, borderRadius: radius.md,
    paddingVertical: space[2], paddingHorizontal: space[3], color: color.textBody,
    fontFamily: fontFamily.monoRegular, fontSize: font.size.md,
  },
  inputError: { borderColor: color.loss },
  help: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs, marginTop: space[1] },
  error: { color: color.loss, fontFamily: fontFamily.sansRegular, fontSize: font.size.xs, marginTop: space[1] },
});
