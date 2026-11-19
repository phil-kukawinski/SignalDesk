// Report engagement rate counts only posts that report an audience, on both sides of the division,
// and the report email draws its logo instead of loading an image mail apps may hold back.
const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc' });
const { reportTotals, finishMetrics } = require(ROOT + '/api/_lib/reports.js');
const row = (metrics) => ({ metrics: finishMetrics(metrics) });

// A post with engagements but no reach doesn't inflate the rate: 10 engagements over 200 reached = 5%.
assert.strictEqual(reportTotals([row({ engagements: 10, reach: 200 }), row({ engagements: 40 })]).engagementRate, 5);
// Reach where it's reported, views otherwise, per post: (10 + 6) / (200 + 300) = 3.2%.
assert.strictEqual(reportTotals([row({ engagements: 10, reach: 200 }), row({ engagements: 6, views: 300 })]).engagementRate, 3.2);
// No audience anywhere: no rate.
assert.strictEqual(reportTotals([row({ engagements: 5 })]).engagementRate, null);

const notify = require('node:fs').readFileSync(ROOT + '/api/_lib/notify.js', 'utf8');
assert.ok(!/icon-192\.png/.test(notify), 'the email logo is drawn, not loaded');
assert.match(notify, /more engagements than people reached/, 'rates of 100% or more are put in words');
console.log('report-rate: ok');
