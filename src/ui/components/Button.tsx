import { Pressable, Text, StyleSheet, type ViewStyle } from 'react-native';
import { color, radius, space, font, fontFamily } from '../../theme/tokens';

type Variant = 'primary' | 'outline' | 'danger';

export function Button({
  title, onPress, variant = 'primary', disabled = false, style,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const v = styles[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base, v.box,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      <Text style={[styles.label, v.label]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { paddingVertical: space[2], paddingHorizontal: space[3], borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fontFamily.sansSemibold, fontSize: font.size.md },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
  primary: {
    box: { backgroundColor: color.actionPrimary, borderColor: color.actionPrimary },
    label: { color: color.textOnAction },
  } as any,
  outline: {
    box: { backgroundColor: 'transparent', borderColor: color.borderStrong },
    label: { color: color.actionPrimary },
  } as any,
  danger: {
    box: { backgroundColor: 'transparent', borderColor: color.danger },
    label: { color: color.danger },
  } as any,
});
