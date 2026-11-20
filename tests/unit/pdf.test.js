// The client report PDF is a well-formed file: every object sits where the cross-reference table says,
// text is escaped and wrapped, and the numbers from the report appear in it.
const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const sandbox = { Blob, console, clientBrand: (client) => client.brand || {}, networkColor: () => '#2563eb', platformLabel: (p) => ({ instagram: 'Instagram', facebook: 'Facebook' }[p] || p) };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(ROOT + '/js/pdf.js', 'utf8') + ';this.reportPdfBlob=reportPdfBlob;this.pdfWrap=pdfWrap;this.pdfString=pdfString;', sandbox);
(async () => {
  assert.strictEqual(sandbox.pdfString('a (b) \\ “c” é ☃'), 'a \\(b\\) \\\\ \\223c\\224 \\351 ?');
  assert.strictEqual(JSON.stringify(sandbox.pdfWrap('one two three four five six', 60, 10, false)), JSON.stringify(['one two', 'three four', 'five six']));
  const rows = Array.from({ length: 30 }, (_, i) => ({ platform: i % 2 ? 'instagram' : 'facebook', text: `Post ${i}: a caption long enough to wrap onto a second line in the table of posts for the report`, publishedAt: new Date(2026, 9, 1 + i).toISOString(), metrics: { views: 1000 + i, engagements: 50 + i } }));
  const data = { report: { postCount: 30, totals: { views: 31234, reach: 20000, engagements: 1935, engagementRate: 6.2, likes: 1500, comments: 200, shares: 100, clicks: 135 }, rows }, previous: { postCount: 20, totals: { views: 20000, reach: 18000, engagements: 1500, engagementRate: 5, likes: 1200, comments: 150, shares: 80, clicks: 100 } }, highlights: ['Instagram led with 60% of engagements.', 'Best day: Tuesday.'], scheduled: 4 };
  const blob = sandbox.reportPdfBlob({ client: { name: 'Revere Rum (“RR”)', brand: { colors: ['#7a2e1f'] } }, period: { label: 'October 2026' }, campaign: 'Fall launch', data });
  const text = Buffer.from(await blob.arrayBuffer()).toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4') && text.trimEnd().endsWith('%%EOF'));
  const xref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.strictEqual(text.slice(xref, xref + 4), 'xref');
  const entries = text.slice(xref).split('\n').slice(3).filter((line) => / 00000 n $/.test(line)).map((line) => Number(line.slice(0, 10)));
  entries.forEach((offset, index) => assert.strictEqual(text.slice(offset, offset + `${index + 1} 0 obj`.length), `${index + 1} 0 obj`, `object ${index + 1}`));
  for (const match of text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) assert.strictEqual(text.slice(match.index + match[0].length + Number(match[1]), match.index + match[0].length + Number(match[1]) + 10), '\nendstream', 'stream length');
  const pages = Number(text.match(/\/Count (\d+)/)[1]);
  assert.ok(pages >= 2, 'a long campaign spills onto more pages');
  assert.match(text, /\(Revere Rum \\\(\\223RR\\224\\\) campaign report\)/);
  assert.match(text, /\(31,234\)/);
  assert.match(text, /\(Up 56\.2% vs\. before\)/);
  assert.match(text, /\(6\.2%\)/);
  assert.match(text, new RegExp(`Page ${pages} of ${pages}`));
  console.log('pdf: ok');
})().catch((error) => { console.error(error); process.exit(1); });
