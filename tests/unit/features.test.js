const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
const crypto = require('node:crypto');
const key = crypto.randomBytes(32);
Object.assign(process.env, { AYRSHARE_API_KEY: 'k', SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', SOCIAL_PROFILE_ENCRYPTION_KEY: key.toString('base64'), ANTHROPIC_API_KEY: 'sk-test', RESEND_API_KEY: 're_test', NOTIFY_FROM_EMAIL: 'SignalDesk <hi@x.com>', APP_URL: 'https://app.test' });
const R = ROOT + '/api/_lib/';
const reports = require(R + 'reports.js');
// --- metric normalization
let m = reports.normalizeMetrics('instagram', { viewsCount: 1200, reachCount: 900, likeCount: 80, commentsCount: 12, sharesCount: 5, savedCount: 9, igReelsVideoViewTotalTimeCount: 600000, igReelsAvgWatchTimeCount: 7400 });
assert.deepEqual([m.views, m.reach, m.likes, m.comments, m.shares, m.saves, m.engagements, m.watchMinutes, m.avgWatchSeconds], [1200, 900, 80, 12, 5, 9, 106, 10, 7.4]);
assert.equal(m.engagementRate, 11.78);
m = reports.normalizeMetrics('instagram', { engagementCount: 150, likeCount: 80, reachCount: 1000 }); assert.equal(m.engagements, 150); assert.equal(m.engagementRate, 15);
m = reports.normalizeMetrics('twitter', { publicMetrics: { impressionCount: 5000, likeCount: 40, replyCount: 3, retweetCount: 4, quoteCount: 1, bookmarkCount: 2 } });
assert.deepEqual([m.views, m.shares, m.saves, m.engagements, m.reach], [5000, 5, 2, 50, null]); assert.equal(m.engagementRate, 1);
m = reports.normalizeMetrics('facebook', { reactions: { like: 10, love: 4, total: 14 }, commentsCount: 2, sharesCount: 1, totalMediaViewUnique: 300, mediaView: 450 });
assert.deepEqual([m.likes, m.reach, m.views, m.engagements], [14, 300, 450, 17]);
m = reports.normalizeMetrics('youtube', { views: '2000', likes: 50, comments: 5, estimatedMinutesWatched: 321, averageViewDuration: 48 });
assert.deepEqual([m.views, m.watchMinutes, m.avgWatchSeconds, m.engagements], [2000, 321, 48, 55]);
m = reports.normalizeMetrics('linkedin', {}); assert.equal(m.engagements, null); assert.equal(m.engagementRate, null);
// --- week math: Friday Oct 16 2026 → last completed week starts Mon Oct 5
assert.equal(reports.lastCompletedWeekStart('America/New_York', new Date('2026-10-16T15:00:00Z')), '2026-10-05');
assert.equal(reports.lastCompletedWeekStart('America/New_York', new Date('2026-10-19T03:00:00Z')), '2026-10-05'); // still Sunday night in NY
const range = reports.weekRange('2026-10-05', 'America/New_York');
assert.equal(new Date(range.start).toISOString(), '2026-10-05T04:00:00.000Z'); assert.equal(new Date(range.end + 1).toISOString(), '2026-10-12T04:00:00.000Z');
const dst = reports.weekRange('2026-10-26', 'America/New_York'); assert.equal(new Date(dst.end + 1).toISOString(), '2026-11-02T05:00:00.000Z');

// --- fake services
let state = { clients: [{ id: 'pk-works', name: 'PK Works', desc: 'Creative studio' }], settings: { timezone: 'Eastern Time (US & Canada)' } };
let role = 'user'; const calls = []; let claudeTurn = 0; let prefsRows = [];
const enc = (t) => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv); const e = Buffer.concat([c.update(t), c.final()]); return Buffer.concat([iv, c.getAuthTag(), e]).toString('base64'); };
const ok = (body, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const U = '11111111-1111-1111-1111-111111111111', A = '22222222-2222-2222-2222-222222222222';
global.fetch = async (input, opts = {}) => {
  const url = String(input.url || input); const method = opts.method || input.method || 'GET';
  let body; try { body = opts.body ? JSON.parse(opts.body) : undefined; } catch {}
  calls.push({ url, method, body, headers: opts.headers });
  if (url.endsWith('/auth/v1/user')) return ok({ id: role === 'user' ? U : A, email: role === 'user' ? 'user@x.com' : 'admin@x.com' });
  if (url.includes('/rest/v1/workspace_members?') && url.includes('user_id=eq.')) return ok([{ workspace_id: 'ws-1', role, email: role === 'user' ? 'user@x.com' : 'admin@x.com' }]);
  if (url.includes('/rest/v1/workspace_members?workspace_id=eq.ws-1')) return ok([{ user_id: U, email: 'user@x.com', role: 'user' }, { user_id: A, email: 'admin@x.com', role: 'admin' }]);
  if (url.includes('/rest/v1/workspace_members?select=')) return ok([{ user_id: U, email: 'user@x.com', role: 'user', workspace_id: 'ws-1' }, { user_id: A, email: 'admin@x.com', role: 'admin', workspace_id: 'ws-1' }]);
  if (url.includes('/rest/v1/workspace_state?')) return ok([{ state }]);
  if (url.includes('/rest/v1/social_profiles?')) return ok([{ client_id: 'pk-works', ayrshare_ref_id: 'r', profile_key_ciphertext: enc('pk') }]);
  if (url.includes('/rest/v1/notification_preferences?user_id=in.')) return ok(prefsRows);
  if (url.includes('/rest/v1/post_submissions?workspace_id=eq.ws-1&provider_post_id=eq.post-1&select')) return ok([{ submitted_by: U, title: 'Fall kits are here', decided_at: null }]);
  if (url.includes('/rest/v1/notifications?') && method === 'GET') return ok([{ title: 'New post awaiting approval', body: 'x', category: 'approvals', created_at: new Date().toISOString() }]);
  if (url.includes('/rest/v1/weekly_reports?') && method === 'GET') return ok([]);
  if (url.includes('/rest/v1/trend_reports?') && method === 'GET') return ok([]);
  if (url.includes('/rest/v1/trend_reports') && method === 'POST') return ok([{ id: 't1', ...body, created_at: new Date().toISOString() }], 201);
  if (url.includes('/rest/v1/')) return ok(null, 204);
  if (url === 'https://api.ayrshare.com/api/post' && method === 'POST') return ok({ status: 'awaiting approval', id: 'post-1' });
  if (url === 'https://api.ayrshare.com/api/post' && method === 'PATCH') return ok({ status: 'success' });
  if (url.startsWith('https://api.ayrshare.com/api/history')) return ok({ history: [{ id: 'h1', post: 'Back to school!', platforms: ['instagram', 'facebook'], postIds: [{ platform: 'instagram', id: 'ig1', postUrl: 'https://instagram.com/p/1' }], scheduleDate: { utc: '2026-10-07T14:00:00Z' }, mediaUrls: ['https://cdn/x.jpg'] }] });
  if (url === 'https://api.ayrshare.com/api/analytics/post') return ok({ instagram: { analytics: { viewsCount: 500, likeCount: 40, commentsCount: 4, reachCount: 400 } }, facebook: { analytics: { mediaView: 300, reactions: { total: 10 }, commentsCount: 1 } } });
  if (url === 'https://api.resend.com/emails') return ok({ id: 'email-1' });
  if (url.startsWith('https://api.anthropic.com/v1/messages')) {
    claudeTurn += 1;
    if (claudeTurn === 1) return ok({ id: 'm1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'tiktok trends' } }, { type: 'web_search_tool_result', tool_use_id: 's1', content: [{ type: 'web_search_result', url: 'https://ads.tiktok.com/trend', title: 'Creative Center', page_age: '1 day' }] }], usage: {} });
    return ok({ id: 'm2', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu1', name: 'submit_trend_report', input: { summary: 'Cozy fall.', hashtags: [{ tag: '#FallVibes', platforms: ['TikTok'], momentum: 'rising', why: 'Seasonal', sourceUrls: ['https://ads.tiktok.com/trend', 'https://made-up.example/x'] }], audio: [], formats: [], topPosts: [{ creator: 'a', platform: 'TikTok', description: 'd', whyItWorks: 'w', url: 'https://made-up.example/post', sourceUrls: [] }], ideas: [{ title: 'i', client: 'PK Works', platforms: ['TikTok'], hook: 'h', description: 'd' }] } }], usage: {} });
  }
  throw new Error('unexpected fetch ' + method + ' ' + url);
};
const handler = require(ROOT + '/api/social.js');
const { processEmailDigests } = require(R + 'notify.js');
async function call(body) { let status, payload; const res = { status(s) { status = s; return this; }, json(p) { payload = p; } }; await handler({ method: 'POST', body, headers: { authorization: 'Bearer t', origin: 'http://localhost:3000' } }, res); return { status, payload }; }
const future = new Date(Date.now() + 86400000).toISOString();
(async () => {
  let r0;
  // (Publishing and approvals are covered against real SQL in pg/queue.test.mjs.)
  r0 = await call({ action: 'top-posts', clientId: 'pk-works' }); assert.equal(r0.status, 403);
  role = 'admin'; calls.length = 0;
  let r;
  // Top Posts: last 7 days live, one row per network
  r = await call({ action: 'top-posts', clientId: 'pk-works', range: 'last7' }); assert.equal(r.status, 200, JSON.stringify(r.payload));
  assert.equal(r.payload.report.rows.length, 2); const ig = r.payload.report.rows.find((x) => x.platform === 'instagram');
  assert.equal(ig.url, 'https://instagram.com/p/1'); assert.equal(ig.metrics.engagements, 44); assert.equal(ig.metrics.engagementRate, 11);
  assert.equal(r.payload.report.totals.views, 800);
  r = await call({ action: 'top-posts', clientId: 'pk-works', range: '2026-10-05' }); assert.equal(r.status, 200); assert.equal(r.payload.stored, true);
  assert.ok(calls.some((c) => c.url.includes('weekly_reports?on_conflict') && c.method === 'POST'));
  r = await call({ action: 'top-posts', clientId: 'pk-works', range: 'nope' }); assert.equal(r.status, 400);
  // Trends: SDK call shape, pause_turn resume, invented URLs removed
  role = 'user'; calls.length = 0;
  r = await call({ action: 'trends-refresh', focus: 'all', platforms: ['tiktok', 'instagram', 'bogus'] }); assert.equal(r.status, 200, JSON.stringify(r.payload));
  const claude = calls.filter((c) => c.url.startsWith('https://api.anthropic.com/v1/messages'));
  assert.equal(claude.length, 2); const req = claude[0].body;
  assert.equal(req.model, 'claude-opus-5-5'); assert.equal(req.fallbacks, 'default'); assert.deepEqual(req.output_config, { effort: 'medium' });
  assert.equal(req.tools[0].type, 'web_search_20260209'); assert.equal(req.tools[1].strict, true); assert.deepEqual(req.tool_choice, { type: 'auto' });
  const headers = calls.find((c) => c.url.startsWith('https://api.anthropic.com')).headers; const h = headers instanceof Headers ? Object.fromEntries(headers) : headers;
  assert.match(JSON.stringify(h), /server-side-fallback-2026-07-01/);
  assert.equal(claude[1].body.messages.length, 2); assert.equal(claude[1].body.messages[1].role, 'assistant');
  assert.match(req.messages[0].content, /PK Works: Creative studio/);
  const saved = calls.find((c) => c.url.endsWith('/rest/v1/trend_reports') && c.method === 'POST').body;
  assert.deepEqual(saved.platforms, ['tiktok', 'instagram']); assert.deepEqual(saved.data.hashtags[0].sourceUrls, ['https://ads.tiktok.com/trend']); assert.equal(saved.data.topPosts[0].url, '');
  r = await call({ action: 'trends-refresh', focus: 'custom', customFocus: '', platforms: ['tiktok'] }); assert.equal(r.status, 400);
  // Digests: daily at/after 8 AM local, once per day; nothing before 8 AM
  prefsRows = [{ user_id: A, email_frequency: 'daily', email_categories: ['approvals'], weekly_day: 1, last_digest_at: null }, { user_id: U, email_frequency: 'weekly', email_categories: ['approvals'], weekly_day: 1, last_digest_at: null }];
  calls.length = 0;
  let d = await processEmailDigests({ now: new Date('2026-10-16T11:30:00Z') }); assert.equal(d.sent, 0); // 7:30 AM ET
  d = await processEmailDigests({ now: new Date('2026-10-16T13:00:00Z') }); assert.equal(d.sent, 1); // 9 AM ET Friday: daily yes, weekly(Mon) no
  const digest = calls.filter((c) => c.url === 'https://api.resend.com/emails').pop(); assert.deepEqual(digest.body.to, ['admin@x.com']); assert.equal(digest.body.subject, 'Your SignalDesk daily digest');
  prefsRows[0].last_digest_at = '2026-10-16T13:00:00Z';
  d = await processEmailDigests({ now: new Date('2026-10-16T20:00:00Z') }); assert.equal(d.sent, 0);
  d = await processEmailDigests({ now: new Date('2026-10-19T13:00:00Z') }); assert.equal(d.sent, 2); // Monday: both
  console.log('feature tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
