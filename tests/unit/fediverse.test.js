// Bluesky and Mastodon: rich-text positions in bytes, login checks before any network call, and the
// records sent when publishing (with a stand-in for the network).
const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
class PublishError extends Error { constructor(kind, message) { super(message); this.kind = kind; } }
const calls = [];
const replies = [];
const request = async (url, options = {}) => { calls.push({ url, options }); const next = replies.shift() || {}; return { response: { ok: next.ok !== false, status: next.status || 200 }, body: next.body || {} }; };
const { bluesky, mastodon, bskyFacets } = require(ROOT + '/api/_lib/fediverse.js')({ request, PublishError, httpKind: (s) => (s === 401 ? 'auth' : 'invalid'), downloadMedia: async () => ({ bytes: Buffer.from('img'), type: 'image/jpeg' }), mediaKind: (u) => (/\.mp4$/.test(u) ? 'video' : 'image'), assertPublicUrl: async (u) => u });

(async () => {
  const text = 'Café opens — see https://x.example/menu. #CoffeeTime #2026';
  const facets = bskyFacets(text);
  const slice = (f) => Buffer.from(text, 'utf8').subarray(f.index.byteStart, f.index.byteEnd).toString('utf8');
  assert.deepStrictEqual(facets.map(slice), ['https://x.example/menu', '#CoffeeTime'], 'byte positions land on the link and tag; numbers-only tags are skipped');
  assert.strictEqual(facets[1].features[0].tag, 'CoffeeTime');

  await assert.rejects(bluesky.login({ handle: 'me', password: 'abcd-efgh-ijkl-mnop' }), /full handle/);
  await assert.rejects(bluesky.login({ handle: 'me.bsky.social', password: 'my real password' }), /app password/);
  await assert.rejects(mastodon.login({ instance: 'not a host', token: 'x'.repeat(40) }), /server name/);
  assert.strictEqual(calls.length, 0, 'nothing is sent until the details look right');

  // Bluesky publish: one image uploaded, then the post record with its alt text and facets.
  replies.push({ body: { blob: { $type: 'blob', ref: { $link: 'b1' } } } }, { body: { uri: 'at://did:plc:abc/app.bsky.feed.post/3kxyz', cid: 'c' } });
  const stage = {};
  const out = await bluesky.publish({ connection: { token: 't', meta: { pds: 'https://pds.example', did: 'did:plc:abc' }, username: 'me.bsky.social' }, content: { text: 'Hello #rum', media: ['https://cdn.example/a.jpg'], alt: { 'https://cdn.example/a.jpg': 'A bottle' } }, stage, saveStage: async (s) => Object.assign(stage, s), markSent: async () => {} });
  assert.strictEqual(out.url, 'https://bsky.app/profile/me.bsky.social/post/3kxyz');
  const record = JSON.parse(calls.at(-1).options.body).record;
  assert.strictEqual(calls.at(-1).url, 'https://pds.example/xrpc/com.atproto.repo.createRecord');
  assert.strictEqual(record.embed.images[0].alt, 'A bottle');
  assert.strictEqual(record.facets[0].features[0].tag, 'rum');
  await assert.rejects(bluesky.publish({ connection: {}, content: { text: 'x'.repeat(301), media: [] }, stage: {}, saveStage: async () => {}, markSent: async () => {} }), /300 characters/);
  await assert.rejects(bluesky.publish({ connection: {}, content: { text: 'clip', media: ['https://cdn.example/v.mp4'] }, stage: {}, saveStage: async () => {}, markSent: async () => {} }), /video/);

  // Mastodon publish: status with the job id as the idempotency key.
  calls.length = 0;
  replies.push({ body: { id: '99', url: 'https://mastodon.social/@me/99' } });
  const toot = await mastodon.publish({ connection: { token: 't', meta: { instance: 'mastodon.social' } }, job: { id: 'job-1' }, content: { text: 'Hi', media: [] }, stage: {}, saveStage: async () => {}, markSent: async () => {} });
  assert.deepStrictEqual(toot, { externalId: 'mastodon.social:99', url: 'https://mastodon.social/@me/99' });
  assert.strictEqual(calls[0].options.headers['idempotency-key'], 'job-1');
  console.log('fediverse: ok');
})().catch((error) => { console.error(error); process.exit(1); });
