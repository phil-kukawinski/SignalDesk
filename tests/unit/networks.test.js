// X, YouTube, TikTok, Threads, and Instagram Stories against simulated network responses.
const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
const crypto = require('node:crypto');
Object.assign(process.env, {
  APP_URL: 'https://signaldesk.test', SOCIAL_PROFILE_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
  SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc',
  X_CLIENT_ID: 'xid', X_CLIENT_SECRET: 'xsecret', GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret',
  TIKTOK_CLIENT_KEY: 'tkey', TIKTOK_CLIENT_SECRET: 'tsecret', THREADS_APP_ID: 'thid', THREADS_APP_SECRET: 'thsecret',
  META_APP_ID: 'm', META_APP_SECRET: 'ms'
});
const calls = [];
let routes = [];
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
global.fetch = async (input, init = {}) => {
  const url = String(input);
  calls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
  for (const [pattern, reply] of routes) if (pattern.test(url)) return typeof reply === 'function' ? reply(url, init) : reply.clone();
  return json({ error: { message: `no route for ${url}` } }, 404);
};
// Public-host check for media downloads: resolve everything to a public address.
require('node:dns').promises.lookup = async () => [{ address: '93.184.216.34', family: 4 }];
const { PROVIDERS, providerConfigured, DIRECT_PLATFORMS, CONNECTION_PLATFORM, adapterFor } = require(ROOT + '/api/_lib/platforms.js');
const media = (type, size = 2048) => new Response(Buffer.alloc(size, 1), { status: 200, headers: { 'content-type': type, 'content-length': String(size) } });
const ctx = (extra) => { const stage = {}; return { stage, saveStage: async (patch) => Object.assign(stage, patch), markSent: async () => {}, options: {}, job: { id: 'job-1', platform: 'x' }, ...extra }; };

(async () => {
  for (const provider of ['x', 'google', 'tiktok', 'threads']) assert.ok(providerConfigured(provider), provider);
  assert.equal(DIRECT_PLATFORMS.twitter, 'x'); assert.equal(DIRECT_PLATFORMS.youtube, 'google'); assert.equal(CONNECTION_PLATFORM.instagram_story, 'instagram');
  assert.equal(adapterFor('instagram_story'), PROVIDERS.meta);

  // --- Every network's sign-in page is on the browser's allowed list (js/publishing.js)
  const hosts = JSON.parse(require('node:fs').readFileSync(ROOT + '/js/publishing.js', 'utf8').match(/const OAUTH_HOSTS=(\[[^\]]*\])/)[1].replace(/'/g, '"'));
  for (const [name, adapter] of Object.entries(PROVIDERS)) {
    if (!providerConfigured(name)) continue;
    const signIn = new URL(adapter.authorizeUrl('state-' + 'b'.repeat(40)));
    assert.ok(hosts.includes(signIn.hostname), `${name} signs in at ${signIn.hostname}, which js/publishing.js would block`);
  }

  // --- X: PKCE challenge in the sign-in link matches the verifier sent with the code
  const state = 'state-' + 'a'.repeat(40);
  const authUrl = new URL(PROVIDERS.x.authorizeUrl(state));
  assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.match(authUrl.searchParams.get('scope'), /tweet\.write/);
  routes = [
    [/api\.x\.com\/2\/oauth2\/token/, json({ access_token: 'xa', refresh_token: 'xr', expires_in: 7200 })],
    [/api\.x\.com\/2\/users\/me/, json({ data: { id: '42', username: 'pkworks', name: 'PK Works' } })]
  ];
  const xs = await PROVIDERS.x.exchange('code1', { state });
  const tokenCall = calls.find((c) => /oauth2\/token/.test(c.url));
  const verifier = new URLSearchParams(tokenCall.body).get('code_verifier');
  assert.equal(crypto.createHash('sha256').update(verifier).digest('base64url'), authUrl.searchParams.get('code_challenge'));
  assert.match(tokenCall.headers.authorization, /^Basic /);
  assert.equal(xs.candidates[0].platform, 'twitter'); assert.equal(xs.candidates[0].username, 'pkworks');

  // --- X: post with an image
  calls.length = 0;
  routes = [
    [/cdn\.test\/photo\.jpg/, media('image/jpeg')],
    [/api\.x\.com\/2\/media\/upload\?command=STATUS/, json({ data: {} })],
    [/api\.x\.com\/2\/media\/upload$/, json({ data: { id: 'm1' } })],
    [/api\.x\.com\/2\/tweets$/, json({ data: { id: '999' } }, 201)]
  ];
  let c = ctx({ connection: { token: 'xa', username: 'pkworks' }, content: { text: 'Hello X', media: ['https://cdn.test/photo.jpg'] } });
  let out = await PROVIDERS.x.publish(c);
  assert.deepEqual(out, { externalId: '999', url: 'https://x.com/pkworks/status/999' });
  const tweet = calls.find((call) => /\/2\/tweets$/.test(call.url));
  assert.deepEqual(JSON.parse(tweet.body), { text: 'Hello X', media: { media_ids: ['m1'] } });
  await assert.rejects(PROVIDERS.x.publish(ctx({ connection: { token: 'xa' }, content: { text: 'x'.repeat(281), media: [] } })), /280 characters/);

  // --- YouTube: resumable upload
  calls.length = 0;
  routes = [
    [/cdn\.test\/clip\.mp4/, media('video/mp4', 4096)],
    [/upload\/youtube\/v3\/videos\?uploadType=resumable/, new Response('', { status: 200, headers: { location: 'https://upload.test/session-1' } })],
    [/upload\.test\/session-1/, json({ id: 'vid123' })]
  ];
  out = await PROVIDERS.google.publish(ctx({ connection: { token: 'ga' }, content: { text: 'Fall kits are here\nMore below', media: ['https://cdn.test/clip.mp4'] }, options: { youtube: { visibility: 'unlisted' } } }));
  assert.deepEqual(out, { externalId: 'vid123', url: 'https://www.youtube.com/watch?v=vid123' });
  const startCall = calls.find((call) => /uploadType=resumable/.test(call.url));
  const meta = JSON.parse(startCall.body);
  assert.equal(meta.snippet.title, 'Fall kits are here'); assert.equal(meta.status.privacyStatus, 'unlisted');
  assert.equal(calls.find((call) => /session-1/.test(call.url)).method, 'PUT');
  await assert.rejects(PROVIDERS.google.publish(ctx({ connection: { token: 'ga' }, content: { text: 'no video', media: [] } })), /need a video/);

  // --- TikTok: privacy falls back to what the creator allows, then upload and status
  calls.length = 0;
  let statusReplies = ['PROCESSING_UPLOAD', 'PUBLISH_COMPLETE'];
  routes = [
    [/cdn\.test\/clip\.mp4/, media('video/mp4', 4096)],
    [/creator_info\/query/, json({ data: { privacy_level_options: ['SELF_ONLY'] }, error: { code: 'ok' } })],
    [/post\/publish\/video\/init/, json({ data: { publish_id: 'pub1', upload_url: 'https://upload.tiktok.test/u1' }, error: { code: 'ok' } })],
    [/upload\.tiktok\.test/, new Response('', { status: 201 })],
    [/status\/fetch/, () => json({ data: { status: statusReplies.shift(), publicaly_available_post_id: ['7001'] }, error: { code: 'ok' } })]
  ];
  c = ctx({ connection: { token: 'ta' }, content: { text: 'TikTok caption', media: ['https://cdn.test/clip.mp4'] }, options: { tiktok: { visibility: 'public' } } });
  out = await PROVIDERS.tiktok.publish(c);
  assert.equal(out.pending, true);
  const init = JSON.parse(calls.find((call) => /video\/init/.test(call.url)).body);
  assert.equal(init.post_info.privacy_level, 'SELF_ONLY'); assert.equal(init.source_info.video_size, 4096); assert.equal(init.source_info.total_chunk_count, 1);
  assert.equal(calls.find((call) => /upload\.tiktok\.test/.test(call.url)).headers['content-range'], 'bytes 0-4095/4096');
  out = await PROVIDERS.tiktok.publish(c);
  assert.deepEqual(out, { externalId: '7001', url: '' });
  assert.equal(calls.filter((call) => /video\/init/.test(call.url)).length, 1, 'upload happens once');

  // --- Threads: text posts publish right away; media waits for processing first
  calls.length = 0;
  routes = [
    [/graph\.threads\.net\/v1\.0\/u1\/threads_publish/, json({ id: 'th-post' })],
    [/graph\.threads\.net\/v1\.0\/u1\/threads/, json({ id: 'container-1' })],
    [/graph\.threads\.net\/v1\.0\/container-1/, json({ status: 'FINISHED' })],
    [/graph\.threads\.net\/v1\.0\/th-post/, json({ permalink: 'https://www.threads.net/@pk/post/abc' })]
  ];
  out = await PROVIDERS.threads.publish(ctx({ connection: { token: 'tha', external_id: 'u1' }, content: { text: 'Hello Threads', media: [] } }));
  assert.deepEqual(out, { externalId: 'th-post', url: 'https://www.threads.net/@pk/post/abc' });
  assert.equal(new URLSearchParams(calls[0].body).get('media_type'), 'TEXT');
  c = ctx({ connection: { token: 'tha', external_id: 'u1' }, content: { text: 'With a photo', media: ['https://cdn.test/photo.jpg'] } });
  assert.equal((await PROVIDERS.threads.publish(c)).pending, true);
  assert.equal((await PROVIDERS.threads.publish(c)).externalId, 'th-post');
  await assert.rejects(PROVIDERS.threads.publish(ctx({ connection: { token: 'tha', external_id: 'u1' }, content: { text: 'x'.repeat(501), media: [] } })), /500 characters/);

  // --- Threads token renewal uses the long-lived token itself
  routes = [[/refresh_access_token/, json({ access_token: 'tha2', expires_in: 5184000 })]];
  const renewed = await PROVIDERS.threads.refresh({ token: 'tha', refreshToken: 'tha' });
  assert.equal(renewed.token, 'tha2'); assert.equal(renewed.refreshToken, 'tha2');

  // --- Instagram Story: a video goes straight to a STORIES container
  calls.length = 0;
  routes = [
    [/graph\.facebook\.com\/v23\.0\/ig1\/media_publish/, json({ id: 'story-1' })],
    [/graph\.facebook\.com\/v23\.0\/ig1\/media/, json({ id: 'sc1' })],
    [/graph\.facebook\.com\/v23\.0\/sc1/, json({ status_code: 'FINISHED' })]
  ];
  c = ctx({ job: { id: 'job-s', platform: 'instagram_story' }, connection: { token: 'pt', external_id: 'ig1', username: 'pkworks' }, content: { text: '', media: ['https://cdn.test/clip.mp4'] } });
  out = await PROVIDERS.meta.publish(c);
  assert.deepEqual(out, { externalId: 'story-1', url: 'https://www.instagram.com/stories/pkworks/' });
  const create = calls.find((call) => /ig1\/media\?/.test(call.url) || (/ig1\/media$/.test(call.url.split('?')[0])));
  assert.match(create.url + String(create.body || ''), /STORIES/);
  await assert.rejects(PROVIDERS.meta.publish(ctx({ job: { id: 'j', platform: 'instagram_story' }, connection: { token: 'pt', external_id: 'ig1' }, content: { text: '', media: ['https://cdn.test/a.mp4', 'https://cdn.test/b.mp4'] } })), /one image or video/);

  console.log('network tests passed');
})().catch((error) => { console.error(error); process.exit(1); });
