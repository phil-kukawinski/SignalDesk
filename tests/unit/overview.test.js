// Command Center numbers for one client: every query is narrowed to that client.
const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', SOCIAL_PROFILE_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64') });
const urls = [];
global.fetch = async (url) => {
  urls.push(String(url));
  const path = new URL(url).pathname;
  const rows = path.endsWith('/network_posts') ? [{ id: 'n1', client_id: 'pk-works', platform: 'facebook', published_at: new Date(Date.now() - 86400000).toISOString(), job_id: null, metrics: { engagements: 7, reach: 100 } }] : [];
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
  const { insightsNote } = require(ROOT + '/api/_lib/sync.js');
  const blank = Array.from({ length: 4 }, () => ({ metrics: { likes: 2, reach: null, views: null } }));
  assert.match(insightsNote('facebook', blank), /Reconnect Facebook/);
  assert.equal(insightsNote('facebook', [...blank, { metrics: { reach: 40 } }]), null);
  assert.equal(insightsNote('instagram', blank), null);
  console.log('overview tests passed');
})().catch((error) => { console.error(error); process.exit(1); });
