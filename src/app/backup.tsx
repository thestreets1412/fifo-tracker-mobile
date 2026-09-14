import { useEffect, useRef, useState } from 'react';
import { Stack, useNavigation } from 'expo-router';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { getRandomValues } from 'expo-crypto';
import { backupPlatform, listAutomaticBackups, pickBackup, readAutomaticBackup, shareBackup } from '../backup/platform';
import { BackupController } from '../backup/controller';
import { assessPassword, generatePassphrase } from '../backup/password';
import { rememberedPassword, rememberPassword } from '../backup/secrets';
import type { ImportReview } from '../backup/archive';
import { backupErrorMessage, backupFieldLabels, backupDifferenceValue } from '../ui/backupState';
import { useAppStore } from '../store/useAppStore';
import { Screen } from '../ui/components/Screen';
import { Button } from '../ui/components/Button';
import { FormField, TextInput } from '../ui/components/Field';
import { color, font, fontFamily, radius, space } from '../theme/tokens';

const controller = new BackupController(backupPlatform);
const strength = ['ต่ำมาก', 'ต่ำ', 'ปานกลาง', 'ดี', 'ดีมาก'];

export default function BackupScreen() {
  const db = useAppStore(s => s.db); const reload = useAppStore(s => s.reload);
  const navigation = useNavigation();
  const [password, setPassword] = useState(''); const [visible, setVisible] = useState(false);
  const [importPassword, setImportPassword] = useState('');
  const [selected, setSelected] = useState<Uint8Array | null>(null);
  const [review, setReview] = useState<ImportReview | null>(null);
  const [side, setSide] = useState<'json' | 'csv'>('json');
  const [busy, setBusy] = useState(''); const running = useRef(false); const mounted = useRef(true);
  const [feedback, setFeedback] = useState(''); const [error, setError] = useState(false);
  const [automatic, setAutomatic] = useState<{ name: string; uri: string }[]>([]);
  const [shown, setShown] = useState(30); const [autoShown, setAutoShown] = useState(5);
  const assessment = assessPassword(password);
  const refresh = () => {
    try { setAutomatic(listAutomaticBackups()); }
    catch { setError(true); setFeedback('อ่านรายการสำรองอัตโนมัติไม่ได้ กรุณาตรวจพื้นที่ว่างแล้วเปิดหน้านี้ใหม่'); }
  };

  useEffect(() => {
    mounted.current = true;
    refresh();
    void rememberedPassword().then(value => { if (mounted.current && value) setPassword(value); }).catch(() => {});
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => navigation.addListener('beforeRemove', e => {
    if (running.current) e.preventDefault();
  }), [navigation]);

  async function run(label: string, task: () => Promise<string>) {
    if (running.current) return;
    running.current = true; setBusy(label); setFeedback(''); setError(false);
    try { const result = await task(); if (mounted.current) setFeedback(result); }
    catch (e) { if (mounted.current) { setFeedback(backupErrorMessage(e)); setError(true); } }
    finally { running.current = false; if (mounted.current) { setBusy(''); refresh(); } }
  }
  function select(read: () => Promise<Uint8Array | null>) {
    void run('กำลังอ่านไฟล์', async () => {
      setSelected(null); setReview(null); setImportPassword(''); setSide('json'); setShown(30);
      const bytes = await read(); setSelected(bytes); return bytes ? 'เลือกไฟล์แล้ว ใส่รหัสผ่านของไฟล์นี้เพื่อตรวจสอบ' : 'ยกเลิกการเลือกไฟล์แล้ว';
    });
  }
  function restore() {
    if (!db || !review || running.current || assessment.error) return;
    const currentReview = review;
    Alert.alert('แทนที่ข้อมูลทั้งหมด?', 'ข้อมูลหุ้น รายการซื้อขาย และรูปหลักฐานปัจจุบันจะถูกแทนที่ แอปจะเก็บไฟล์ auto-before-restore ที่เข้ารหัสด้วยรหัสผ่านสำรองด้านบนก่อนเริ่ม หากสำรองไม่สำเร็จจะไม่แทนที่ข้อมูล', [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'สำรองเดิมแล้วแทนที่', style: 'destructive', onPress: () => void run('กำลังสำรองข้อมูลเดิมและกู้คืน', async () => {
        await controller.restore(db, currentReview, side, password, true);
        reload(); setReview(null); setSelected(null); setImportPassword('');
        await rememberPassword(password).catch(() => {});
        return 'กู้คืนข้อมูลแล้ว ไฟล์สำรองก่อนกู้คืนอยู่ในรายการด้านล่าง ควรแชร์เก็บไว้นอกแอป';
      }) },
    ]);
  }

  return <Screen scroll>
    <Stack.Screen options={{ title: 'สำรอง / กู้คืนข้อมูล', gestureEnabled: !busy, headerBackVisible: !busy }} />
    <Text style={styles.hint}>ไฟล์ ZIP เข้ารหัส AES-256 รวมรายการซื้อขายและรูปหลักฐาน ใช้งานออฟไลน์ได้ รองรับไม่เกิน 64 MiB และ 5,000 ไฟล์</Text>
    <View style={styles.card}>
      <Text style={styles.title}>สำรองข้อมูล</Text>
      <FormField label="รหัสผ่านสำหรับไฟล์สำรองใหม่" helpText="แยกจาก PIN เก็บรหัสผ่านไว้ให้ดี แอปไม่สามารถกู้รหัสผ่านของไฟล์ได้">
        <TextInput value={password} onChangeText={setPassword} editable={!busy} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} maxLength={128} />
      </FormField>
      <Text style={styles.hint}>ความแข็งแรง: {strength[assessment.score]}{assessment.error ? ` — ${assessment.error}` : ''}</Text>
      <Button title={visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} variant="outline" disabled={!!busy} onPress={() => setVisible(!visible)} />
      <Button title="สร้างรหัสผ่าน 5 คำ" variant="outline" disabled={!!busy} onPress={() => void run('กำลังสร้างรหัสผ่าน', async () => { setPassword(generatePassphrase(getRandomValues)); setVisible(true); return 'สร้างรหัสผ่านแล้ว กรุณาเก็บไว้ก่อนส่งออก'; })} />
      <Button title="คัดลอกรหัสผ่าน" variant="outline" disabled={!!busy || !password} onPress={() => void run('กำลังคัดลอก', async () => { await Clipboard.setStringAsync(password); return 'คัดลอกรหัสผ่านแล้ว'; })} />
      <Button title="สร้างและแชร์ไฟล์สำรอง" disabled={!!busy || !db || !!assessment.error} onPress={() => void run('กำลังสร้างไฟล์สำรอง', async () => {
        await controller.export(db!, password); await rememberPassword(password).catch(() => {});
        return 'ปิดหน้าต่างแชร์แล้ว กรุณาตรวจว่าไฟล์ถูกเก็บในปลายทางที่เลือก';
      })} />
    </View>
    <View style={styles.card}>
      <Text style={styles.title}>กู้คืนข้อมูล</Text>
      <Button title="เลือกไฟล์ ZIP" variant="outline" disabled={!!busy} onPress={() => select(pickBackup)} />
      {selected && <>
        <FormField label="รหัสผ่านของไฟล์ที่เลือก">
          <TextInput value={importPassword} onChangeText={v => { setImportPassword(v); setReview(null); }} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={128} />
        </FormField>
        <Button title="ตรวจสอบไฟล์ก่อนกู้คืน" disabled={!!busy || !importPassword} onPress={() => void run('กำลังตรวจสอบไฟล์', async () => {
          setReview(null); const result = await controller.inspect(selected, importPassword); setReview(result); setSide('json');
          return result.csvError || (result.differences.length ? 'พบข้อมูล CSV ที่เปลี่ยนแปลง กรุณาเลือกชุดข้อมูล' : 'ตรวจไฟล์แล้ว ไม่พบความแตกต่างของค่าข้อมูลระหว่าง CSV กับ JSON');
        })} />
      </>}
      {review && <>
        <Text style={styles.hint}>สร้างเมื่อ {review.exportedAt}</Text>
        <Text style={styles.body}>{review.json.symbols.length} หุ้น · ซื้อ {review.json.lots.length} · ขาย {review.json.sales.length}</Text>
        {review.csvError && <Text style={styles.warning}>{review.csvError}</Text>}
        {review.differences.length > 0 && <>
          <Text style={styles.warning}>แตกต่าง {review.differences.length} ค่า เลือกใช้ทั้งชุดจาก JSON หรือ CSV</Text>
          {review.differences.slice(0, shown).map((d, i) => <Text key={i} selectable style={styles.diff}>{d.table === 'lots' ? 'ซื้อ' : 'ขาย'} #{d.id} · {backupFieldLabels[d.field] ?? d.field}{'\n'}JSON: {backupDifferenceValue(d.field, d.json)}{'\n'}CSV: {backupDifferenceValue(d.field, d.csv)}</Text>)}
          {shown < review.differences.length && <Button title="ดูความแตกต่างเพิ่มเติม" variant="outline" disabled={!!busy} onPress={() => setShown(shown + 30)} />}
          <Button title={`${side === 'json' ? 'เลือกแล้ว: ' : ''}ใช้ JSON ต้นฉบับทั้งชุด`} variant="outline" disabled={!!busy} onPress={() => setSide('json')} />
          <Button title={`${side === 'csv' ? 'เลือกแล้ว: ' : ''}ใช้ CSV ที่แก้ไขทั้งชุด`} variant="outline" disabled={!!busy} onPress={() => setSide('csv')} />
        </>}
        {review.csvError && <Text style={styles.hint}>การกู้คืนครั้งนี้จะใช้ JSON ต้นฉบับเท่านั้น</Text>}
        <Text style={styles.hint}>ใช้รหัสผ่านสำรองใหม่ด้านบนเข้ารหัสข้อมูลปัจจุบันก่อนแทนที่</Text>
        <Button title="กู้คืนและแทนที่ข้อมูล" variant="danger" disabled={!!busy || !!assessment.error || !db} onPress={restore} />
      </>}
    </View>
    {busy ? <View style={styles.status}><ActivityIndicator color={color.actionPrimary} /><Text style={styles.body}>{busy}</Text></View> : null}
    {feedback ? <Text accessibilityLiveRegion="polite" style={error ? styles.warning : styles.body}>{feedback}</Text> : null}
    {automatic.length > 0 && <View style={styles.card}>
      <Text style={styles.title}>ไฟล์สำรองก่อนกู้คืน</Text>
      <Text style={styles.hint}>เก็บในเครื่องจนกว่าจะลบแอป ควรแชร์สำเนาไปยังที่เก็บอื่น</Text>
      {automatic.slice(0, autoShown).map(file => <View key={file.uri} style={styles.status}>
        <Text style={styles.hint}>{file.name}</Text>
        <Button title="แชร์สำเนานี้" variant="outline" disabled={!!busy} onPress={() => void run('กำลังเปิดหน้าต่างแชร์', async () => { await shareBackup(file.uri); return 'ปิดหน้าต่างแชร์แล้ว'; })} />
        <Button title="เลือกสำเนานี้เพื่อกู้คืน" variant="outline" disabled={!!busy} onPress={() => select(() => readAutomaticBackup(file.uri))} />
      </View>)}
      {autoShown < automatic.length && <Button title="ดูสำเนาเพิ่มเติม" variant="outline" disabled={!!busy} onPress={() => setAutoShown(autoShown + 5)} />}
    </View>}
  </Screen>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: color.cardBg, borderColor: color.cardBorder, borderWidth: 1, borderRadius: radius.lg, padding: space[3], marginVertical: space[3], gap: space[2] },
  title: { color: color.textBody, fontFamily: fontFamily.sansSemibold, fontSize: font.size.lg },
  body: { color: color.textBody, fontFamily: fontFamily.sansRegular, fontSize: font.size.md },
  hint: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.sm },
  warning: { color: color.warning, fontFamily: fontFamily.sansRegular, fontSize: font.size.sm },
  diff: { color: color.textBody, fontFamily: fontFamily.monoRegular, fontSize: font.size.sm, paddingVertical: space[2] },
  status: { gap: space[2], marginVertical: space[2] },
});
