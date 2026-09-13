import { useEffect, useMemo, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAppStore } from '../store/useAppStore';
import { buildFifoReport } from '../services/report';
import { renderReportHtml } from '../report/html';
import { ReportExporter, type ReportDestination, type ReportFormat } from '../report/export';
import { reportPlatform } from '../report/platform';
import { allowReportNavigation, reportErrorMessage, reportSnapshotKey } from '../ui/reportState';
import { Screen } from '../ui/components/Screen';
import { Button } from '../ui/components/Button';
import { EmptyState } from '../ui/components/EmptyState';
import { formatMoneyThb, formatSignedThb } from '../ui/format';
import { color, font, fontFamily, radius, space } from '../theme/tokens';

export default function ReportScreen() {
  const db = useAppStore((state) => state.db);
  const dataVersion = useAppStore((state) => state.dataVersion);
  const [symbolId, setSymbolId] = useState<number>();
  const [choosing, setChoosing] = useState(false);
  const [query, setQuery] = useState('');
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ key: string; message: string; error?: boolean } | null>(null);
  const exporter = useMemo(() => new ReportExporter(reportPlatform), []);
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const snapshot = useMemo(() => {
    if (!db) return { report: null, error: null };
    try {
      return { report: buildFifoReport(db, { generatedAt: new Date().toISOString() }), error: null };
    } catch (error) {
      return { report: null, error };
    }
  }, [db, dataVersion]);
  // Filter the already captured report: no extra queries or mixed versions.
  const report = useMemo(() => {
    const all = snapshot.report;
    if (!all || symbolId === undefined) return all;
    const section = all.sections.find((s) => s.symbol.id === symbolId);
    return {
      ...all, symbolId, sections: section ? [section] : [],
      totalOpenCostThb: section?.remainingCostThb ?? all.totalOpenCostThb.times(0),
      totalRealizedGainThb: section?.realizedGainThb ?? all.totalRealizedGainThb.times(0),
    };
  }, [snapshot.report, symbolId]);
  const key = reportSnapshotKey(dataVersion, symbolId);
  const preview = previewKey === key && report !== null && report.sections.length > 0;
  const html = useMemo(() => report ? renderReportHtml(report) : '', [report]);
  const empty = !report || report.sections.length === 0;

  useEffect(() => {
    if (!preview) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setPreviewKey(null); return true; });
    return () => subscription.remove();
  }, [preview]);

  async function exportReport(format: ReportFormat, destination: ReportDestination) {
    if (!report || empty || running.current) return;
    running.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await exporter.run(report, format, destination);
      if (mounted.current && result.status !== 'busy') {
        const message = result.status === 'saved' ? 'บันทึกรายงานแล้ว'
          : result.status === 'cancelled' ? 'ยกเลิกการบันทึกแล้ว' : 'ปิดหน้าต่างแชร์แล้ว';
        setFeedback({ key, message });
      }
    } catch (error) {
      if (mounted.current) setFeedback({ key, message: reportErrorMessage(error), error: true });
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  // All PDF actions meet here; plan 8 can add entitlement checks without gating CSV.
  function pdfAction(action: 'preview' | ReportDestination) {
    if (empty || running.current) return;
    if (action === 'preview') { setPreviewFailed(false); setPreviewKey(key); }
    else void exportReport('pdf', action);
  }

  if (preview) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'ตัวอย่างรายงาน', headerLeft: () => <Pressable accessibilityRole="button" onPress={() => setPreviewKey(null)}><Text style={styles.link}>กลับ</Text></Pressable> }} />
        <Text style={styles.hint}>ตัวอย่างนี้เป็น HTML การแบ่งหน้าและเลขหน้าจะแสดงในไฟล์ PDF</Text>
        {previewFailed ? <View style={styles.previewError}>
          <Text style={styles.error}>เปิดตัวอย่างไม่สำเร็จ</Text>
          <Button title="ลองใหม่" onPress={() => setPreviewFailed(false)} />
        </View> : <WebView
          key={key}
          source={{ html, baseUrl: 'about:blank' }}
          style={styles.webview}
          originWhitelist={['*']}
          onShouldStartLoadWithRequest={(request) => allowReportNavigation(request.url)}
          javaScriptEnabled={false}
          domStorageEnabled={false}
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          mixedContentMode="never"
          setSupportMultipleWindows={false}
          onError={() => setPreviewFailed(true)}
          onRenderProcessGone={() => setPreviewFailed(true)}
          startInLoadingState
          renderLoading={() => <ActivityIndicator color={color.actionPrimary} />}
        />}
      </Screen>
    );
  }

  const choices = snapshot.report?.sections.map((s) => s.symbol) ?? [];
  const selected = symbolId === undefined ? 'ทั้งพอร์ต' : choices.find((s) => s.id === symbolId)?.ticker ?? 'หุ้นที่เลือกไม่มีธุรกรรมแล้ว';
  const matches = choices.filter((s) => s.ticker.includes(query.trim().toUpperCase()));
  return (
    <Screen scroll>
      <Stack.Screen options={{ title: 'รายงาน PDF / CSV', headerLeft: undefined }} />
      <Text style={styles.label}>ข้อมูลในรายงาน</Text>
      <Button title={`${selected} · เลือกหุ้น`} variant="outline" disabled={busy} onPress={() => { setChoosing(!choosing); setQuery(''); }} />
      {choosing && <View style={styles.choices}>
        <TextInput accessibilityLabel="ค้นหาหุ้นในรายงาน" placeholder="ค้นหา ticker" placeholderTextColor={color.textMuted}
          value={query} onChangeText={setQuery} editable={!busy} autoCapitalize="characters" style={styles.input} />
        <ScrollView style={styles.choiceList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {[{ id: undefined, ticker: 'ทั้งพอร์ต' }, ...matches].map((s) => <Pressable
            key={s.id ?? 'all'} accessibilityRole="radio" accessibilityState={{ checked: symbolId === s.id, disabled: busy }}
            disabled={busy} onPress={() => { setSymbolId(s.id); setChoosing(false); setPreviewKey(null); setFeedback(null); }} style={styles.choice}>
            <Text style={[styles.body, symbolId === s.id && styles.link]}>{s.ticker}</Text>
          </Pressable>)}
        </ScrollView>
      </View>}
      <Text style={styles.hint}>รายงานภาษาอังกฤษ ครอบคลุมธุรกรรมทั้งหมดของหุ้นที่เลือก รวมรายการที่ขายหมดแล้ว</Text>
      {snapshot.error ? <View style={styles.previewError}>
        <Text style={styles.error}>อ่านข้อมูลรายงานไม่สำเร็จ</Text>
        <Button title="ลองอ่านข้อมูลใหม่" onPress={() => useAppStore.getState().reload()} />
      </View> : empty ? <EmptyState title="ยังไม่มีธุรกรรมสำหรับรายงาน" hint="เพิ่มรายการซื้อ หรือเลือกทั้งพอร์ตเพื่อดูข้อมูลหุ้นอื่น" />
        : <View style={styles.totals}>
          <Text style={styles.label}>ต้นทุนหุ้นคงเหลือ</Text><Text style={styles.value}>{formatMoneyThb(report!.totalOpenCostThb)}</Text>
          <Text style={styles.label}>กำไร/ขาดทุนที่รับรู้แล้ว</Text>
          <Text style={[styles.value, { color: report!.totalRealizedGainThb.lt(0) ? color.loss : color.gain }]}>{formatSignedThb(report!.totalRealizedGainThb)}</Text>
        </View>}
      <View style={styles.actions}>
        <Button title="ดูตัวอย่าง PDF" disabled={empty || busy} onPress={() => pdfAction('preview')} />
        <Button title="บันทึก PDF" variant="outline" disabled={empty || busy} onPress={() => pdfAction('save')} />
        <Button title="แชร์ PDF" variant="outline" disabled={empty || busy} onPress={() => pdfAction('share')} />
        <Text style={styles.hint}>CSV ส่งออกได้ฟรี ใช้สำหรับอ่านรายงาน ไม่ใช่ไฟล์สำรองข้อมูล</Text>
        <Button title="บันทึก CSV" variant="outline" disabled={empty || busy} onPress={() => { void exportReport('csv', 'save'); }} />
        <Button title="แชร์ CSV" variant="outline" disabled={empty || busy} onPress={() => { void exportReport('csv', 'share'); }} />
      </View>
      {busy && <View style={styles.busy}><ActivityIndicator color={color.actionPrimary} /><Text style={styles.body}>กำลังเตรียมรายงาน…</Text></View>}
      {feedback?.key === key && <Text accessibilityLiveRegion="polite" style={feedback.error ? styles.error : styles.hint}>{feedback.message}</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { color: color.textBody, fontFamily: fontFamily.sansRegular, fontSize: font.size.md },
  label: { color: color.textMuted, fontFamily: fontFamily.sansMedium, fontSize: font.size.sm, marginBottom: space[2] },
  hint: { color: color.textMuted, fontFamily: fontFamily.sansRegular, fontSize: font.size.sm, marginVertical: space[3] },
  link: { color: color.actionPrimary, fontFamily: fontFamily.sansSemibold, fontSize: font.size.md },
  value: { color: color.textBody, fontFamily: fontFamily.monoSemibold, fontSize: font.size.lg, marginBottom: space[3] },
  totals: { backgroundColor: color.cardBg, borderColor: color.cardBorder, borderWidth: 1, borderRadius: radius.lg, padding: space[3], marginBottom: space[3] },
  actions: { gap: space[2] },
  choices: { padding: space[2], borderColor: color.cardBorder, borderWidth: 1, borderRadius: radius.md, marginTop: space[2] },
  choiceList: { maxHeight: 220 },
  choice: { padding: space[3] },
  input: { backgroundColor: color.inputBg, color: color.textBody, padding: space[2], fontFamily: fontFamily.monoRegular, borderRadius: radius.md },
  busy: { flexDirection: 'row', gap: space[2], paddingVertical: space[3] },
  error: { color: color.loss, fontFamily: fontFamily.sansRegular, fontSize: font.size.sm, marginVertical: space[3] },
  previewError: { gap: space[3], padding: space[3] },
  webview: { flex: 1, backgroundColor: '#ffffff' },
});
