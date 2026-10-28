// Client report highlights and "vs. before" text, worked out from the posts.
const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', SOCIAL_PROFILE_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64') });
const { reportHighlights, changeText } = require(ROOT + '/api/_lib/reports.js');
const row = (platform, engagements, publishedAt, media = null, text = '') => ({ platform, text, media, publishedAt, metrics: { engagements } });
const report = { rows: [
  row('instagram', 300, '2026-10-06T14:00:00Z', 'https://x/v.mp4', 'Big one'), row('instagram', 120, '2026-10-13T14:00:00Z', 'https://x/v2.mp4'),
  row('facebook', 20, '2026-10-08T14:00:00Z', 'https://x/a.jpg'), row('facebook', 20, '2026-10-09T14:00:00Z', 'https://x/b.jpg'),
  row('facebook', 20, '2026-10-20T14:00:00Z'), row('facebook', 20, '2026-10-27T14:00:00Z')
] };
const lines = reportHighlights(report, { totals: { engagements: 400 } });
assert.deepEqual(lines, [
  'Engagement was up 25% on the period before (500, up from 400).',
  'Instagram drove 84% of engagement from 33% of posts.',
  'The top post (“Big one”) on Instagram earned 300 engagements, 3.6× the average post.',
  'Videos averaged 10.5× the engagement of photo posts.',
  'Posts on Tuesdays did best, averaging 115 engagements each.'
]);
assert.deepEqual(reportHighlights({ rows: [] }), [], 'nothing to say without posts');
assert.equal(reportHighlights(report, { totals: { engagements: 1000 } })[0], 'Engagement was down 50% on the period before (500, from 1,000).');
assert.equal(changeText(124, 100), '+24% vs. before');
assert.equal(changeText(5000, 100), 'up from 100');
assert.equal(changeText(4.2, 3.5, { points: true }), '+0.7 pts vs. before');
assert.equal(changeText(5, 0), '');
console.log('report tests passed');
