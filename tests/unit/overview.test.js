// Command Center numbers for one client: every query is narrowed to that client.
const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', SOCIAL_PROFILE_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64') });
const urls = [];
const post = (id, daysAgo, engagements) => ({ id, client_id: 'pk-works', platform: 'facebook', published_at: new Date(Date.now() - daysAgo * 86400000).toISOString(), job_id: null, metrics: { engagements, reach: 100 } });
let networkRows = [post('n1', 1, 7)];
global.fetch = async (url) => {
  urls.push(String(url));
  const path = new URL(url).pathname;
  const rows = path.endsWith('/network_posts') ? networkRows.filter((row) => row.published_at >= new URL(url).searchParams.get('published_at').slice(4)) : [];
  return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } });
};
const { overviewData } = require(ROOT + '/api/_lib/publishing.js');
(async () => {
  const data = await overviewData('w1', 'America/New_York', 'pk-works');
  for (const table of ['weekly_reports', 'publish_jobs', 'social_connections', 'network_posts', 'account_stats']) {
    const hit = urls.find((url) => new URL(url).pathname.endsWith('/' + table));
    assert.ok(hit, `${table} was queried`);
    assert.match(decodeURIComponent(hit), /client_id=eq\.pk-works/, `${table} is narrowed to the client`);
  }
  assert.equal(data.clientId, 'pk-works');
  assert.equal(data.engagement.total, 7);
  urls.length = 0;
  await overviewData('w1', 'America/New_York');
  assert.ok(!urls.some((url) => decodeURIComponent(url).includes('client_id=eq.')), 'all clients: no client filter');
  // Time frames: each compares with the same length of time before it; a year is shown by week.
  networkRows = [post('a', 1, 7), post('b', 10, 5), post('c', 40, 3), post('d', 200, 2), post('e', 500, 1)];
  let range = await overviewData('w1', 'America/New_York', null, 7);
  assert.deepEqual([range.range, range.engagement.total, range.engagement.previous, range.engagement.daily.length, range.published.total], [7, 7, 5, 7, 1]);
  assert.equal(range.engagement.daily.reduce((sum, point) => sum + point.previous, 0), 5, 'the previous week is charted alongside');
  assert.equal(range.engagement.daily[3].previous, 5, 'ten days ago lines up with three days ago');
  range = await overviewData('w1', 'America/New_York', null, 90);
  assert.deepEqual([range.engagement.total, range.engagement.previous, range.engagement.daily.length], [15, 0, 90]);
  range = await overviewData('w1', 'America/New_York', null, 365);
  assert.deepEqual([range.step, range.engagement.total, range.engagement.previous, range.engagement.daily.length], [7, 17, 1, 53]);
  assert.equal(range.engagement.daily.reduce((sum, point) => sum + point.engagements, 0), 17, 'every post lands in a week');
  assert.equal((await overviewData('w1', 'America/New_York', null, 12345)).range, 30, 'unknown time frames fall back to 30 days');
  const { insightsNote } = require(ROOT + '/api/_lib/sync.js');
  const blank = Array.from({ length: 4 }, () => ({ metrics: { likes: 2, reach: null, views: null } }));
  assert.match(insightsNote('facebook', blank), /Reconnect Facebook/);
  assert.equal(insightsNote('facebook', [...blank, { metrics: { reach: 40 } }]), null);
  assert.equal(insightsNote('instagram', blank), null);
  console.log('overview tests passed');
})().catch((error) => { console.error(error); process.exit(1); });
