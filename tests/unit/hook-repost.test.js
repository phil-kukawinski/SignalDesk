// Instant links and Instagram reposts: a link checks its feed (unknown or malformed links do nothing),
// two checks at once can't both run, "as soon as possible" feeds post minutes after an article
// is found, and an account's Instagram posts come back ready to repost, with ones Instagram withholds marked.
const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
const crypto = require('node:crypto');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', SOCIAL_PROFILE_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), META_APP_SECRET: 'meta-secret' });
const TOKEN = 'a'.repeat(32), HASH = crypto.createHash('sha256').update(TOKEN).digest('hex');
const FEED = { id: '55555555-5555-4555-8555-555555555555', workspace_id: 'ws-1', enabled: true, url: 'https://news.example/feed', platforms: ['facebook'], days: [1], times: ['09:00'] };
const calls = [];
let claimRows = [];
let graphBody = {};
const ok = (body, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
global.fetch = async (url, opts = {}) => {
  const text = String(url), method = opts.method || 'GET';
  calls.push({ url: text, method, body: opts.body ? JSON.parse(opts.body) : undefined });
  if (text.startsWith('https://graph.facebook.com/')) return ok(graphBody);
  if (text.includes('/autopilot_feeds?hook_token_hash=eq.')) return ok(text.includes(HASH) ? [FEED] : []);
  if (text.includes('/autopilot_feeds?id=eq.') && text.includes('last_checked_at.is.null')) return ok(claimRows);
  if (text.includes('/workspace_state')) return ok([{ state: { settings: { timezone: 'eastern' } } }]);
  return ok(null, 204);
};
const { soonSlots, runFeed } = require(ROOT + '/api/_lib/core.js');
const { instagramAccountPosts } = require(ROOT + '/api/_lib/platforms.js');
const hook = require(ROOT + '/api/hook.js');
const response = () => { const res = { headers: {}, statusCode: 0, body: null, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = typeof body === 'string' ? JSON.parse(body) : body; return this; }, end(body) { if (body) this.body = JSON.parse(body); return this; } }; return res; };

(async () => {
  // "As soon as possible": 5 minutes out, then 15 minutes apart.
  assert.deepStrictEqual(soonSlots(3, 0), [5 * 60000, 20 * 60000, 35 * 60000]);

  // A feed checked moments ago (the claim matches no row) is left alone.
  claimRows = [];
  calls.length = 0;
  assert.deepStrictEqual(await runFeed(FEED, { encryptionKey: Buffer.alloc(32, 7), timeZone: 'America/New_York' }), { created: 0, busy: true });
  assert.ok(!calls.some((call) => call.url.startsWith('https://news.example')), 'a busy feed is not read');

  // Malformed and unknown links do nothing.
  let res = response();
  await hook({ method: 'GET', url: '/api/hook?token=short', headers: {} }, res);
  assert.strictEqual(res.statusCode, 404);
  res = response();
  await hook({ method: 'POST', url: `/api/hook?token=${'b'.repeat(32)}`, headers: {} }, res);
  assert.strictEqual(res.statusCode, 404);
  res = response();
  await hook({ method: 'DELETE', url: `/api/hook?token=${TOKEN}`, headers: {} }, res);
  assert.strictEqual(res.statusCode, 405);

  // A real link is recorded as used and checks the feed (busy here, so it says so without waiting).
  calls.length = 0;
  res = response();
  await hook({ method: 'POST', url: `/api/hook?token=${TOKEN}`, headers: {} }, res);
  assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
  assert.match(res.body.message, /checked moments ago/);
  assert.ok(calls.some((call) => call.method === 'PATCH' && call.body?.last_hook_at), 'records when the link was used');
  assert.ok(!calls.some((call) => call.url.includes(TOKEN)), 'the secret itself is never sent to the database');

  // Instagram: posts, carousels, and posts Instagram won't share.
  graphBody = { business_discovery: { username: 'harborcoffee', name: 'Harbor Coffee', followers_count: 1200, media_count: 3, media: {
    data: [
      { id: '1', caption: 'Fall menu', media_type: 'IMAGE', media_url: 'https://scontent.cdninstagram.com/a.jpg', permalink: 'https://instagram.com/p/1', like_count: 10, comments_count: 2 },
      { id: '2', media_type: 'CAROUSEL_ALBUM', children: { data: [{ media_type: 'IMAGE', media_url: 'https://scontent.cdninstagram.com/b.jpg' }, { media_type: 'VIDEO', media_url: 'https://video.cdninstagram.com/c.mp4', thumbnail_url: 'https://scontent.cdninstagram.com/c.jpg' }] } },
      { id: '3', media_type: 'VIDEO', media_product_type: 'REELS', thumbnail_url: 'https://scontent.cdninstagram.com/d.jpg' }
    ],
    paging: { cursors: { after: 'NEXT' }, next: 'https://graph.facebook.com/next' }
  } } };
  const found = await instagramAccountPosts({ external_id: 'ig-1', token: 'tok' }, 'harborcoffee');
  assert.strictEqual(found.status, 'found');
  assert.strictEqual(found.next, 'NEXT');
  assert.deepStrictEqual(found.posts.map((post) => [post.kind, post.items.length, post.available]), [['image', 1, true], ['carousel', 2, true], ['reel', 0, false]]);
  assert.strictEqual(found.posts[1].items[1].type, 'video');
  graphBody = { error: { code: 100, message: 'Invalid user id' } };
  assert.strictEqual((await instagramAccountPosts({ external_id: 'ig-1', token: 'tok' }, 'someone')).status, 'not-found');
  console.log('hook-repost: ok');
})().catch((error) => { console.error(error); process.exit(1); });
