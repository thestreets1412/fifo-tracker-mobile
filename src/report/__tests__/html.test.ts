import { renderReportHtml } from '../html';
import { fixture } from './fixture';

test('escapes untrusted text and uses only local static markup', () => {
  const f = fixture('<script>"&</script>'); f.buy('1', '1');
  const html = renderReportHtml(f.report());
  expect(html).not.toMatch(/<script|<img|src=|href=|@import|url\(/i);
  expect(html).toContain('&lt;SCRIPT&gt;&quot;&amp;&lt;/SCRIPT&gt;');
  expect(html).toContain("default-src 'none'");
});

test('cover, ticker and summary break correctly; sale allocations immediately follow sale', () => {
  const f = fixture(); f.buy('100', '1', '2026-01-01'); f.buy('110', '1', '2026-01-02'); f.sell('120', '2');
  const html = renderReportHtml(f.report());
  expect(html.match(/<section /g)).toHaveLength(3);
  expect(html).toContain('page-break-after: always');
  expect(html).toContain('.page-section:last-child { page-break-after: auto');
  expect(html).toContain('display: table-header-group');
  expect(html).toContain('size: A4 portrait; margin: 18mm');
  expect(html.indexOf('class="sale"')).toBeLessThan(html.indexOf('from lot<br><span class="date">2026-01-01'));
  expect(html.indexOf('from lot<br><span class="date">2026-01-01')).toBeLessThan(html.indexOf('from lot<br><span class="date">2026-01-02'));
  expect(html).toContain('Fully Consumed');
});

test('buy-only section has meaningful no-sales text and long content is never truncated', () => {
  const f = fixture(); f.buy('100', '1');
  const report = f.report();
  const section = report.sections[0]!;
  const expanded = { ...report, sections: [{ ...section, lots: Array.from({ length: 300 }, () => section.lots[0]!) }] };
  const html = renderReportHtml(expanded);
  expect(html).toContain('No sales.');
  expect(html.match(/2026-01-01/g)).toHaveLength(300);
  expect(html).not.toContain('overflow: hidden');
});
