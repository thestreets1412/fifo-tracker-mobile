import { View, Image, Text, Alert, StyleSheet } from 'react-native';
import { FormField } from './Field';
import { Button } from './Button';
import { pickImageFromGallery, storeEvidence, resolveEvidenceUri } from '../../services/evidence';
import { color, space, radius, font, fontFamily } from '../../theme/tokens';

export function EvidencePicker({ filename, onChange }: { filename: string | null; onChange: (filename: string | null) => void }) {
  async function attach() {
    try {
      const picked = await pickImageFromGallery();
      if (!picked) return;
      const stored = await storeEvidence(picked);
      onChange(stored);
    } catch (e) {
      Alert.alert('แนบรูปไม่สำเร็จ', e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <FormField label="หลักฐาน (รูปสลิป)">
      {filename ? (
        <Image source={{ uri: resolveEvidenceUri(filename) }} style={styles.thumb} resizeMode="cover" />
      ) : (
        <Text style={styles.empty}>ยังไม่มีรูปแนบ</Text>
      )}
      <View style={styles.actions}>
        <Button title={filename ? 'เปลี่ยนรูป' : 'แนบรูป'} variant="outline" onPress={attach} />
        {filename ? <Button title="ลบรูป" variant="danger" onPress={() => onChange(null)} /> : null}
      </View>
    </FormField>
  );
}

const styles = StyleSheet.create({
  thumb: { width: '100%', height: 180, borderRadius: radius.md, borderColor: color.cardBorder, borderWidth: 1, marginBottom: space[2] },
  empty: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.sm, marginBottom: space[2] },
  actions: { flexDirection: 'row', gap: space[2] },
});
