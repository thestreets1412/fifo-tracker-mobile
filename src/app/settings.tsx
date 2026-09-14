import { useState, useSyncExternalStore } from 'react';
import { Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { lockController } from '../lock/runtime';
import { TIMEOUTS } from '../lock/credentials';
import { Screen } from '../ui/components/Screen';
import { Button } from '../ui/components/Button';
import { FormField, TextInput } from '../ui/components/Field';
import { color, font, fontFamily, radius, space } from '../theme/tokens';

const labels: Record<number, string> = { 0: 'ทันที', 60000: '1 นาที', 300000: '5 นาที', 900000: '15 นาที' };
function PinInput({ label, value, setValue, disabled }: { label: string; value: string; setValue: (value: string) => void; disabled: boolean }) {
  return <FormField label={label}><TextInput value={value} onChangeText={v => setValue(v.replace(/\D/g, '').slice(0, 6))} editable={!disabled} secureTextEntry keyboardType="number-pad" inputMode="numeric" maxLength={6} /></FormField>;
}
export default function SettingsScreen() {
  const state = useSyncExternalStore(lockController.subscribe, lockController.snapshot, lockController.snapshot);
  const [current, setCurrent] = useState(''); const [next, setNext] = useState(''); const [confirm, setConfirm] = useState('');
  const [timeout, setTimeoutValue] = useState(state.timeout); const [biometrics, setBiometrics] = useState(state.biometrics);
  const [questions, setQuestions] = useState(['', '', '']); const [answers, setAnswers] = useState(['', '', '']); const [recovery, setRecovery] = useState(false);
  const [message, setMessage] = useState('');
  const disabled = state.busy || !lockController.isUnlocked();
  async function save() {
    setMessage('');
    try {
      await lockController.updateSettings(current, { timeout, biometrics, newPin: next || undefined, confirmation: confirm || undefined, questions: recovery ? questions : undefined, answers: recovery ? answers : undefined });
      setCurrent(''); setNext(''); setConfirm(''); setRecovery(false); setQuestions(['', '', '']); setAnswers(['', '', '']); setMessage('บันทึกการตั้งค่าแล้ว');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ'); }
  }
  return <Screen scroll>
    <Stack.Screen options={{ title: 'ตั้งค่าและล็อก' }} />
    <View style={styles.card}><Text style={styles.title}>ล็อกอัตโนมัติ</Text><Text style={styles.help}>แอปจะขอปลดล็อกเมื่อกลับจากพื้นหลังเกินเวลานี้</Text>
      {TIMEOUTS.map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: timeout === value }} disabled={disabled} onPress={() => setTimeoutValue(value)} style={[styles.option, timeout === value && styles.selected]}><Text style={styles.optionText}>{labels[value]}</Text></Pressable>)}
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: biometrics }} disabled={disabled} onPress={() => setBiometrics(!biometrics)} style={[styles.option, biometrics && styles.selected]}><Text style={styles.optionText}>{biometrics ? '✓ ' : ''}ใช้ลายนิ้วมือหรือใบหน้า</Text></Pressable>
      <Text style={styles.help}>ใช้เฉพาะ biometric ระดับ strong หากเครื่องไม่รองรับจะบันทึกไม่ได้</Text>
    </View>
    <View style={styles.card}><Text style={styles.title}>ยืนยันการเปลี่ยนแปลง</Text><PinInput label="PIN ปัจจุบัน" value={current} setValue={setCurrent} disabled={disabled} />
      <Text style={styles.help}>เว้น PIN ใหม่ว่างไว้หากไม่ต้องการเปลี่ยน</Text><PinInput label="PIN ใหม่" value={next} setValue={setNext} disabled={disabled} /><PinInput label="ยืนยัน PIN ใหม่" value={confirm} setValue={setConfirm} disabled={disabled} />
    </View>
    <View style={styles.card}><Text style={styles.title}>คำถามกู้คืน</Text><Button title={recovery ? 'ไม่เปลี่ยนคำถาม' : 'เปลี่ยนคำถามกู้คืน'} variant="outline" disabled={disabled} onPress={() => setRecovery(!recovery)} />
      {recovery ? <>{[0, 1, 2].map(i => <View key={i}><FormField label={`คำถาม ${i + 1}`}><TextInput value={questions[i]} onChangeText={v => setQuestions(q => q.map((x, index) => index === i ? v : x))} editable={!disabled} maxLength={100} /></FormField><FormField label={`คำตอบ ${i + 1}`}><TextInput value={answers[i]} onChangeText={v => setAnswers(a => a.map((x, index) => index === i ? v : x))} editable={!disabled} secureTextEntry maxLength={256} /></FormField></View>)}</> : <Text style={styles.help}>ต้องใช้ PIN ปัจจุบันและแทนที่ทั้ง 3 ข้อพร้อมกัน</Text>}
    </View>
    <Button title={state.busy ? 'กำลังบันทึก' : 'บันทึกการตั้งค่า'} disabled={disabled || current.length !== 6} onPress={() => void save()} />
    {message ? <Text accessibilityLiveRegion="polite" style={message === 'บันทึกการตั้งค่าแล้ว' ? styles.success : styles.error}>{message}</Text> : null}
  </Screen>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: color.cardBg, borderColor: color.cardBorder, borderWidth: 1, borderRadius: radius.lg, padding: space[3], marginBottom: space[3], gap: space[2] }, title: { color: color.textBody, fontFamily: fontFamily.sansSemibold, fontSize: font.size.lg },
  help: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.sm }, option: { borderColor: color.cardBorder, borderWidth: 1, borderRadius: radius.md, padding: space[2] }, selected: { borderColor: color.actionPrimary, backgroundColor: color.hover }, optionText: { color: color.textBody, fontFamily: fontFamily.sansMedium, fontSize: font.size.md },
  success: { color: color.success, fontFamily: fontFamily.sansRegular, fontSize: font.size.sm, marginTop: space[2] }, error: { color: color.loss, fontFamily: fontFamily.sansRegular, fontSize: font.size.sm, marginTop: space[2] },
});
