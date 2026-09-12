import { generateEvidenceFilename } from '../evidenceName';

test('preserves and lower-cases the source extension', () => {
  expect(generateEvidenceFilename('IMG_0001.PNG')).toMatch(/\.png$/);
  expect(generateEvidenceFilename('file:///tmp/a/b/photo.JPEG')).toMatch(/\.jpeg$/);
});

test('defaults to jpg when there is no extension', () => {
  expect(generateEvidenceFilename('noextension')).toMatch(/\.jpg$/);
});

test('output is a bare filename with no path separators', () => {
  for (const src of ['file:///a/b/c.jpg', 'C:\\pics\\x.png', 'plain.gif']) {
    const name = generateEvidenceFilename(src);
    expect(name).not.toMatch(/[/\\:]/); // the exact chars ledger.validateEvidenceFile rejects
  }
});

test('successive calls differ', () => {
  expect(generateEvidenceFilename('a.jpg')).not.toBe(generateEvidenceFilename('a.jpg'));
});
