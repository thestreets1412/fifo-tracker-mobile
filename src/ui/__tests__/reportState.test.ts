import { allowReportNavigation, reportSnapshotKey, reportErrorMessage } from '../reportState';

test('selection or dataVersion invalidates preview identity', () => {
  expect(reportSnapshotKey(1)).not.toBe(reportSnapshotKey(2));
  expect(reportSnapshotKey(1, 5)).not.toBe(reportSnapshotKey(1, 6));
  expect(reportSnapshotKey(1, 5)).toBe(reportSnapshotKey(1, 5));
});

test.each(['https://example.com', 'file:///secret', 'intent://open', 'javascript:alert(1)', 'data:text/html,bad', 'about:blank.evil'])('blocks external preview navigation %s', (url) => {
  expect(allowReportNavigation(url)).toBe(false);
});

test('allows only the static document and its local anchors', () => {
  expect(allowReportNavigation('about:blank')).toBe(true);
  expect(allowReportNavigation('about:blank#summary')).toBe(true);
});

test('maps share unavailability to actionable Thai copy without exposing raw errors', () => {
  expect(reportErrorMessage(new Error('REPORT_SHARING_UNAVAILABLE'))).toContain('บันทึก');
  expect(reportErrorMessage(new Error('private data'))).not.toContain('private data');
});
