import { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import { Button } from '../ui/components/Button';
import { FormField, TextInput } from '../ui/components/Field';
import { color, font, fontFamily, radius, space } from '../theme/tokens';
import { lockController, startLockRuntime } from './runtime';

function useLock() {
  return useSyncExternalStore(lockController.subscribe, lockController.snapshot, lockController.snapshot);
}
function remaining(until: number, clock: number) {
  const seconds = Math.max(0, Math.ceil((until - clock) / 1000));
  return seconds >= 3600 ? `${Math.ceil(seconds / 3600)} ชั่วโมง` : `${Math.ceil(seconds / 60)} นาที ${seconds % 60} วินาที`;
}
function PinInput({ value, onChange, disabled, label }: { value: string; onChange: (value: string) => void; disabled: boolean; label: string }) {
  return <FormField label={label}><TextInput value={value} onChangeText={v => onChange(v.replace(/\D/g, '').slice(0, 6))} editable={!disabled} keyboardType="number-pad" inputMode="numeric" secureTextEntry maxLength={6} style={styles.pin} /></FormField>;
}
export function LockGate({ children }: { children: React.ReactNode }) {
  const state = useLock();
  const [pin, setPin] = useState(''); const [confirm, setConfirm] = useState('');
  const [questions, setQuestions] = useState(['', '', '']); const [answers, setAnswers] = useState(['', '', '']);
  const [recovering, setRecovering] = useState(false); const [message, setMessage] = useState('');
  useEffect(() => {
    const stop = startLockRuntime();
    void ScreenCapture.preventScreenCaptureAsync('fifo-lock').catch(() => {});
    return () => { stop(); void ScreenCapture.allowScreenCaptureAsync('fifo-lock').catch(() => {}); };
  }, []);
  async function run(task: () => Promise<boolean | void>) {
    setMessage('');
    try { const result = await task(); if (result === false) setMessage('ข้อมูลที่กรอกไม่ถูกต้อง'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'ทำรายการไม่สำเร็จ'); }
  }
  if (state.mode === 'unlocked') return <>{children}</>;
  if (state.mode === 'loading') return <View style={styles.center}><ActivityIndicator color={color.actionPrimary} /><Text style={styles.text}>กำลังตรวจสอบการล็อก</Text></View>;
  if (state.mode === 'error') return <View style={styles.center}><Text style={styles.error}>{state.error}</Text><Button title="ลองใหม่" onPress={() => void run(() => lockController.initialize())} /></View>;
  const blocked = state.pinUntil > state.clock || (recovering && state.recoveryUntil > state.clock);
  const disabled = state.busy || blocked;
  const header = state.mode === 'setup' ? 'ตั้งค่าล็อกแอป' : recovering ? 'กู้คืน PIN' : 'ปลดล็อกแอป';
  return <View style={styles.safe}><ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
    <View style={styles.card}><Text style={styles.title}>{header}</Text>
      {state.mode === 'setup' && <>
        <Text style={styles.help}>ตั้ง PIN 6 หลัก และคำถามของตัวเอง 3 ข้อ คำตอบจะเก็บเป็นแฮชเท่านั้น</Text>
        <PinInput label="PIN ใหม่" value={pin} onChange={setPin} disabled={disabled} />
        <PinInput label="ยืนยัน PIN" value={confirm} onChange={setConfirm} disabled={disabled} />
        <Text style={styles.warning}>ผู้ที่ตอบคำถามทั้งสามข้อได้อาจเข้าแอปได้ เลือกคำถามที่คนใกล้ตัวเดายาก</Text>
        {[0, 1, 2].map(i => <View key={i}><FormField label={`คำถาม ${i + 1}`}><TextInput value={questions[i]} onChangeText={v => setQuestions(q => q.map((x, index) => index === i ? v : x))} editable={!disabled} maxLength={100} /></FormField><FormField label={`คำตอบ ${i + 1}`}><TextInput value={answers[i]} onChangeText={v => setAnswers(a => a.map((x, index) => index === i ? v : x))} editable={!disabled} secureTextEntry maxLength={256} /></FormField></View>)}
        <Button title={state.busy ? 'กำลังตั้งค่า' : 'บันทึก PIN'} disabled={disabled} onPress={() => void run(() => lockController.setup(pin, confirm, questions, answers))} />
      </>}
      {state.mode === 'locked' && !recovering && <>
        <Text style={styles.help}>กรอก PIN 6 หลักเพื่อดูข้อมูลพอร์ต</Text>
        {blocked ? <Text style={styles.warning}>กรอกใหม่ได้ใน {remaining(state.pinUntil, state.clock)}</Text> : <PinInput label="PIN" value={pin} onChange={setPin} disabled={disabled} />}
        <Button title={state.busy ? 'กำลังตรวจสอบ' : 'ปลดล็อกด้วย PIN'} disabled={disabled || pin.length !== 6} onPress={() => void run(() => lockController.unlockPin(pin).then(ok => { if (ok) setPin(''); return ok; }))} />
        {state.biometrics && <Button title="ใช้ลายนิ้วมือหรือใบหน้า" variant="outline" disabled={disabled} onPress={() => void run(() => lockController.unlockBiometric())} />}
        <Pressable accessibilityRole="button" disabled={state.busy} onPress={() => { setRecovering(true); setPin(''); setConfirm(''); setMessage(''); }}><Text style={styles.link}>ลืม PIN</Text></Pressable>
      </>}
      {state.mode === 'locked' && recovering && <>
        <Text style={styles.help}>ตอบคำถามให้ครบ แล้วกำหนด PIN ใหม่</Text>
        {blocked ? <Text style={styles.warning}>ตอบใหม่ได้ใน {remaining(state.recoveryUntil, state.clock)}</Text> : <>{state.questions.map((q, i) => <FormField key={q} label={q}><TextInput value={answers[i]} onChangeText={v => setAnswers(a => a.map((x, index) => index === i ? v : x))} editable={!disabled} secureTextEntry maxLength={256} /></FormField>)}<PinInput label="PIN ใหม่" value={pin} onChange={setPin} disabled={disabled} /><PinInput label="ยืนยัน PIN ใหม่" value={confirm} onChange={setConfirm} disabled={disabled} /></>}
        <Button title={state.busy ? 'กำลังตรวจสอบ' : 'ตั้ง PIN ใหม่'} disabled={disabled || pin.length !== 6 || confirm.length !== 6} onPress={() => void run(() => lockController.recover(answers, pin, confirm).then(ok => { if (ok) { setPin(''); setConfirm(''); } return ok; }))} />
        <Pressable accessibilityRole="button" disabled={state.busy} onPress={() => { setRecovering(false); setMessage(''); }}><Text style={styles.link}>กลับไปกรอก PIN</Text></Pressable>
      </>}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.error}>{message}</Text> : null}
    </View>
  </ScrollView></View>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.pageBg }, scroll: { flexGrow: 1, justifyContent: 'center', padding: space[3] },
  center: { flex: 1, gap: space[3], backgroundColor: color.pageBg, alignItems: 'center', justifyContent: 'center', padding: space[4] },
  card: { backgroundColor: color.cardBg, borderColor: color.cardBorder, borderWidth: 1, borderRadius: radius.lg, padding: space[3], gap: space[2] },
  title: { color: color.textBody, fontFamily: fontFamily.sansSemibold, fontSize: font.size.lg }, text: { color: color.textBody, fontFamily: fontFamily.sansRegular, fontSize: font.size.md },
  help: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.sm }, warning: { color: color.warning, fontFamily: fontFamily.sansRegular, fontSize: font.size.sm }, error: { color: color.loss, fontFamily: fontFamily.sansRegular, fontSize: font.size.sm },
  link: { color: color.actionPrimary, fontFamily: fontFamily.sansMedium, fontSize: font.size.sm, textAlign: 'center', padding: space[2] }, pin: { fontSize: font.size.lg, letterSpacing: 10, textAlign: 'center' },
});
