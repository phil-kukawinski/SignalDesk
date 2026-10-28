import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { createRest } from './rest.mjs';

const require = createRequire(import.meta.url);
const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
`);
await db.exec(fs.readFileSync(`${ROOT}/supabase/schema.sql`, 'utf8'));
await db.exec(fs.readFileSync(`${ROOT}/supabase/schema.sql`, 'utf8')); // re-runnable
const rest = await createRest(db);
const q = async (sql) => (await db.query(sql)).rows;

const ADMIN = 'aaaaaaaa-0000-0000-0000-000000000001', USER = 'bbbbbbbb-0000-0000-0000-000000000002';
await db.exec(`insert into auth.users values ('${ADMIN}','owner@x.com',now()),('${USER}','member@x.com',now());
insert into workspaces (id, name, created_by) values ('11111111-1111-1111-1111-111111111111','Studio','${ADMIN}');
insert into workspace_members values ('11111111-1111-1111-1111-111111111111','${ADMIN}','owner@x.com','admin',now()),('11111111-1111-1111-1111-111111111111','${USER}','member@x.com','user',now());
insert into workspace_state (workspace_id, state) values ('11111111-1111-1111-1111-111111111111','{"clients":[{"id":"pk-works","name":"PK Works"}],"settings":{"timezone":"Eastern Time (US & Canada)"}}');`);
const WS = '11111111-1111-1111-1111-111111111111';

const key = crypto.randomBytes(32);
Object.assign(process.env, {
  SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', SOCIAL_PROFILE_ENCRYPTION_KEY: key.toString('base64'),
  CRON_SECRET: 'cron-secret', META_APP_ID: 'meta-id', META_APP_SECRET: 'meta-secret', LINKEDIN_CLIENT_ID: 'li-id', LINKEDIN_CLIENT_SECRET: 'li-secret',
  PINTEREST_APP_ID: 'pin-id', PINTEREST_APP_SECRET: 'pin-secret', APP_URL: 'https://signaldesk.test', APP_ORIGINS: 'https://signaldesk.test'
});
delete process.env.AYRSHARE_API_KEY;
require('node:dns').promises.lookup = async () => [{ address: '93.184.216.34', family: 4 }];

const external = []; // calls to social networks
let networkHandler = () => { throw new Error('no handler'); };
const reply = (body, status = 200, headers = {}) => new Response(body === null ? '' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
global.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url.startsWith('https://sb.test/rest/v1/')) {
    try {
      const result = await rest(url.slice('https://sb.test/rest/v1/'.length), { method: options.method || 'GET', headers: options.headers || {}, body: options.body });
      return reply(result, result === null ? 201 : 200);
    } catch (error) {
      console.error('REST error', options.method || 'GET', url, error.message);
      return reply({ message: error.message }, 400);
    }
  }
  if (url === 'https://sb.test/auth/v1/user') {
    const token = (options.headers.authorization || '').replace('Bearer ', '');
    return token === 'admin' ? reply({ id: ADMIN, email: 'owner@x.com' }) : token === 'user' ? reply({ id: USER, email: 'member@x.com' }) : reply({}, 401);
  }
  const call = { url, method: options.method || 'GET', body: options.body, headers: options.headers || {} };
  external.push(call);
  return networkHandler(call);
};

const sharp = require(`${ROOT}/node_modules/sharp`);
const kitJpeg = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#5b8db8' } }).jpeg().toBuffer();
const social = require(`${ROOT}/api/social.js`);
const cron = require(`${ROOT}/api/cron.js`);
const oauth = require(`${ROOT}/api/oauth.js`);
async function call(body, token = 'admin') {
  let status, payload;
  const res = { status(s) { status = s; return this; }, json(p) { payload = p; } };
  await social({ method: 'POST', body, headers: { authorization: `Bearer ${token}`, origin: 'https://signaldesk.test' } }, res);
  return { status, payload };
}
async function runCron(only) {
  let status, payload;
  const res = { status(s) { status = s; return this; }, json(p) { payload = p; } };
  await cron({ method: 'GET', url: only ? '/api/cron?only=publish' : '/api/cron', headers: { authorization: 'Bearer cron-secret' } }, res);
  return { status, payload };
}
async function callback(query) {
  const res = { statusCode: 0, headers: {}, body: '', setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  await oauth({ method: 'GET', url: `/api/oauth?${new URLSearchParams(query)}`, headers: {} }, res);
  return res;
}
const body = (c) => (c.body ? (typeof c.body === 'string' ? (c.body.startsWith('{') ? JSON.parse(c.body) : Object.fromEntries(new URLSearchParams(c.body))) : c.body) : {});

// --- Accounts before connecting ---
let r = await call({ action: 'accounts', clientId: 'pk-works' });
assert.equal(r.status, 200, JSON.stringify(r.payload));
assert.deepEqual(r.payload.integrations, { meta: true, linkedin: true, linkedinPages: false, pinterest: true, x: false, youtube: false, tiktok: false, threads: false, ayrshare: false, stock: false });
assert.ok(r.payload.accounts.every((a) => !a.linked));
assert.equal(r.payload.accounts.find((a) => a.platform === 'tiktok').available, false);
r = await call({ action: 'connect', clientId: 'pk-works' });
assert.equal(r.status, 503, 'Ayrshare connect needs Ayrshare');
r = await call({ action: 'oauth-start', clientId: 'pk-works', provider: 'meta' }, 'user');
assert.equal(r.status, 403, 'users cannot connect accounts');

// --- Meta sign-in ---
r = await call({ action: 'oauth-start', clientId: 'pk-works', provider: 'meta' });
assert.equal(r.status, 200, JSON.stringify(r.payload));
const metaUrl = new URL(r.payload.url);
assert.equal(metaUrl.hostname, 'www.facebook.com');
assert.equal(metaUrl.searchParams.get('redirect_uri'), 'https://signaldesk.test/api/oauth');
assert.match(metaUrl.searchParams.get('scope'), /instagram_content_publish/);
const metaSession = r.payload.sessionId;
networkHandler = (c) => {
  const u = new URL(c.url);
  if (u.pathname.endsWith('/oauth/access_token') && u.searchParams.get('code')) return reply({ access_token: 'short' });
  if (u.pathname.endsWith('/oauth/access_token')) return reply({ access_token: 'long-user', expires_in: 5184000 });
  if (u.pathname.endsWith('/me')) return reply({ id: '10012345678' });
  if (u.pathname.endsWith('/me/accounts')) {
    assert.equal(u.searchParams.get('appsecret_proof'), crypto.createHmac('sha256', 'meta-secret').update('long-user').digest('hex'));
    return reply({ data: [{ id: 'page1', name: 'PK Works Page', access_token: 'page-token', link: 'https://facebook.com/pk', instagram_business_account: { id: 'ig1', username: 'pkworks' } }, { id: 'page2', name: 'Other Page', access_token: 'page2-token' }] });
  }
  throw new Error('unexpected ' + c.url);
};
let page = await callback({ state: 'x'.repeat(10), code: 'abc' });
assert.equal(page.statusCode, 400, 'bad state rejected');
const [{ state: metaState }] = await q(`select state from oauth_sessions where id='${metaSession}'`);
page = await callback({ state: metaState, code: 'abc' });
assert.equal(page.statusCode, 200, page.body);
assert.match(page.body, /postMessage/);
assert.doesNotMatch(page.body, /page-token/);
page = await callback({ state: metaState, code: 'abc' });
assert.equal(page.statusCode, 400, 'state is single use');
r = await call({ action: 'oauth-session', sessionId: metaSession });
assert.equal(r.payload.status, 'authorized');
assert.deepEqual(r.payload.candidates.map((c) => c.key), ['facebook:page1', 'instagram:ig1', 'facebook:page2']);
assert.ok(!JSON.stringify(r.payload).includes('page-token'), 'tokens never reach the browser');
r = await call({ action: 'oauth-finish', sessionId: metaSession, selections: [{ key: 'facebook:page1' }, { key: 'facebook:page2' }] });
assert.equal(r.status, 400, 'one account per network');
r = await call({ action: 'oauth-finish', sessionId: metaSession, selections: [{ key: 'facebook:page1' }, { key: 'instagram:ig1' }] });
assert.equal(r.status, 200, JSON.stringify(r.payload));
assert.equal((await q(`select secret_ciphertext from oauth_sessions where id='${metaSession}'`))[0].secret_ciphertext, null);
const conns = await q(`select platform, external_id, token_ciphertext, meta from social_connections order by platform`);
assert.deepEqual(conns.map((c) => c.platform), ['facebook', 'instagram']);
assert.ok(!conns[0].token_ciphertext.includes('page-token'));
assert.deepEqual(conns[1].meta, { metaUserId: '10012345678', pageId: 'page1' });
assert.deepEqual(conns[0].meta, { metaUserId: '10012345678' });
// Meta's deauthorize and deletion callbacks find connections by the app-scoped user ID.
{
  const legal = require(`${ROOT}/api/legal.js`);
  const b64 = (v) => Buffer.from(v).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const signed = (userId) => { const payload = b64(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: userId })); return `${b64(crypto.createHmac('sha256', 'meta-secret').update(payload).digest())}.${payload}`; };
  const legalCall = async (event, userId) => { let status, payload; await legal({ method: 'POST', url: `/api/legal?event=${event}`, body: { signed_request: signed(userId) }, headers: { host: 'x' } }, { status(s) { status = s; return this; }, json(p) { payload = p; }, setHeader() {} }); return { status, payload }; };
  let lr = await legalCall('meta-deauthorize', '555');
  assert.equal(lr.status, 200);
  assert.deepEqual((await q(`select status from social_connections order by platform`)).map((c) => c.status), ['active', 'active'], 'other users untouched');
  lr = await legalCall('meta-deauthorize', '10012345678');
  assert.deepEqual((await q(`select status from social_connections order by platform`)).map((c) => c.status), ['needs_reauth', 'needs_reauth']);
  await q(`update social_connections set status='active', last_error=null`);
  const saved = await q(`select * from social_connections`);
  lr = await legalCall('meta-deletion', '10012345678');
  assert.equal(lr.status, 200, JSON.stringify(lr.payload));
  assert.equal((await q(`select count(*)::int as n from social_connections`))[0].n, 0);
  const [request] = await q(`select status, connections_removed from data_deletion_requests where code='${lr.payload.confirmation_code}'`);
  assert.deepEqual(request, { status: 'completed', connections_removed: 2 });
  for (const row of saved) await q(`insert into social_connections select * from json_populate_record(null::social_connections, '${JSON.stringify(row).replace(/'/g, "''")}'::json)`);
}

// --- LinkedIn sign-in (personal profile) ---
r = await call({ action: 'oauth-start', clientId: 'pk-works', provider: 'linkedin' });
const liSession = r.payload.sessionId;
assert.equal(new URL(r.payload.url).searchParams.get('scope'), 'openid profile w_member_social');
networkHandler = (c) => {
  if (c.url === 'https://www.linkedin.com/oauth/v2/accessToken') return reply({ access_token: 'li-token', expires_in: 5184000, scope: 'openid,profile,w_member_social' });
  if (c.url === 'https://api.linkedin.com/v2/userinfo') return reply({ sub: 'abc123', name: 'Phil K' });
  throw new Error('unexpected ' + c.url);
};
page = await callback({ state: (await q(`select state from oauth_sessions where id='${liSession}'`))[0].state, code: 'li-code' });
assert.equal(page.statusCode, 200, page.body);
r = await call({ action: 'oauth-finish', sessionId: liSession, selections: [{ key: 'linkedin:urn:li:person:abc123' }] });
assert.equal(r.status, 200, JSON.stringify(r.payload));

// --- Pinterest sign-in with board choice ---
r = await call({ action: 'oauth-start', clientId: 'pk-works', provider: 'pinterest' });
const pinSession = r.payload.sessionId;
networkHandler = (c) => {
  if (c.url === 'https://api.pinterest.com/v5/oauth/token') {
    assert.equal(c.headers.authorization, `Basic ${Buffer.from('pin-id:pin-secret').toString('base64')}`);
    return reply({ access_token: 'pin-token', refresh_token: 'pin-refresh', expires_in: 2592000, refresh_token_expires_in: 31536000 });
  }
  if (c.url.endsWith('/user_account')) return reply({ username: 'pkworks' });
  if (c.url.includes('/boards')) return reply({ items: [{ id: 'b1', name: 'Ideas' }, { id: 'b2', name: 'Kits' }] });
  throw new Error('unexpected ' + c.url);
};
page = await callback({ state: (await q(`select state from oauth_sessions where id='${pinSession}'`))[0].state, code: 'pin-code' });
assert.equal(page.statusCode, 200, page.body);
r = await call({ action: 'oauth-finish', sessionId: pinSession, selections: [{ key: 'pinterest:pkworks', boardId: 'b2' }] });
assert.equal(r.status, 200, JSON.stringify(r.payload));
r = await call({ action: 'accounts', clientId: 'pk-works' });
const linked = r.payload.accounts.filter((a) => a.linked);
assert.deepEqual(linked.map((a) => `${a.platform}:${a.provider}`), ['facebook:direct', 'instagram:direct', 'instagram_story:direct', 'linkedin:direct', 'pinterest:direct']);
assert.equal(r.payload.accounts.find((a) => a.platform === 'pinterest').boardId, 'b2');

// --- Schedule a post to all four, with comments and a repost ---
const future = Date.now() + 3600000;
r = await call({
  action: 'publish', clientId: 'pk-works', text: 'Fall kits are here (finally)! #BackToSchool https://pkworks.com/fall', platforms: ['facebook', 'instagram', 'linkedin', 'pinterest'],
  mediaUrls: ['https://cdn.example.com/kit.jpg'], platformContent: { instagram: { text: 'IG caption #kits' } },
  scheduleDate: new Date(future).toISOString(),
  options: { collaborators: ['friend'], firstComment: 'Link in bio', followUpComments: [{ comment: 'Still time!', delayMinutes: 60 }], autoRepost: { repeat: 1, days: 3 }, pinterest: { title: 'Fall kits' } }
});
assert.equal(r.status, 200, JSON.stringify(r.payload));
assert.equal(r.payload.status, 'scheduled');
assert.equal(r.payload.post.reposts, 1);
const postId = r.payload.post.id;
let posts = await q(`select id, status, parent_id, scheduled_for, options from scheduled_posts order by scheduled_for`);
assert.equal(posts.length, 2);
assert.equal(posts[1].parent_id, postId);
assert.ok(Math.abs(posts[1].scheduled_for.getTime() - posts[0].scheduled_for.getTime() - 3 * 86400000) < 60000, 'reposts land at the same local time, to the minute');
assert.equal(posts[1].options.firstComment, undefined);
let jobs = await q(`select platform, status, provider from publish_jobs where post_id='${postId}' order by platform`);
assert.deepEqual(jobs.map((j) => `${j.platform}:${j.status}:${j.provider}`), ['facebook:queued:direct', 'instagram:queued:direct', 'linkedin:queued:direct', 'pinterest:queued:direct']);
const comments = await q(`select c.comment, j.platform, c.run_at from scheduled_comments c join publish_jobs j on j.id=c.job_id order by j.platform, c.run_at`);
assert.deepEqual(comments.map((c) => `${c.platform}:${c.comment}`), ['facebook:Link in bio', 'facebook:Still time!', 'instagram:Link in bio', 'instagram:Still time!', 'linkedin:Link in bio', 'linkedin:Still time!']);
r = await call({ action: 'publish', clientId: 'pk-works', text: 'x', platforms: ['tiktok'], mediaUrls: ['https://cdn.example.com/a.mp4'] });
assert.equal(r.status, 400);
assert.match(r.payload.error, /Connect tiktok/i);

// Nothing is due yet
r = await runCron(true);
assert.equal(r.status, 200, JSON.stringify(r.payload));
assert.equal(r.payload.publishing.claimed, 0);

// --- Make it due and publish ---
await db.exec(`update publish_jobs set run_at = now() - interval '1 minute' where post_id='${postId}'; update scheduled_comments set run_at = now() - interval '1 minute' where comment='Link in bio';`);
let igStatusChecks = 0;
networkHandler = (c) => {
  const u = new URL(c.url);
  const b = body(c);
  if (u.hostname === 'graph.facebook.com') {
    assert.ok(b.appsecret_proof || u.searchParams.get('appsecret_proof'));
    if (u.pathname.endsWith('/page1/photos')) { assert.equal(b.url, 'https://cdn.example.com/kit.jpg'); assert.match(b.message, /^Fall kits/); return reply({ id: 'photo1', post_id: 'page1_post1' }); }
    if (u.pathname.endsWith('/ig1/media')) { assert.equal(b.caption, 'IG caption #kits'); assert.deepEqual(b.collaborators, ['friend']); return reply({ id: 'container1' }); }
    if (u.pathname.endsWith('/container1')) { igStatusChecks += 1; return reply({ status_code: 'FINISHED' }); }
    if (u.pathname.endsWith('/ig1/media_publish')) { assert.equal(b.creation_id, 'container1'); return reply({ id: 'igmedia1' }); }
    if (u.pathname.endsWith('/igmedia1')) return reply({ permalink: 'https://www.instagram.com/p/abc/' });
    if (u.pathname.endsWith('/comments')) return reply({ id: 'comment1' });
  }
  if (c.url === 'https://cdn.example.com/kit.jpg') return new Response(kitJpeg, { headers: { 'content-type': 'image/jpeg' } });
  if (c.url.startsWith('https://api.linkedin.com/rest/images?action=initializeUpload')) { assert.equal(b.initializeUploadRequest.owner, 'urn:li:person:abc123'); return reply({ value: { uploadUrl: 'https://upload.linkedin.test/1', image: 'urn:li:image:1' } }); }
  if (c.url === 'https://upload.linkedin.test/1') return new Response('', { status: 201 });
  if (c.url === 'https://api.linkedin.com/rest/posts') {
    assert.equal(c.headers['linkedin-version'], '202607');
    assert.equal(b.commentary, 'Fall kits are here \\(finally\\)! {hashtag|\\#|BackToSchool} https://pkworks.com/fall');
    assert.deepEqual(b.content, { media: { id: 'urn:li:image:1' } });
    return reply(null, 201, { 'x-restli-id': 'urn:li:share:99' });
  }
  if (c.url.startsWith('https://api.linkedin.com/rest/socialActions/')) { assert.equal(b.actor, 'urn:li:person:abc123'); return reply(null, 201, { 'x-restli-id': 'c1' }); }
  if (c.url === 'https://api.pinterest.com/v5/pins') {
    assert.deepEqual(b, { board_id: 'b2', title: 'Fall kits', description: 'Fall kits are here (finally)! #BackToSchool https://pkworks.com/fall', media_source: { source_type: 'image_url', url: 'https://cdn.example.com/kit.jpg' }, link: 'https://pkworks.com/fall' });
    return reply({ id: 'pin1' });
  }
  throw new Error('unexpected ' + c.method + ' ' + c.url);
};
r = await runCron(true);
assert.equal(r.status, 200, JSON.stringify(r.payload));
assert.equal(r.payload.publishing.published, 4, JSON.stringify(r.payload));
assert.equal(igStatusChecks, 1);
jobs = await q(`select platform, status, external_id, external_url, attempts, sent_at from publish_jobs where post_id='${postId}' order by platform`);
assert.deepEqual(jobs.map((j) => `${j.platform}:${j.status}:${j.external_id}`), ['facebook:published:page1_post1', 'instagram:published:igmedia1', 'linkedin:published:urn:li:share:99', 'pinterest:published:pin1']);
assert.equal(jobs[1].external_url, 'https://www.instagram.com/p/abc/');
assert.equal((await q(`select status from scheduled_posts where id='${postId}'`))[0].status, 'published');
assert.equal((await q(`select count(*)::int n from publish_attempts where outcome='published'`))[0].n, 4);
// First comments posted right after; follow-ups still waiting for their time
const posted = await q(`select comment, status from scheduled_comments order by comment, status`);
assert.deepEqual(posted.map((c) => `${c.comment}:${c.status}`), ['Link in bio:posted', 'Link in bio:posted', 'Link in bio:posted', 'Still time!:pending', 'Still time!:pending', 'Still time!:pending']);
const igComment = external.find((c) => c.url.includes('/igmedia1/comments'));
assert.equal(body(igComment).message, 'Link in bio');

// --- posts listing for the calendar ---
r = await call({ action: 'posts', from: new Date(Date.now() - 86400000).toISOString(), to: new Date(Date.now() + 10 * 86400000).toISOString() }, 'user');
assert.equal(r.status, 200, JSON.stringify(r.payload));
assert.equal(r.payload.posts.length, 2);
const listed = r.payload.posts.find((p) => p.id === postId);
assert.equal(listed.status, 'published');
assert.equal(listed.jobs.length, 4);
assert.ok(listed.jobs.every((j) => j.url));
assert.equal(r.payload.posts.find((p) => p.parentId === postId).status, 'scheduled');

// --- User posts need approval; reject and approve ---
r = await call({ action: 'publish', clientId: 'pk-works', text: 'Member post', platforms: ['facebook'], scheduleDate: new Date(future).toISOString(), requiresApproval: false }, 'user');
assert.equal(r.payload.status, 'pending_approval');
const heldId = r.payload.post.id;
assert.equal((await q(`select status from publish_jobs where post_id='${heldId}'`))[0].status, 'held');
assert.equal((await q(`select count(*)::int n from notifications where type='approval_requested' and user_id='${ADMIN}'`))[0].n, 1);
r = await call({ action: 'approve', postId: heldId }, 'user');
assert.equal(r.status, 403);
r = await call({ action: 'approve', postId: heldId });
assert.equal(r.status, 200, JSON.stringify(r.payload));
assert.equal((await q(`select status from publish_jobs where post_id='${heldId}'`))[0].status, 'queued');
assert.equal((await q(`select status, approved_by from scheduled_posts where id='${heldId}'`))[0].status, 'scheduled');
assert.equal((await q(`select count(*)::int n from notifications where type='approval_decided' and user_id='${USER}'`))[0].n, 1);
r = await call({ action: 'approve', postId: heldId });
assert.equal(r.status, 409);
r = await call({ action: 'publish', clientId: 'pk-works', text: 'Second member post', platforms: ['linkedin'], scheduleDate: new Date(future).toISOString() }, 'user');
const rejectId = r.payload.post.id;
r = await call({ action: 'reject', postId: rejectId, note: 'Wrong date' });
assert.equal(r.status, 200);
assert.equal((await q(`select status, decision_note from scheduled_posts where id='${rejectId}'`))[0].status, 'canceled');
assert.equal((await q(`select status from publish_jobs where post_id='${rejectId}'`))[0].status, 'canceled');
// A member can withdraw their own pending post, not someone else's
r = await call({ action: 'publish', clientId: 'pk-works', text: 'Withdraw me', platforms: ['facebook'], scheduleDate: new Date(future).toISOString() }, 'user');
r = await call({ action: 'cancel-post', postId: r.payload.post.id }, 'user');
assert.equal(r.status, 200, JSON.stringify(r.payload));
r = await call({ action: 'cancel-post', postId: heldId }, 'user');
assert.equal(r.status, 403);

// --- Reschedule shifts the post and its comments ---
r = await call({ action: 'reschedule-post', postId: heldId, scheduleDate: new Date(future + 7200000).toISOString() });
assert.equal(r.status, 200, JSON.stringify(r.payload));
assert.equal(new Date((await q(`select run_at from publish_jobs where post_id='${heldId}'`))[0].run_at).getTime(), future + 7200000);
r = await call({ action: 'reschedule-post', postId: postId, scheduleDate: new Date(future).toISOString() });
assert.equal(r.status, 409, 'published posts cannot move');

// --- Failures: auth error, temporary error, unknown outcome ---
r = await call({ action: 'publish', clientId: 'pk-works', text: 'Failure test', platforms: ['facebook', 'pinterest', 'linkedin'], mediaUrls: ['https://cdn.example.com/kit.jpg'] });
assert.equal(r.status, 200, JSON.stringify(r.payload));
const failId = r.payload.post.id;
networkHandler = (c) => {
  if (c.url.includes('graph.facebook.com')) return reply({ error: { message: 'Error validating access token', code: 190 } }, 400);
  if (c.url === 'https://api.pinterest.com/v5/pins') return reply({ message: 'Service unavailable' }, 503);
  if (c.url === 'https://cdn.example.com/kit.jpg') return new Response(kitJpeg, { headers: { 'content-type': 'image/jpeg' } });
  if (c.url.includes('initializeUpload')) return reply({ value: { uploadUrl: 'https://upload.linkedin.test/2', image: 'urn:li:image:2' } });
  if (c.url === 'https://upload.linkedin.test/2') return new Response('', { status: 201 });
  if (c.url === 'https://api.linkedin.com/rest/posts') { const error = new Error('timeout'); error.name = 'TimeoutError'; throw error; }
  throw new Error('unexpected ' + c.url);
};
r = await runCron(true);
jobs = await q(`select platform, status, error_kind, attempts, run_at > now() as later, sent_at is not null as sent from publish_jobs where post_id='${failId}' order by platform`);
assert.deepEqual(jobs.map((j) => `${j.platform}:${j.status}:${j.error_kind}`), ['facebook:failed:auth', 'linkedin:unknown:unknown', 'pinterest:queued:temporary']);
assert.ok(jobs[2].later, 'temporary errors retry later');
assert.ok(jobs[1].sent, 'unknown keeps the sent marker');
assert.equal((await q(`select status from social_connections where platform='facebook'`))[0].status, 'needs_reauth');
assert.equal((await q(`select status from scheduled_posts where id='${failId}'`))[0].status, 'publishing');
const failNotes = await q(`select type, title from notifications where category='publishing' order by type`);
assert.deepEqual(failNotes.map((n) => n.type), ['publish_failed', 'publish_unknown']);
r = await call({ action: 'publish', clientId: 'pk-works', text: 'Blocked', platforms: ['facebook'] });
assert.equal(r.status, 400);
assert.match(r.payload.error, /Reconnect Facebook/);
const unknownJob = (await q(`select id from publish_jobs where post_id='${failId}' and platform='linkedin'`))[0].id;
r = await call({ action: 'retry-job', jobId: unknownJob });
assert.equal(r.status, 409);
r = await call({ action: 'retry-job', jobId: unknownJob, confirmed: true });
assert.equal(r.status, 200);
const fbJob = (await q(`select id from publish_jobs where post_id='${failId}' and platform='facebook'`))[0].id;
r = await call({ action: 'retry-job', jobId: fbJob });
assert.equal(r.status, 400, 'reconnect before retrying');

// --- Stale locks: requeue if nothing was sent, flag if it was ---
await db.exec(`update publish_jobs set status='publishing', locked_at=now()-interval '20 minutes', sent_at=null where post_id='${failId}' and platform='pinterest';
update publish_jobs set status='publishing', locked_at=now()-interval '20 minutes', sent_at=now() where post_id='${failId}' and platform='linkedin';`);
await q(`select * from claim_publish_jobs(0, gen_random_uuid())`);
jobs = await q(`select platform, status from publish_jobs where post_id='${failId}' order by platform`);
assert.deepEqual(jobs.map((j) => `${j.platform}:${j.status}`), ['facebook:failed', 'linkedin:unknown', 'pinterest:queued']);

// --- Instagram video waits for processing without using attempts ---
await db.exec(`update social_connections set status='active'`);
r = await call({ action: 'publish', clientId: 'pk-works', text: 'Reel', platforms: ['instagram'], mediaUrls: ['https://cdn.example.com/reel.mp4'] });
const reelId = r.payload.post.id;
await db.exec(`update publish_jobs set status='canceled' where post_id <> '${reelId}' and status in ('queued','held')`);
let reelStatus = 'IN_PROGRESS';
networkHandler = (c) => {
  const u = new URL(c.url);
  if (u.pathname.endsWith('/ig1/media')) { assert.equal(body(c).media_type, 'REELS'); return reply({ id: 'reel-container' }); }
  if (u.pathname.endsWith('/reel-container')) return reply({ status_code: reelStatus });
  if (u.pathname.endsWith('/media_publish')) return reply({ id: 'reel1' });
  if (u.pathname.endsWith('/reel1')) return reply({ permalink: 'https://www.instagram.com/reel/1/' });
  throw new Error('unexpected ' + c.url);
};
r = await runCron(true);
assert.equal(r.payload.publishing.pending, 1, JSON.stringify(r.payload));
let reel = (await q(`select status, attempts, stage from publish_jobs where post_id='${reelId}'`))[0];
assert.equal(reel.status, 'queued');
assert.equal(reel.attempts, 0);
assert.equal(reel.stage.containers.parent, 'reel-container');
reelStatus = 'FINISHED';
await db.exec(`update publish_jobs set run_at=now() where post_id='${reelId}'`);
const containerCalls = external.filter((c) => c.url.endsWith('/ig1/media')).length;
r = await runCron(true);
assert.equal(r.payload.publishing.published, 1, JSON.stringify(r.payload));
assert.equal(external.filter((c) => c.url.endsWith('/ig1/media')).length, containerCalls, 'container is reused, not recreated');

// --- Ayrshare covers other networks when configured ---
process.env.AYRSHARE_API_KEY = 'ayr';
const { encryptSecret } = require(`${ROOT}/api/_lib/core.js`);
await db.exec(`insert into social_profiles (workspace_id, client_id, ayrshare_ref_id, profile_key_ciphertext) values ('${WS}','pk-works','ref','${encryptSecret('profile-key', key)}')`);
r = await call({ action: 'publish', clientId: 'pk-works', text: 'TikTok test', platforms: ['tiktok', 'facebook'], mediaUrls: ['https://cdn.example.com/a.mp4'] });
assert.equal(r.status, 200, JSON.stringify(r.payload));
assert.deepEqual(r.payload.post.destinations, [{ platform: 'tiktok', provider: 'ayrshare' }, { platform: 'facebook', provider: 'direct' }]);
networkHandler = (c) => {
  if (c.url === 'https://api.ayrshare.com/api/post') {
    const b = body(c);
    assert.equal(c.headers['Profile-Key'], 'profile-key');
    assert.deepEqual(b.platforms, ['tiktok']);
    assert.equal(b.scheduleDate, undefined, 'SignalDesk schedules, Ayrshare publishes now');
    assert.match(b.idempotencyKey, /^[0-9a-f-]{36}$/);
    return reply({ status: 'success', id: 'ayr1', postIds: [{ platform: 'tiktok', status: 'success', postUrl: 'https://tiktok.com/@x/1' }] });
  }
  if (c.url.includes('/page1/videos')) return reply({ id: 'video1' });
  throw new Error('unexpected ' + c.url);
};
r = await runCron(true);
assert.equal(r.payload.publishing.published, 2, JSON.stringify(r.payload));
assert.equal((await q(`select external_url from publish_jobs where platform='tiktok'`))[0].external_url, 'https://tiktok.com/@x/1');

// --- Token upkeep: Pinterest refreshes, LinkedIn without a refresh token warns ---
await db.exec(`update social_connections set token_expires_at = now() + interval '2 days' where platform in ('pinterest','linkedin')`);
networkHandler = (c) => {
  if (c.url === 'https://api.pinterest.com/v5/oauth/token') { assert.equal(body(c).grant_type, 'refresh_token'); return reply({ access_token: 'pin-token-2', expires_in: 2592000 }); }
  throw new Error('unexpected ' + c.url);
};
const { maintainConnections } = require(`${ROOT}/api/_lib/publishing.js`);
const upkeep = await maintainConnections({ encryptionKey: key });
assert.deepEqual(upkeep, { refreshed: 1, warned: 1, expired: 0 });
assert.equal((await q(`select count(*)::int n from notifications where type='connection_expiring'`))[0].n, 1);
assert.deepEqual(await maintainConnections({ encryptionKey: key }), { refreshed: 0, warned: 0, expired: 0 }, 'warns once');
await db.exec(`update social_connections set token_expires_at = now() - interval '1 minute' where platform='linkedin'`);
assert.deepEqual(await maintainConnections({ encryptionKey: key }), { refreshed: 0, warned: 0, expired: 1 });
assert.equal((await q(`select status from social_connections where platform='linkedin'`))[0].status, 'needs_reauth');

// --- Disconnect ---
r = await call({ action: 'disconnect', clientId: 'pk-works', platform: 'pinterest' });
assert.equal(r.status, 200);
assert.equal((await q(`select count(*)::int n from social_connections where platform='pinterest'`))[0].n, 0);

// --- Command Center summary and worker health ---
await db.exec(`update publish_jobs set metrics='{"likes":10,"comments":2,"shares":1}', metrics_at=now() where external_id='page1_post1'`);
r = await call({ action: 'overview' }, 'user');
assert.equal(r.status, 200, JSON.stringify(r.payload));
assert.equal(r.payload.engagement.total, 13);
assert.equal(r.payload.engagement.byPlatform.facebook, 13);
assert.equal(r.payload.engagement.daily.length, 30);
assert.equal(r.payload.engagement.daily.at(-1).engagements, 13);
assert.equal(r.payload.worker.stale, false, 'cron runs were recorded');
assert.deepEqual(r.payload.connections.reauth.map((c) => c.platform), ['linkedin']);
await db.exec(`update worker_runs set last_run_at = now() - interval '2 hours' where name='publish'`);
r = await call({ action: 'publish', clientId: 'pk-works', text: 'Stuck post', platforms: ['facebook'], scheduleDate: new Date(Date.now() + 60000).toISOString() });
const stuckId = r.payload.post.id;
await db.exec(`update publish_jobs set run_at = now() - interval '1 hour' where post_id='${stuckId}'`);
r = await call({ action: 'overview' });
assert.equal(r.payload.worker.stale, true);
assert.equal((await q(`select count(*)::int n from notifications where type='worker_stalled'`))[0].n, 1);
r = await call({ action: 'overview' });
assert.equal((await q(`select count(*)::int n from notifications where type='worker_stalled'`))[0].n, 1, 'alerts at most every 12 hours');
await db.exec(`update publish_jobs set status='canceled' where post_id='${stuckId}'`);

// --- Editing a scheduled post replaces it ---
r = await call({ action: 'publish', clientId: 'pk-works', text: 'Original copy', platforms: ['facebook', 'instagram'], mediaUrls: ['https://cdn.example.com/kit.jpg'], scheduleDate: new Date(future).toISOString(), options: { followUpComments: [{ comment: 'Later', delayMinutes: 60 }] } });
const editId = r.payload.post.id;
r = await call({ action: 'update-post', postId: editId, clientId: 'pk-works', text: 'Edited copy', platforms: ['facebook'], scheduleDate: new Date(future + 600000).toISOString() });
assert.equal(r.status, 200, JSON.stringify(r.payload));
assert.equal(r.payload.replaced, editId);
const editedId = r.payload.post.id;
assert.equal((await q(`select count(*)::int n from scheduled_posts where id='${editId}'`))[0].n, 0, 'original removed');
assert.equal((await q(`select count(*)::int n from scheduled_comments c join publish_jobs j on j.id=c.job_id where j.post_id='${editId}'`))[0].n, 0);
const edited = (await q(`select content, status from scheduled_posts where id='${editedId}'`))[0];
assert.equal(edited.content.text, 'Edited copy');
assert.deepEqual((await q(`select platform from publish_jobs where post_id='${editedId}'`)).map((j) => j.platform), ['facebook']);
r = await call({ action: 'update-post', postId: editedId, clientId: 'pk-works', text: 'Sneaky', platforms: ['facebook'], scheduleDate: new Date(future).toISOString() }, 'user');
assert.equal(r.status, 403, 'users cannot edit scheduled posts');
r = await call({ action: 'update-post', postId: postId, clientId: 'pk-works', text: 'x', platforms: ['facebook'], scheduleDate: new Date(future).toISOString() });
assert.equal(r.status, 409, 'published posts cannot be edited');
await db.exec(`update scheduled_posts set scheduled_for = now() + interval '1 minute' where id='${editedId}'`);
r = await call({ action: 'update-post', postId: editedId, clientId: 'pk-works', text: 'Late edit', platforms: ['facebook'], scheduleDate: new Date(future).toISOString() });
assert.equal(r.status, 409);
assert.match(r.payload.error, /about to publish/);
r = await call({ action: 'update-post', clientId: 'pk-works', text: 'x', platforms: ['facebook'] });
assert.equal(r.status, 400);
// A member can edit their own pending post; it stays pending and keeps its author
r = await call({ action: 'publish', clientId: 'pk-works', text: 'Member draft', platforms: ['facebook'], scheduleDate: new Date(future).toISOString() }, 'user');
r = await call({ action: 'update-post', postId: r.payload.post.id, clientId: 'pk-works', text: 'Member draft v2', platforms: ['facebook'], scheduleDate: new Date(future).toISOString() }, 'user');
assert.equal(r.status, 200, JSON.stringify(r.payload));
assert.equal(r.payload.status, 'pending_approval');
assert.equal((await q(`select created_by from scheduled_posts where id='${r.payload.post.id}'`))[0].created_by, USER);

// --- Metrics refresh for recent direct posts ---
const { refreshRecentMetrics } = require(`${ROOT}/api/_lib/publishing.js`);
networkHandler = (c) => {
  const u = new URL(c.url);
  if (u.pathname.endsWith('/igmedia1/insights')) return reply({ data: [{ name: 'views', values: [{ value: 500 }] }, { name: 'reach', values: [{ value: 400 }] }, { name: 'likes', values: [{ value: 40 }] }, { name: 'total_interactions', values: [{ value: 55 }] }] });
  if (u.pathname.endsWith('/reel1/insights')) return reply({ data: [{ name: 'views', values: [{ value: 90 }] }] });
  if (u.pathname.endsWith('/video1')) return reply({ reactions: { summary: { total_count: 3 } }, comments: { summary: { total_count: 1 } } });
  if (u.pathname.endsWith('/video1/insights')) return reply({ error: { message: 'deprecated', code: 100 } }, 400);
  throw new Error('unexpected ' + c.url);
};
const refreshed = await refreshRecentMetrics({ encryptionKey: key, limit: 10 });
assert.ok(refreshed.refreshed >= 2, JSON.stringify(refreshed));
assert.equal((await q(`select metrics from publish_jobs where external_id='igmedia1'`))[0].metrics.engagements, 55);
assert.equal((await q(`select metrics from publish_jobs where external_id='video1'`))[0].metrics.likes, 3);

// --- Media cleanup deletes only old, unreferenced uploads ---
const STORE = 'https://sb.test/storage/v1/object/public/social-media/';
await db.exec(`insert into user_drafts (user_id, workspace_id, draft) values ('${ADMIN}','${WS}','{"uploadedMedia":[{"path":"u1/kept%20draft.jpg","url":"${STORE}u1/kept%20draft.jpg"}]}')`);
await db.exec(`update scheduled_posts set content = jsonb_set(content, '{media}', '["${STORE}u1/scheduled.jpg"]') where id='${editedId}'`);
const old = new Date(Date.now() - 40 * 86400000).toISOString(), fresh = new Date(Date.now() - 86400000).toISOString();
let deleted = null;
networkHandler = (c) => {
  if (c.url === 'https://sb.test/storage/v1/object/list/social-media') {
    const prefix = body(c).prefix;
    if (prefix === '') return reply([{ name: 'u1', id: null }]);
    if (prefix === 'u1') return reply([
      { name: 'unused.jpg', id: 'a', created_at: old }, { name: 'kept draft.jpg', id: 'b', created_at: old },
      { name: 'scheduled.jpg', id: 'c', created_at: old }, { name: 'new.jpg', id: 'd', created_at: fresh }
    ]);
  }
  if (c.url === 'https://sb.test/storage/v1/object/social-media' && c.method === 'DELETE') { deleted = body(c).prefixes; return reply([]); }
  throw new Error('unexpected ' + c.method + ' ' + c.url);
};
const { cleanupMedia } = require(`${ROOT}/api/_lib/media.js`);
const cleaned = await cleanupMedia();
assert.deepEqual(deleted, ['u1/unused.jpg']);
assert.equal(cleaned.deleted, 1);
// The full worker runs cleanup at most once a day
deleted = null;
networkHandler = (c) => {
  if (c.url.startsWith('https://sb.test/storage/')) { if (c.method === 'DELETE') deleted = 'again'; return reply([]); }
  throw new Error('unexpected ' + c.url);
};
r = await runCron();
assert.equal(r.status, 200, JSON.stringify(r.payload));
assert.ok(r.payload.media, 'first full run cleans up');
r = await runCron();
assert.equal(r.payload.media, null, 'second run skips cleanup');

// --- Campaigns, link tracking, queues, and evergreen posts ---
await db.exec(`update workspace_state set state = jsonb_set(state, '{clients}', '[{"id":"pk-works","name":"PK Works","brand":{"watchTerms":"PK Works, #pkworks","colors":["#336699"]},"queue":{"days":[0,1,2,3,4,5,6],"times":["09:00","15:00"],"recycleDays":14}}]')`);
await db.exec(`update social_connections set status='active'`);
r = await call({ action: 'publish', clientId: 'pk-works', text: 'Fall sale https://pkworks.com/sale. Also https://pkworks.com/?utm_source=x', platforms: ['facebook', 'instagram'], mediaUrls: ['https://cdn.example.com/kit.jpg'], scheduleDate: new Date(future).toISOString(), campaign: '  Fall   Launch ', evergreen: true, options: { utm: true } });
assert.equal(r.status, 200, JSON.stringify(r.payload));
const tagged = (await q(`select campaign, evergreen, content from scheduled_posts where id='${r.payload.post.id}'`))[0];
assert.equal(tagged.campaign, 'Fall Launch');
assert.equal(tagged.evergreen, true);
assert.deepEqual(tagged.content.platformContent, {}, 'saved copy stays untagged');
const { tagLinks } = require(`${ROOT}/api/_lib/publishing.js`);
assert.equal(tagLinks('Fall sale https://pkworks.com/sale. Also https://pkworks.com/?utm_source=x', { source: 'facebook', campaign: 'Fall Launch' }), 'Fall sale https://pkworks.com/sale?utm_source=facebook&utm_medium=social&utm_campaign=fall-launch. Also https://pkworks.com/?utm_source=x');
// Tags are added per network when the post goes out
r = await call({ action: 'publish', clientId: 'pk-works', text: 'Read https://pkworks.com/blog', platforms: ['facebook'], campaign: 'Blog', options: { utm: true } });
const utmPostId = r.payload.post.id;
await db.exec(`update publish_jobs set run_at = now() + interval '30 days' where status='queued' and post_id <> '${utmPostId}'`);
let sentMessage = null;
networkHandler = (c) => { if (c.url.includes('/page1/feed')) { sentMessage = body(c).message; return reply({ id: 'page1_utm' }); } throw new Error('unexpected ' + c.url); };
r = await runCron(true);
assert.equal(sentMessage, 'Read https://pkworks.com/blog?utm_source=facebook&utm_medium=social&utm_campaign=blog');
r = await call({ action: 'next-slot', clientId: 'pk-works' }, 'user');
assert.equal(r.status, 200, JSON.stringify(r.payload));
const slot = new Date(r.payload.slot);
assert.ok([9, 15].includes(Number(slot.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }))), r.payload.slot);
r = await call({ action: 'publish', clientId: 'pk-works', text: 'Queued one', platforms: ['facebook'], queue: true });
assert.equal(r.payload.post.scheduledFor, slot.toISOString());
r = await call({ action: 'publish', clientId: 'pk-works', text: 'Queued two', platforms: ['facebook'], queue: true });
assert.notEqual(r.payload.post.scheduledFor, slot.toISOString(), 'the next post takes the next open slot');
// Evergreen: a published evergreen post is copied back into the queue once
const { recycleEvergreen } = require(`${ROOT}/api/_lib/publishing.js`);
const evergreenId = (await q(`select id from scheduled_posts where campaign='Fall Launch'`))[0].id;
await db.exec(`update publish_jobs set status='published', external_id='x' where post_id='${evergreenId}'`);
assert.equal((await q(`select status from scheduled_posts where id='${evergreenId}'`))[0].status, 'published');
assert.deepEqual(await recycleEvergreen({ encryptionKey: key }), { recycled: 1 });
assert.deepEqual(await recycleEvergreen({ encryptionKey: key }), { recycled: 0 }, 'recycled once');
const copy = (await q(`select scheduled_for, evergreen, campaign, content from scheduled_posts where campaign='Fall Launch' and id <> '${evergreenId}'`))[0];
assert.equal(copy.evergreen, true);
assert.ok(copy.scheduled_for.getTime() >= future + 14 * 86400000 - 60000, 'rests 14 days');
assert.equal(copy.content.text, tagged.content.text);

// Copying posts a week later: same local time, approval state kept, comments and options carried over.
r = await call({ action: 'publish', clientId: 'pk-works', text: 'Week one post', platforms: ['facebook'], scheduleDate: new Date(future).toISOString(), options: { firstComment: 'Link in bio' } });
const weekOne = r.payload.post.id;
r = await call({ action: 'publish', clientId: 'pk-works', text: 'Week one draft', platforms: ['facebook'], scheduleDate: new Date(future + 3600000).toISOString(), requiresApproval: true });
const weekOneHeld = r.payload.post.id;
r = await call({ action: 'copy-posts', postIds: [weekOne, weekOneHeld], offsetDays: 7 }, 'user');
assert.equal(r.status, 403, 'only admins copy posts');
r = await call({ action: 'copy-posts', postIds: [weekOne], offsetDays: 0 });
assert.equal(r.status, 400);
r = await call({ action: 'copy-posts', postIds: [weekOne, weekOneHeld], offsetDays: 7 });
assert.equal(r.status, 200, JSON.stringify(r.payload));
assert.equal(r.payload.created.length, 2);
const copies = await q(`select id, status, scheduled_for, content, options from scheduled_posts where id in ('${r.payload.created.map((c) => c.id).join("','")}') order by scheduled_for`);
assert.equal(copies[0].scheduled_for.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }), new Date(future).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }), 'same local time');
assert.ok(Math.abs(copies[0].scheduled_for.getTime() - future - 7 * 86400000) <= 3600000, 'a week later');
assert.deepEqual(copies.map((c) => c.status), ['scheduled', 'pending_approval']);
assert.equal(copies[0].content.text, 'Week one post');
assert.equal(copies[0].options.firstComment.comment, 'Link in bio');
assert.equal((await q(`select count(*)::int as n from publish_jobs where post_id='${copies[0].id}'`))[0].n, 1);

// --- Notes, review links, and client decisions ---
r = await call({ action: 'publish', clientId: 'pk-works', text: 'Needs client OK', platforms: ['facebook'], scheduleDate: new Date(future).toISOString(), requiresApproval: true });
const reviewPostId = r.payload.post.id;
r = await call({ action: 'add-note', postId: reviewPostId, body: 'Internal: double-check the price' }, 'user');
assert.equal(r.status, 200, JSON.stringify(r.payload));
r = await call({ action: 'create-review-link', clientId: 'pk-works', label: 'Oct review', days: 14 });
assert.equal(r.status, 200, JSON.stringify(r.payload));
const reviewToken = r.payload.token;
assert.ok(!(await q(`select token_hash from review_links`))[0].token_hash.includes(reviewToken), 'only the hash is stored');
r = await call({ action: 'create-review-link', clientId: 'pk-works' }, 'user');
assert.equal(r.status, 403);
const review = require(`${ROOT}/api/review.js`);
async function reviewCall(payload) {
  let status, out; const res = { status(s) { status = s; return this; }, json(p) { out = p; }, setHeader() {} };
  await review({ method: 'POST', body: payload, headers: {} }, res); return { status, payload: out };
}
r = await reviewCall({ token: 'nope'.repeat(12), action: 'load' });
assert.equal(r.status, 404);
r = await reviewCall({ token: reviewToken, action: 'load' });
assert.equal(r.status, 200, JSON.stringify(r.payload));
assert.equal(r.payload.client.name, 'PK Works');
assert.equal(r.payload.client.color, '#336699');
const reviewed = r.payload.posts.find((p) => p.id === reviewPostId);
assert.equal(reviewed.status, 'waiting');
assert.deepEqual(reviewed.notes, [], 'internal notes stay internal');
assert.ok(r.payload.posts.every((p) => p.versions.length), 'every post shows its networks');
assert.ok(!JSON.stringify(r.payload).includes('created_by'));
r = await reviewCall({ token: reviewToken, action: 'decide', postId: reviewPostId, decision: 'changes_requested', name: 'Dana (client)' });
assert.equal(r.status, 400, 'changes need a comment');
r = await reviewCall({ token: reviewToken, action: 'decide', postId: reviewPostId, decision: 'changes_requested', name: 'Dana (client)', comment: 'Use the new logo' });
assert.equal(r.status, 200);
assert.equal((await q(`select client_status, status from scheduled_posts where id='${reviewPostId}'`))[0].client_status, 'changes_requested');
r = await reviewCall({ token: reviewToken, action: 'decide', postId: reviewPostId, decision: 'approved', name: 'Dana (client)' });
assert.equal(r.payload.released, true);
const afterReview = (await q(`select client_status, status from scheduled_posts where id='${reviewPostId}'`))[0];
assert.deepEqual([afterReview.client_status, afterReview.status], ['approved', 'scheduled']);
assert.equal((await q(`select count(*)::int n from notifications where type='client_review'`))[0].n, 2);
r = await reviewCall({ token: reviewToken, action: 'decide', postId: postId, decision: 'approved', name: 'Dana' });
assert.equal(r.status, 404, 'published posts are not reviewable');
r = await call({ action: 'post-notes', postId: reviewPostId });
assert.deepEqual(r.payload.notes.map((n) => `${n.kind}:${n.decision || ''}`), ['team:', 'client:changes_requested', 'client:approved']);
// Editing keeps the conversation but clears the client's decision
r = await call({ action: 'update-post', postId: reviewPostId, clientId: 'pk-works', text: 'Needs client OK v2', platforms: ['facebook'], scheduleDate: new Date(future).toISOString() });
const revisedId = r.payload.post.id;
assert.equal((await q(`select count(*)::int n from post_notes where post_id='${revisedId}'`))[0].n, 3);
assert.equal((await q(`select client_status from scheduled_posts where id='${revisedId}'`))[0].client_status, null);
const linkId = (await q(`select id from review_links`))[0].id;
r = await call({ action: 'review-links', clientId: 'pk-works' });
assert.equal(r.payload.links.length, 1);
assert.ok(r.payload.links[0].last_used_at);
r = await call({ action: 'revoke-review-link', id: linkId });
r = await reviewCall({ token: reviewToken, action: 'load' });
assert.equal(r.status, 404, 'revoked links stop working');

// --- Client report filtered by campaign ---
await db.exec(`update publish_jobs set provider='direct', published_at=now() - interval '1 day', metrics='{"likes":5,"comments":1}', metrics_at=now() where post_id='${evergreenId}'`);
r = await call({ action: 'client-report', clientId: 'pk-works', start: new Date(Date.now() - 30 * 86400000).toISOString(), end: new Date(Date.now() + 86400000).toISOString(), campaign: 'Fall Launch' });
assert.equal(r.status, 200, JSON.stringify(r.payload));
assert.ok(r.payload.report.rows.length >= 1 && r.payload.report.rows.every((row) => row.campaign === 'Fall Launch'), JSON.stringify(r.payload.report.rows.map((x) => x.campaign)));
assert.equal(r.payload.report.totals.likes, 5 * r.payload.report.rows.length);
r = await call({ action: 'client-report', clientId: 'pk-works', start: '2026-01-01', end: '2026-12-31' });
assert.equal(r.status, 400, 'periods are capped at about 3 months');

// --- Comments on published posts ---
const igJob = (await q(`select id from publish_jobs where external_id='igmedia1'`))[0].id;
networkHandler = (c) => {
  const u = new URL(c.url);
  if (u.pathname.endsWith('/igmedia1/comments')) return reply({ data: [{ id: 'c1', text: 'Love it', username: 'fan', timestamp: '2026-10-17T10:00:00+0000', replies: { data: [{ id: 'c2', text: 'Thanks!', username: 'pkworks' }] } }] });
  if (u.pathname.endsWith('/c1/replies')) { assert.equal(body(c).message, 'Glad you like it'); return reply({ id: 'c3' }); }
  throw new Error('unexpected ' + c.url);
};
r = await call({ action: 'job-comments', jobId: igJob });
assert.equal(r.status, 200, JSON.stringify(r.payload));
assert.deepEqual(r.payload.comments.map((c) => `${c.author}:${c.text}:${c.replies.length}`), ['@fan:Love it:1']);
r = await call({ action: 'reply-comment', jobId: igJob, commentId: 'c1', text: 'Glad you like it' });
assert.equal(r.status, 200, JSON.stringify(r.payload));
r = await call({ action: 'job-comments', jobId: igJob }, 'user');
assert.equal(r.status, 403);
const pinJob = (await q(`select id from publish_jobs where external_id='pin1'`))[0].id;
r = await call({ action: 'job-comments', jobId: pinJob });
assert.equal(r.status, 400, 'Pinterest has no comments');

// --- Manual reminders ---
await db.exec(`update publish_jobs set run_at = now() + interval '60 days' where status='queued'`);
r = await call({ action: 'publish', clientId: 'pk-works', text: 'Story: new kits!', platforms: [], manual: ['instagram_story', 'tiktok'], mediaUrls: ['https://cdn.example.com/kit.jpg'] }, 'user');
assert.equal(r.status, 200, JSON.stringify(r.payload));
const manualPostId = r.payload.post.id;
r = await call({ action: 'approve', postId: manualPostId });
r = await call({ action: 'publish', clientId: 'pk-works', text: 'x', platforms: [], manual: ['myspace'] });
assert.equal(r.status, 400);
networkHandler = (c) => { throw new Error('reminders never call a network: ' + c.url); };
r = await runCron(true);
assert.equal(r.payload.publishing.manual, 2, JSON.stringify(r.payload));
const manualJobs = await q(`select id, platform, status from publish_jobs where post_id='${manualPostId}' order by platform`);
assert.deepEqual(manualJobs.map((j) => `${j.platform}:${j.status}`), ['instagram_story:manual_due', 'tiktok:manual_due']);
assert.equal((await q(`select status from scheduled_posts where id='${manualPostId}'`))[0].status, 'publishing');
const dueNotes = await q(`select user_id, title from notifications where type='manual_due' order by title`);
assert.ok(dueNotes.some((n) => n.user_id === USER && /TikTok/.test(n.title)), JSON.stringify(dueNotes));
r = await call({ action: 'manual-done', jobId: manualJobs[0].id, url: 'https://instagram.com/stories/1' }, 'user');
assert.equal(r.status, 200, JSON.stringify(r.payload));
r = await call({ action: 'manual-done', jobId: manualJobs[1].id });
assert.equal((await q(`select status from scheduled_posts where id='${manualPostId}'`))[0].status, 'published');
r = await call({ action: 'manual-done', jobId: manualJobs[1].id });
assert.equal(r.status, 409, 'already done');

// --- Repeats keep local time across daylight saving and support monthly ---
const { zonedToUtc } = require(`${ROOT}/api/_lib/core.js`);
// Start the Monday before the next November clock change (first Sunday of November), so the weekly repeats cross it.
const dstYear = (() => { for (let year = new Date().getFullYear(); ; year += 1) { const firstSunday = 1 + ((7 - new Date(Date.UTC(year, 10, 1)).getUTCDay()) % 7); if (Date.UTC(year, 10, firstSunday - 6) > Date.now() + 2 * 86400000) return { year, firstSunday }; } })();
const startDay = new Date(Date.UTC(dstYear.year, 10, dstYear.firstSunday - 6));
const startNy = zonedToUtc(startDay.getUTCFullYear(), startDay.getUTCMonth() + 1, startDay.getUTCDate(), 10, 0, 'America/New_York');
const weeklyLabels = [0, 7, 14].map((days) => { const d = new Date(startDay.getTime() + days * 86400000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}, 10 AM`; });
r = await call({ action: 'publish', clientId: 'pk-works', text: 'Weekly tip', platforms: ['facebook'], scheduleDate: new Date(startNy).toISOString(), options: { autoRepost: { repeat: 2, days: 7 } } });
assert.equal(r.status, 200, JSON.stringify(r.payload));
const weekly = await q(`select scheduled_for from scheduled_posts where id='${r.payload.post.id}' or parent_id='${r.payload.post.id}' order by scheduled_for`);
assert.deepEqual(weekly.map((row) => row.scheduled_for.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric', hour: 'numeric' })), weeklyLabels);
const jan31Year = new Date().getMonth() === 0 && new Date().getDate() >= 30 ? new Date().getFullYear() + 1 : new Date().getFullYear() + (new Date().getMonth() === 0 ? 0 : 1);
const jan31 = zonedToUtc(jan31Year, 1, 31, 9, 0, 'America/New_York');
r = await call({ action: 'publish', clientId: 'pk-works', text: 'Monthly recap', platforms: ['facebook'], scheduleDate: new Date(jan31).toISOString(), options: { autoRepost: { repeat: 2, every: 'month' } } });
assert.equal(r.status, 200, JSON.stringify(r.payload));
const monthly = await q(`select scheduled_for from scheduled_posts where id='${r.payload.post.id}' or parent_id='${r.payload.post.id}' order by scheduled_for`);
assert.deepEqual(monthly.map((row) => row.scheduled_for.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric', hour: 'numeric' })), ['1/31, 9 AM', '2/28, 9 AM', '3/31, 9 AM']);
r = await call({ action: 'publish', clientId: 'pk-works', text: 'x', platforms: ['facebook'], options: { autoRepost: { repeat: 13, every: 'month' } } });
assert.equal(r.status, 400);

// --- History records each step, including content before an edit ---
r = await call({ action: 'publish', clientId: 'pk-works', text: 'History v1', platforms: ['facebook'], scheduleDate: new Date(future).toISOString() }, 'user');
let historyId = r.payload.post.id;
r = await call({ action: 'update-post', postId: historyId, clientId: 'pk-works', text: 'History v2', platforms: ['facebook'], scheduleDate: new Date(future).toISOString() }, 'user');
historyId = r.payload.post.id;
await call({ action: 'approve', postId: historyId });
await call({ action: 'reschedule-post', postId: historyId, scheduleDate: new Date(future + 3600000).toISOString() });
r = await call({ action: 'post-history', postId: historyId }, 'user');
assert.equal(r.status, 200, JSON.stringify(r.payload));
assert.deepEqual(r.payload.history.map((h) => h.action), ['created', 'edited', 'approved', 'rescheduled']);
assert.equal(r.payload.history[1].detail.previous.text, 'History v1');
assert.equal(r.payload.history[1].actor, 'member@x.com');
assert.equal(r.payload.history[0].actor, 'member@x.com');

// --- Image descriptions reach the networks ---
const altUrl = 'https://cdn.example.com/kit.jpg';
r = await call({ action: 'publish', clientId: 'pk-works', text: 'Alt test', platforms: ['facebook', 'instagram'], mediaUrls: [altUrl], mediaAlt: { [altUrl]: 'A box of school supplies', 'https://not-in-post.example/x.jpg': 'ignored' } });
const altPostId = r.payload.post.id;
assert.deepEqual((await q(`select content from scheduled_posts where id='${altPostId}'`))[0].content.mediaAlt, { [altUrl]: 'A box of school supplies' });
await db.exec(`update publish_jobs set run_at = now() + interval '60 days' where status='queued' and post_id <> '${altPostId}'`);
const altSeen = {};
networkHandler = (c) => {
  const u = new URL(c.url), b = body(c);
  if (u.pathname.endsWith('/page1/photos')) { altSeen.facebook = b.alt_text_custom; return reply({ id: 'p', post_id: 'page1_alt' }); }
  if (u.pathname.endsWith('/ig1/media')) { altSeen.instagram = b.alt_text; return reply({ id: 'altc' }); }
  if (u.pathname.endsWith('/altc')) return reply({ status_code: 'FINISHED' });
  if (u.pathname.endsWith('/media_publish')) return reply({ id: 'igalt' });
  if (u.pathname.endsWith('/igalt')) return reply({ permalink: 'https://instagram.com/p/alt' });
  if (c.url === altUrl) return new Response(kitJpeg, { headers: { 'content-type': 'image/jpeg' } });
  throw new Error('unexpected ' + c.url);
};
r = await runCron(true);
assert.deepEqual(altSeen, { facebook: 'A box of school supplies', instagram: 'A box of school supplies' });

// --- AI caption drafts and alt text ---
process.env.ANTHROPIC_API_KEY = 'sk-test';
const aiRequests = [];
networkHandler = (c) => {
  if (c.url.startsWith('https://api.anthropic.com/v1/messages')) {
    const b = body(c); aiRequests.push(b);
    const isAlt = Array.isArray(b.messages[0].content);
    const text = isAlt ? JSON.stringify({ altText: 'A teacher unpacking a kit' }) : JSON.stringify({ variants: [{ platform: 'facebook', text: 'FB caption' }, { platform: 'instagram', text: 'IG caption #pkworks' }, { platform: 'myspace', text: 'nope' }] });
    return reply({ id: 'msg', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } });
  }
  if (c.url === altUrl) return new Response(Buffer.from('fake-jpeg-bytes'), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  throw new Error('unexpected ' + c.url);
};
r = await call({ action: 'draft-captions', clientId: 'pk-works', idea: 'Fall kits launch Monday', platforms: ['facebook', 'instagram'] }, 'user');
assert.equal(r.status, 200, JSON.stringify(r.payload));
assert.deepEqual(r.payload.variants.map((v) => v.platform), ['facebook', 'instagram']);
assert.match(aiRequests[0].system, /PK Works/);
assert.equal(aiRequests[0].model, 'claude-opus-5-5');
r = await call({ action: 'alt-text', url: altUrl, context: 'Alt test' }, 'user');
assert.equal(r.payload.altText, 'A teacher unpacking a kit');
assert.deepEqual(aiRequests[1].messages[0].content[0], { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: Buffer.from('fake-jpeg-bytes').toString('base64') } });
r = await call({ action: 'alt-text', url: 'http://insecure.example/x.jpg' }, 'user');
assert.equal(r.status, 400);

// --- Link-in-bio pages ---
await db.exec(`update workspace_state set state = jsonb_set(state, '{clients,0,bio}', '{"headline":"Kits for every classroom","links":[{"label":"Shop","url":"https://pkworks.com/shop"},{"label":"Bad","url":"javascript:alert(1)"}]}')`);
r = await call({ action: 'save-bio', clientId: 'pk-works', slug: 'PK-Works' });
assert.equal(r.status, 200, JSON.stringify(r.payload));
assert.equal(r.payload.slug, 'pk-works');
r = await call({ action: 'save-bio', clientId: 'pk-works', slug: 'pk' });
assert.equal(r.status, 400, 'too short');
const bio = require(`${ROOT}/api/bio.js`);
async function bioCall(slug) { let status, out; const res = { status(s) { status = s; return this; }, json(p) { out = p; }, setHeader() {} }; await bio({ method: 'GET', url: `/api/bio?slug=${slug}`, headers: {} }, res); return { status, payload: out }; }
r = await bioCall('pk-works');
assert.equal(r.status, 200, JSON.stringify(r.payload));
assert.equal(r.payload.headline, 'Kits for every classroom');
assert.deepEqual(r.payload.links.map((l) => l.label), ['Shop']);
assert.ok(r.payload.recent.length >= 1 && r.payload.recent.every((item) => item.url.startsWith('https://')), JSON.stringify(r.payload.recent));
r = await bioCall('nobody-here');
assert.equal(r.status, 404);
r = await call({ action: 'save-bio', clientId: 'pk-works', slug: 'pk-works', enabled: false });
r = await bioCall('pk-works');
assert.equal(r.status, 404, 'turned off');

// --- Calendar feed from a review link ---
r = await call({ action: 'publish', clientId: 'pk-works', text: 'Feed check', platforms: ['facebook'], scheduleDate: new Date(Date.now() + 3 * 86400000).toISOString() });
assert.equal(r.status, 200, JSON.stringify(r.payload));
r = await call({ action: 'create-review-link', clientId: 'pk-works', days: 30 });
const feedToken = r.payload.token;
let feedRes = { statusCode: 0, headers: {}, body: '', status(s) { this.statusCode = s; return this; }, json(p) { this.body = JSON.stringify(p); }, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
await review({ method: 'GET', url: `/api/review?format=ics&t=${feedToken}`, headers: {} }, feedRes);
assert.equal(feedRes.headers['content-type'], 'text/calendar; charset=utf-8');
assert.match(feedRes.body, /^BEGIN:VCALENDAR\r\n/);
assert.match(feedRes.body, /SUMMARY:Feed check \(Facebook\)/);
assert.ok(feedRes.body.split('BEGIN:VEVENT').length > 3);

// --- Push subscriptions and delivery ---
r = await call({ action: 'push-config' }, 'user');
assert.equal(r.payload.publicKey, null, 'off until VAPID keys are set');
r = await call({ action: 'push-subscribe', subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'k', auth: 'a' } } }, 'user');
assert.equal(r.status, 200, JSON.stringify(r.payload));
r = await call({ action: 'push-subscribe', subscription: { endpoint: 'http://evil.local/x', keys: { p256dh: 'k', auth: 'a' } } }, 'user');
assert.equal(r.status, 400);
Object.assign(process.env, { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' });
const webpush = require(`${ROOT}/node_modules/web-push`);
const pushed = [];
webpush.setVapidDetails = () => {};
webpush.sendNotification = async (subscription, payload) => { pushed.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) }); };
const { notify } = require(`${ROOT}/api/_lib/notify.js`);
await notify({ workspaceId: WS, audience: 'users', userIds: [USER], type: 'test', category: 'publishing', title: 'Ping', body: 'Hello' });
assert.deepEqual(pushed, [{ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', payload: { title: 'Ping', body: 'Hello', view: null } }]);
webpush.sendNotification = async () => { throw Object.assign(new Error('gone'), { statusCode: 410 }); };
await notify({ workspaceId: WS, audience: 'users', userIds: [USER], type: 'test', category: 'publishing', title: 'Ping 2' });
assert.equal((await q(`select count(*)::int n from push_subscriptions`))[0].n, 0, 'expired subscriptions are removed');
delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;

// --- Monthly client report emails ---
Object.assign(process.env, { RESEND_API_KEY: 're_test', NOTIFY_FROM_EMAIL: 'SignalDesk <hi@x.com>' });
await db.exec(`update workspace_state set state = jsonb_set(state, '{clients,0,reports}', '{"enabled":true,"emails":"dana@client.com, bad-email","day":3}')`);
const emails = [];
networkHandler = (c) => {
  if (c.url === 'https://api.resend.com/emails') { emails.push(body(c)); return reply({ id: 'e' }); }
  if (c.url.includes('graph.facebook.com') || c.url.includes('api.linkedin.com') || c.url.includes('pinterest.com') || c.url.includes('ayrshare')) return reply({}, 500);
  throw new Error('unexpected ' + c.url);
};
const { processClientReports } = require(`${ROOT}/api/_lib/notify.js`);
const nov2 = new Date('2026-11-02T15:00:00Z'), nov3 = new Date('2026-11-03T15:00:00Z');
assert.deepEqual(await processClientReports({ encryptionKey: key, now: nov2 }), { sent: 0, configured: true }, 'not before the chosen day');
assert.deepEqual(await processClientReports({ encryptionKey: key, now: nov3 }), { sent: 1, configured: true });
assert.deepEqual(emails.map((e) => e.to[0]), ['dana@client.com']);
assert.match(emails[0].subject, /PK Works social report: October 2026/);
assert.doesNotMatch(emails[0].html, /Open SignalDesk|bell icon/, 'client emails have no internal links');
assert.deepEqual(await processClientReports({ encryptionKey: key, now: nov3 }), { sent: 0, configured: true }, 'once a month');
delete process.env.RESEND_API_KEY;

// --- Export leaves secrets out ---
r = await call({ action: 'export' });
assert.equal(r.status, 200);
const exported = JSON.stringify(r.payload);
assert.ok(r.payload.posts.length > 5 && r.payload.history.length > 3);
assert.doesNotMatch(exported, /token_ciphertext|token_hash|refresh_token/);
r = await call({ action: 'export' }, 'user');
assert.equal(r.status, 403);

// --- Overview has per-client numbers for goals ---
r = await call({ action: 'overview' });
assert.ok('pk-works' in r.payload.clients, JSON.stringify(r.payload.clients));

// --- Link previews: Facebook gets the link, LinkedIn gets a card from the page's tags ---
{
  await db.exec(`update social_connections set status='active', last_error=null, token_expires_at=now() + interval '50 days' where platform='linkedin'`);
  const ogImage = await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#1a1f3a' } }).png().toBuffer();
  r = await call({ action: 'publish', clientId: 'pk-works', text: "Your small business isn't small to you.\n\nhttps://www.pkworks.co/.", platforms: ['facebook', 'linkedin'] });
  assert.equal(r.status, 200, JSON.stringify(r.payload));
  const previewPost = r.payload.post.id;
  await db.exec(`update publish_jobs set run_at = now() + interval '30 days' where status='queued' and post_id <> '${previewPost}'`);
  let fbParams = null, liBody = null, thumbUploaded = false;
  networkHandler = (c) => {
    const u = new URL(c.url);
    if (u.pathname.endsWith('/page1/feed')) { fbParams = body(c); return reply({ id: 'page1_preview' }); }
    if (c.url === 'https://www.pkworks.co/') return new Response('<html><head><title>Fallback</title><meta property="og:title" content="PK Works &amp; Co — Marketing Leadership"><meta name="description" content="Strategy for small businesses."><meta property="og:image" content="/og-image.png"></head><body>…</body></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (c.url === 'https://www.pkworks.co/og-image.png') return new Response(ogImage, { headers: { 'content-type': 'image/png' } });
    if (c.url.startsWith('https://api.linkedin.com/rest/images?action=initializeUpload')) return reply({ value: { uploadUrl: 'https://upload.linkedin.test/thumb', image: 'urn:li:image:thumb' } });
    if (c.url === 'https://upload.linkedin.test/thumb') { thumbUploaded = true; return new Response('', { status: 201 }); }
    if (c.url === 'https://api.linkedin.com/rest/posts') { liBody = body(c); return reply(null, 201, { 'x-restli-id': 'urn:li:share:preview' }); }
    throw new Error('unexpected ' + c.url);
  };
  await runCron(true);
  assert.equal(fbParams.link, 'https://www.pkworks.co/', 'trailing period is not part of the link');
  assert.match(fbParams.message, /pkworks\.co\/\.$/);
  assert.ok(thumbUploaded, JSON.stringify(await q(`select platform, status, last_error from publish_jobs where post_id='${previewPost}'`)));
  assert.deepEqual(liBody.content, { article: { source: 'https://www.pkworks.co/', title: 'PK Works & Co — Marketing Leadership', description: 'Strategy for small businesses.', thumbnail: 'urn:li:image:thumb' } });
  // A page without tags (or that can't be reached) still posts, with a plain card.
  r = await call({ action: 'publish', clientId: 'pk-works', text: 'Read this https://down.example/post', platforms: ['linkedin'] });
  const plainPost = r.payload.post.id;
  await db.exec(`update publish_jobs set run_at = now() + interval '30 days' where status='queued' and post_id <> '${plainPost}'`);
  networkHandler = (c) => {
    if (c.url === 'https://down.example/post') return new Response('', { status: 503 });
    if (c.url === 'https://api.linkedin.com/rest/posts') { liBody = body(c); return reply(null, 201, { 'x-restli-id': 'urn:li:share:plain' }); }
    throw new Error('unexpected ' + c.url);
  };
  await runCron(true);
  assert.equal((await q(`select status from publish_jobs where post_id='${plainPost}'`))[0].status, 'published');
  assert.deepEqual(liBody.content, { article: { source: 'https://down.example/post', title: 'Read this' } });
}

// --- LinkedIn company Pages through a second app, and network messages shown as written ---
{
  await db.exec(`update workspace_state set state = jsonb_set(state, '{clients}', (state->'clients') || '[{"id":"harbor","name":"Harbor Coffee"}]'::jsonb) where workspace_id = '${WS}'`);
  r = await call({ action: 'oauth-start', clientId: 'harbor', provider: 'linkedin', variant: 'pages' });
  assert.equal(r.status, 503, 'Pages app not set up yet'); assert.match(r.payload.error, /LINKEDIN_PAGES_CLIENT_ID/);
  r = await call({ action: 'accounts', clientId: 'harbor' });
  assert.equal(r.payload.integrations.linkedinPages, false);
  process.env.LINKEDIN_PAGES_CLIENT_ID = 'lp-id'; process.env.LINKEDIN_PAGES_CLIENT_SECRET = 'lp-secret';
  assert.equal((await call({ action: 'accounts', clientId: 'harbor' })).payload.integrations.linkedinPages, true);
  r = await call({ action: 'oauth-start', clientId: 'harbor', provider: 'linkedin', variant: 'pages' });
  assert.equal(r.status, 200, JSON.stringify(r.payload));
  const pagesUrl = new URL(r.payload.url);
  assert.equal(pagesUrl.searchParams.get('client_id'), 'lp-id');
  assert.equal(pagesUrl.searchParams.get('scope'), 'r_organization_admin w_organization_social r_organization_social', 'no openid: the Pages app has only Community Management');
  assert.match(pagesUrl.searchParams.get('state'), /^lp_/);
  const pagesSession = r.payload.sessionId;
  let tokenBody = null;
  networkHandler = (c) => {
    if (c.url === 'https://www.linkedin.com/oauth/v2/accessToken') { tokenBody = body(c); return reply({ access_token: 'lp-token', refresh_token: 'lp-refresh', expires_in: 5184000, refresh_token_expires_in: 31536000, scope: 'r_organization_admin,w_organization_social,r_organization_social' }); }
    if (c.url.startsWith('https://api.linkedin.com/rest/organizationAcls')) return reply({ elements: [{ organization: 'urn:li:organization:777', role: 'ADMINISTRATOR' }] });
    if (c.url === 'https://api.linkedin.com/rest/organizations/777') return reply({ localizedName: 'Harbor Coffee Co.', vanityName: 'harborcoffee' });
    throw new Error('unexpected ' + c.url);
  };
  page = await callback({ state: (await q(`select state from oauth_sessions where id='${pagesSession}'`))[0].state, code: 'lp-code' });
  assert.equal(page.statusCode, 200, page.body);
  assert.deepEqual([tokenBody.client_id, tokenBody.client_secret], ['lp-id', 'lp-secret'], 'the Pages app exchanges its own code');
  r = await call({ action: 'oauth-session', sessionId: pagesSession });
  assert.deepEqual(r.payload.candidates.map((c) => c.key), ['linkedin:urn:li:organization:777'], 'only company Pages, no personal profile');
  r = await call({ action: 'oauth-finish', sessionId: pagesSession, selections: [{ key: 'linkedin:urn:li:organization:777' }] });
  assert.equal(r.status, 200, JSON.stringify(r.payload));
  const pageConn = (await q(`select id, external_id, meta from social_connections where client_id='harbor' and platform='linkedin'`))[0];
  assert.equal(pageConn.external_id, 'urn:li:organization:777'); assert.deepEqual(pageConn.meta, { kind: 'organization', app: 'pages' });
  r = await call({ action: 'accounts', clientId: 'harbor' });
  assert.equal(r.payload.accounts.find((a) => a.platform === 'linkedin').app, 'pages');
  // Renewing the sign-in uses the Pages app too
  const { PROVIDERS } = require(`${ROOT}/api/_lib/platforms.js`);
  networkHandler = (c) => { if (c.url === 'https://www.linkedin.com/oauth/v2/accessToken') { tokenBody = body(c); return reply({ access_token: 'lp-token-2', expires_in: 5184000 }); } throw new Error('unexpected ' + c.url); };
  await PROVIDERS.linkedin.refresh({ refreshToken: 'lp-refresh', meta: { app: 'pages' } });
  assert.equal(tokenBody.client_id, 'lp-id');
  await PROVIDERS.linkedin.refresh({ refreshToken: 'li-refresh', meta: { kind: 'member' } });
  assert.equal(tokenBody.client_id, 'li-id', 'older connections keep using the first app');
  // A Pages sign-in with no Pages you administer explains itself
  r = await call({ action: 'oauth-start', clientId: 'harbor', provider: 'linkedin', variant: 'pages' });
  const emptySession = r.payload.sessionId;
  networkHandler = (c) => { if (c.url === 'https://www.linkedin.com/oauth/v2/accessToken') return reply({ access_token: 'x', expires_in: 100 }); if (c.url.startsWith('https://api.linkedin.com/rest/organizationAcls')) return reply({ elements: [] }); throw new Error('unexpected ' + c.url); };
  page = await callback({ state: (await q(`select state from oauth_sessions where id='${emptySession}'`))[0].state, code: 'x' });
  assert.match(page.body, /didn’t list any company Pages/);
  // Pinterest with no boards: the reason comes through as written, not as a server error
  r = await call({ action: 'oauth-start', clientId: 'harbor', provider: 'pinterest' });
  const boardless = r.payload.sessionId;
  networkHandler = (c) => {
    if (c.url === 'https://api.pinterest.com/v5/oauth/token') return reply({ access_token: 'p', refresh_token: 'r', expires_in: 100 });
    if (c.url.endsWith('/user_account')) return reply({ username: 'newbrand' });
    if (c.url.includes('/boards')) return reply({ items: [] });
    throw new Error('unexpected ' + c.url);
  };
  page = await callback({ state: (await q(`select state from oauth_sessions where id='${boardless}'`))[0].state, code: 'p' });
  r = await call({ action: 'oauth-finish', sessionId: boardless, selections: [{ key: 'pinterest:newbrand' }] });
  assert.equal(r.status, 400, JSON.stringify(r.payload)); assert.match(r.payload.error, /Create a Pinterest board first/);
  assert.equal((await q(`select count(*)::int as n from app_errors where message like '%Pinterest board%'`))[0].n, 0, 'not logged as a server error');
  delete process.env.LINKEDIN_PAGES_CLIENT_ID; delete process.env.LINKEDIN_PAGES_CLIENT_SECRET;
}

// --- Instagram gets a JPEG in its allowed shape ---
{
  const storyPng = await sharp({ create: { width: 1080, height: 1920, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  r = await call({ action: 'publish', clientId: 'pk-works', text: 'Story graphic', platforms: ['instagram'], mediaUrls: ['https://cdn.example.com/story.png'] });
  assert.equal(r.status, 200, JSON.stringify(r.payload));
  const igPost = r.payload.post.id;
  await db.exec(`update publish_jobs set run_at = now() + interval '30 days' where status='queued' and post_id <> '${igPost}'`);
  let uploaded = null, sentImage = null;
  networkHandler = (c) => {
    const u = new URL(c.url);
    if (c.url === 'https://cdn.example.com/story.png') return new Response(storyPng, { headers: { 'content-type': 'image/png' } });
    if (c.url.startsWith('https://sb.test/storage/v1/object/social-media/system/instagram/')) { uploaded = { path: u.pathname, bytes: Buffer.from(c.body), type: c.headers['content-type'] }; return reply({ Key: 'x' }); }
    if (u.pathname.endsWith('/ig1/media')) { sentImage = body(c).image_url; return reply({ id: 'containerStory' }); }
    if (u.pathname.endsWith('/containerStory')) return reply({ status_code: 'FINISHED' });
    if (u.pathname.endsWith('/ig1/media_publish')) return reply({ id: 'igStory' });
    if (u.pathname.endsWith('/igStory')) return reply({ permalink: 'https://www.instagram.com/p/story/' });
    throw new Error('unexpected ' + c.url);
  };
  r = await runCron(true);
  const job = (await q(`select id, status, last_error from publish_jobs where post_id='${igPost}'`))[0];
  assert.equal(job.status, 'published', job.last_error);
  assert.equal(uploaded.type, 'image/jpeg');
  assert.match(uploaded.path, new RegExp(`/system/instagram/${job.id}-0\\.jpg$`));
  const meta = await sharp(uploaded.bytes).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.ok(Math.abs(meta.width / meta.height - 0.8) < 0.01, `${meta.width}x${meta.height}`);
  assert.equal(sentImage, `https://sb.test/storage/v1/object/public/social-media/system/instagram/${job.id}-0.jpg`);
  // A file that isn't an image fails clearly instead of reaching Instagram.
  r = await call({ action: 'publish', clientId: 'pk-works', text: 'Broken', platforms: ['instagram'], mediaUrls: ['https://cdn.example.com/broken.png'] });
  const brokenPost = r.payload.post.id;
  await db.exec(`update publish_jobs set run_at = now() + interval '30 days' where status='queued' and post_id <> '${brokenPost}'`);
  networkHandler = (c) => { if (c.url === 'https://cdn.example.com/broken.png') return new Response(Buffer.from('not an image'), { headers: { 'content-type': 'image/png' } }); throw new Error('unexpected ' + c.url); };
  await runCron(true);
  const broken = (await q(`select status, last_error from publish_jobs where post_id='${brokenPost}'`))[0];
  assert.equal(broken.status, 'failed');
  assert.match(broken.last_error, /Couldn’t prepare image 1 for Instagram/);
}

// --- Tag picker lookups and composer link previews ---
{
  await db.exec(`update social_connections set status='active', last_error=null where platform='instagram'`);
  networkHandler = (c) => {
    const u = new URL(c.url);
    if (u.hostname === 'graph.facebook.com' && u.pathname.endsWith('/ig1')) {
      const fields = u.searchParams.get('fields');
      if (fields.includes('business_discovery.username(acme.co)')) return reply({ business_discovery: { username: 'acme.co', name: 'Acme Co', profile_picture_url: 'https://cdn.test/acme.jpg', followers_count: 1520, media_count: 88 }, id: 'ig1' });
      if (fields.includes('business_discovery.username(someperson)')) return reply({ error: { message: 'Invalid user id', type: 'OAuthException', code: 110, error_subcode: 2207013 } }, 400);
      if (fields.includes('business_discovery.username(busy)')) return reply({ error: { message: 'Application request limit reached', code: 4 } }, 400);
    }
    if (c.url === 'https://www.pkworks.co/') return new Response('<head><meta property="og:title" content="PK Works"><meta property="og:image" content="https://pkworks.co/og.png"></head>', { headers: { 'content-type': 'text/html' } });
    throw new Error('unexpected ' + c.url);
  };
  r = await call({ action: 'ig-lookup', clientId: 'pk-works', username: '@Acme.Co' }, 'user');
  assert.equal(r.status, 200, JSON.stringify(r.payload));
  assert.deepEqual(r.payload, { status: 'found', username: 'acme.co', name: 'Acme Co', picture: 'https://cdn.test/acme.jpg', followers: 1520, posts: 88 });
  r = await call({ action: 'ig-lookup', clientId: 'pk-works', username: 'someperson' }, 'user');
  assert.equal(r.payload.status, 'unverified', 'personal or missing accounts are unverified, not errors');
  r = await call({ action: 'ig-lookup', clientId: 'pk-works', username: 'busy' }, 'user');
  assert.equal(r.payload.status, 'unavailable'); assert.match(r.payload.reason, /limiting/);
  r = await call({ action: 'ig-lookup', clientId: 'pk-works', username: 'bad name!' }, 'user');
  assert.equal(r.status, 400);
  r = await call({ action: 'ig-lookup', clientId: 'bright-school-kits', username: 'acme.co' });
  assert.ok(r.status === 200 && r.payload.status === 'unavailable' || r.status === 404, JSON.stringify(r.payload));
  r = await call({ action: 'link-preview', url: 'https://www.pkworks.co/' }, 'user');
  assert.deepEqual(r.payload.preview, { url: 'https://www.pkworks.co/', title: 'PK Works', description: '', image: 'https://pkworks.co/og.png' });
  r = await call({ action: 'link-preview', url: 'javascript:alert(1)' }, 'user');
  assert.equal(r.status, 400);
}

// --- Click-tracking short links ---
{
  const go = require(`${ROOT}/api/go.js`);
  const visit = async (code, ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [LinkedInApp]', method = 'GET') => {
    const res = { statusCode: 0, headers: {}, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(s) { this.statusCode = s; return this; }, send(b) { this.body = b; return this; }, end() { return this; } };
    await go({ method, url: `/api/go?code=${code}`, headers: { 'user-agent': ua } }, res);
    return res;
  };
  r = await call({ action: 'publish', clientId: 'pk-works', text: 'Shop https://pkworks.com/shop and https://pkworks.com/shop. Blog: https://pkworks.com/blog!', platforms: ['facebook'], campaign: 'Links', options: { utm: true, shortLinks: true } });
  assert.equal(r.status, 200, JSON.stringify(r.payload));
  const linkPostId = r.payload.post.id;
  await db.exec(`update publish_jobs set run_at = now() + interval '30 days' where status='queued' and post_id <> '${linkPostId}'`);
  let message = null;
  networkHandler = (c) => { if (c.url.includes('/page1/feed')) { message = body(c).message; return reply({ id: 'page1_links' }); } throw new Error('unexpected ' + c.url); };
  r = await runCron(true);
  const codes = [...message.matchAll(/https:\/\/signaldesk\.test\/l\/([A-Za-z0-9]+)/g)].map((m) => m[1]);
  assert.equal(codes.length, 3, message);
  assert.equal(codes[0], codes[1], 'the same link reuses its code');
  assert.notEqual(codes[0], codes[2]);
  assert.match(message, /\/l\/[A-Za-z0-9]+!$/, 'trailing punctuation stays outside the link');
  const links = await q(`select code, url, platform, clicks from short_links where post_id='${linkPostId}' order by url`);
  assert.deepEqual(links.map((l) => l.url), ['https://pkworks.com/blog?utm_source=facebook&utm_medium=social&utm_campaign=links', 'https://pkworks.com/shop?utm_source=facebook&utm_medium=social&utm_campaign=links'], 'short links point at the UTM-tagged address');
  const shop = links.find((l) => l.url.includes('/shop')).code;
  let page = await visit(shop);
  assert.equal(page.statusCode, 302); assert.match(page.headers.location, /pkworks\.com\/shop\?utm_source=facebook/);
  await visit(shop);
  page = await visit(shop, 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)');
  assert.equal(page.statusCode, 302, 'robots are still redirected');
  await visit(shop, 'Mozilla/5.0', 'HEAD');
  assert.equal((await q(`select clicks from short_links where code='${shop}'`))[0].clicks, 2, 'robots and HEAD requests are not counted');
  assert.equal((await q(`select sum(clicks)::int as n from link_click_days where code='${shop}'`))[0].n, 2);
  assert.equal((await visit('Nope1234')).statusCode, 404);
  assert.equal((await visit('<script>')).statusCode, 404);
  r = await call({ action: 'posts', from: new Date(Date.now() - 86400000).toISOString(), to: new Date(Date.now() + 86400000).toISOString() });
  assert.equal(r.payload.posts.find((p) => p.id === linkPostId).jobs[0].clicks, 2);
  r = await call({ action: 'overview' });
  assert.equal(r.payload.clicks.total, 2);
  assert.equal(r.payload.clicks.byPlatform.facebook, 2);
  assert.equal(r.payload.clicks.top[0].code, shop); assert.equal(r.payload.clicks.top[0].postTitle.startsWith('Shop'), true);
  // Instagram captions keep their links; a manual reminder's copy gets short links.
  r = await call({ action: 'publish', clientId: 'pk-works', text: 'Reminder https://pkworks.com/x', platforms: [], manual: ['threads'], options: { shortLinks: true }, scheduleDate: new Date(Date.now() + 60000).toISOString() });
  assert.equal(r.status, 200, JSON.stringify(r.payload));
  const manualPost = r.payload.post.id;
  await db.exec(`update publish_jobs set run_at = now() where post_id='${manualPost}'`);
  networkHandler = () => reply({});
  await runCron(true);
  r = await call({ action: 'posts', from: new Date(Date.now() - 86400000).toISOString(), to: new Date(Date.now() + 86400000).toISOString() });
  const manualJob = r.payload.posts.find((p) => p.id === manualPost).jobs[0];
  assert.equal(manualJob.status, 'manual_due');
  assert.match(manualJob.copyText, /^Reminder https:\/\/signaldesk\.test\/l\/[A-Za-z0-9]+$/);
  // If the tables are gone, the post still publishes with its original links.
  await db.exec(`alter table short_links rename to short_links_off`);
  r = await call({ action: 'publish', clientId: 'pk-works', text: 'Fallback https://pkworks.com/f', platforms: ['facebook'], options: { shortLinks: true } });
  const fallbackId = r.payload.post.id;
  await db.exec(`update publish_jobs set run_at = now() + interval '30 days' where status='queued' and post_id <> '${fallbackId}'`);
  networkHandler = (c) => { if (c.url.includes('/page1/feed')) { message = body(c).message; return reply({ id: 'page1_fallback' }); } throw new Error('unexpected ' + c.url); };
  await runCron(true);
  assert.equal(message, 'Fallback https://pkworks.com/f');
  assert.equal((await q(`select status from publish_jobs where post_id='${fallbackId}'`))[0].status, 'published');
  r = await call({ action: 'system-status' });
  assert.equal(r.payload.checks.find((c) => c.key === 'database').status, 'error');
  assert.match(r.payload.checks.find((c) => c.key === 'database').detail, /short_links/);
  await db.exec(`alter table short_links_off rename to short_links`);
}

// --- Setup & health ---
{
  r = await call({ action: 'system-status' }, 'user');
  assert.equal(r.status, 403, 'admins only');
  r = await call({ action: 'system-status' });
  assert.equal(r.status, 200, JSON.stringify(r.payload));
  const byKey = Object.fromEntries(r.payload.checks.map((c) => [c.key, c]));
  assert.equal(byKey.database.status, 'ok');
  assert.equal(byKey['app-url'].status, 'ok');
  assert.equal(byKey.publish.status, 'ok', byKey.publish.detail);
  assert.equal(byKey.meta.status, 'ok'); assert.equal(byKey.pinterest.status, 'ok');
  assert.equal(byKey.stock.status, 'off');
  assert.equal(byKey.links.status, 'ok');
  assert.ok(r.payload.checks.some((c) => c.group === 'accounts'), 'connected accounts are listed');
  assert.ok(Array.isArray(r.payload.problems));
  assert.doesNotMatch(JSON.stringify(r.payload), /meta-secret|li-secret|pin-secret|cron-secret/, 'no secrets');
  const saved = process.env.PINTEREST_APP_SECRET; delete process.env.PINTEREST_APP_SECRET;
  r = await call({ action: 'system-status' });
  assert.equal(r.payload.checks.find((c) => c.key === 'pinterest').status, 'error');
  process.env.PINTEREST_APP_SECRET = saved;
  await db.exec(`insert into oauth_sessions (state, workspace_id, user_id, client_id, provider, status, error, expires_at) select 'failed-state-xyz-1234567890', workspace_id, user_id, 'pk-works', 'linkedin', 'failed', 'The network refused the sign-in: Scope "openid" is not authorized.', now() from oauth_sessions limit 1`);
  await db.exec(`insert into scheduled_comments (workspace_id, client_id, platforms, comment, run_at, status, last_error) select workspace_id, 'pk-works', array['facebook'], 'Hi', now(), 'failed', 'Comment was rejected.' from oauth_sessions limit 1`);
  r = await call({ action: 'system-status' });
  assert.ok(r.payload.problems.some((p) => p.kind === 'sign-in' && /openid/.test(p.detail)), JSON.stringify(r.payload.problems));
  assert.ok(r.payload.problems.some((p) => p.kind === 'comment' && p.title === 'Scheduled comment on Facebook'), JSON.stringify(r.payload.problems));
}

// --- Unsplash stock photos ---
{
  r = await call({ action: 'stock-search', query: 'desk' }, 'user');
  assert.equal(r.status, 503, 'not set up');
  process.env.UNSPLASH_ACCESS_KEY = 'unsplash-key';
  const seen = [];
  const photo = { id: 'abc123XYZ', width: 4000, height: 3000, color: '#c0a080', alt_description: 'a wooden desk with a laptop', urls: { raw: 'https://images.unsplash.com/photo-1?ixid=M3w', regular: 'https://images.unsplash.com/photo-1?w=1080', small: 'https://images.unsplash.com/photo-1?w=400' }, links: { html: 'https://unsplash.com/photos/abc123XYZ', download_location: 'https://api.unsplash.com/photos/abc123XYZ/download?ixid=M3w' }, user: { name: 'Ana Lee', username: 'ana', links: { html: 'https://unsplash.com/@ana' } } };
  networkHandler = (c) => {
    seen.push(c);
    assert.equal(new Headers(c.headers || {}).get('authorization') || c.headers?.authorization, 'Client-ID unsplash-key');
    if (c.url.startsWith('https://api.unsplash.com/search/photos')) return reply({ total: 1, total_pages: 1, results: [photo] });
    if (c.url === 'https://api.unsplash.com/photos/abc123XYZ') return reply(photo);
    if (c.url.startsWith('https://api.unsplash.com/photos/abc123XYZ/download')) return reply({ url: 'x' });
    if (c.url.includes('limited')) return reply({ errors: ['Rate Limit Exceeded'] }, 403);
    throw new Error('unexpected ' + c.url);
  };
  r = await call({ action: 'stock-search', query: ' desk ', orientation: 'squarish' }, 'user');
  assert.equal(r.status, 200, JSON.stringify(r.payload));
  const search = new URL(seen[0].url);
  assert.equal(search.searchParams.get('query'), 'desk'); assert.equal(search.searchParams.get('orientation'), 'squarish'); assert.equal(search.searchParams.get('content_filter'), 'high');
  assert.equal(r.payload.photos[0].photographer, 'Ana Lee');
  assert.match(r.payload.photos[0].photographerUrl, /utm_source=signaldesk&utm_medium=referral/);
  r = await call({ action: 'stock-use', id: 'abc123XYZ' }, 'user');
  assert.equal(r.status, 200, JSON.stringify(r.payload));
  assert.ok(seen.some((c) => c.url.startsWith('https://api.unsplash.com/photos/abc123XYZ/download')), 'download is reported to Unsplash');
  const used = new URL(r.payload.photo.url);
  assert.equal(used.hostname, 'images.unsplash.com'); assert.equal(used.searchParams.get('fm'), 'jpg'); assert.equal(used.searchParams.get('ixid'), 'M3w');
  assert.equal(r.payload.photo.credit, 'Photo by Ana Lee on Unsplash');
  assert.equal(r.payload.photo.alt, 'a wooden desk with a laptop');
  r = await call({ action: 'stock-use', id: '../../me' }, 'user');
  assert.equal(r.status, 400);
  r = await call({ action: 'stock-search', query: '' }, 'user');
  assert.equal(r.status, 400);
  networkHandler = () => reply({ errors: ['Rate Limit Exceeded'] }, 403);
  r = await call({ action: 'stock-search', query: 'desk' }, 'user');
  assert.equal(r.status, 429); assert.match(r.payload.error, /hourly limit/);
  // A stock photo publishes like any other image.
  let message = null;
  networkHandler = (c) => { if (c.url.includes('/page1/photos')) { message = body(c); return reply({ id: 'p', post_id: 'page1_stock' }); } throw new Error('unexpected ' + c.url); };
  r = await call({ action: 'publish', clientId: 'pk-works', text: 'Desk day 📷 Photo by Ana Lee on Unsplash', platforms: ['facebook'], mediaUrls: [used.href] });
  assert.equal(r.status, 200, JSON.stringify(r.payload));
  const stockPost = r.payload.post.id;
  await db.exec(`update publish_jobs set run_at = now() + interval '30 days' where status='queued' and post_id <> '${stockPost}'`);
  await runCron(true);
  assert.equal((await q(`select status, last_error from publish_jobs where post_id='${stockPost}'`))[0].status, 'published', JSON.stringify(await q(`select last_error from publish_jobs where post_id='${stockPost}'`)));
  assert.equal(message.url, used.href);
  delete process.env.UNSPLASH_ACCESS_KEY;
}

// --- Account history: posts from any source, plus audience numbers ---
{
  const { syncDueConnections, syncConnection } = require(`${ROOT}/api/_lib/sync.js`);
  const day = (offset) => new Date(Date.now() - offset * 86400000).toISOString();
  const graphCalls = [];
  networkHandler = (c) => {
    const u = new URL(c.url);
    if (u.hostname === 'graph.facebook.com') {
      graphCalls.push(u.pathname);
      if (u.pathname.endsWith('/page1/published_posts')) {
        assert.ok(u.searchParams.get('appsecret_proof'), 'every Graph call is signed');
        return u.searchParams.get('after') ? reply({ data: [{ id: 'page1_old', message: 'Older', created_time: day(20), reactions: { summary: { total_count: 1 } }, comments: { summary: { total_count: 0 } } }], paging: { cursors: {} } })
          : reply({ data: [{ id: 'page1_post1', message: 'Fall kits are here', created_time: day(2), permalink_url: 'https://facebook.com/page1/posts/1', full_picture: 'https://cdn.test/1.jpg', reactions: { summary: { total_count: 40 } }, comments: { summary: { total_count: 5 } }, shares: { count: 3 } }, { id: 'page1_native', message: 'Posted from the Facebook app', created_time: day(1), reactions: { summary: { total_count: 12 } }, comments: { summary: { total_count: 2 } } }], paging: { cursors: { after: 'CUR' }, next: 'https://graph.facebook.com/next' } });
      }
      if (u.pathname.endsWith('/insights') && u.pathname.includes('page1_')) {
        // page1_old only answers the older metric, to cover the fallback.
        if (u.searchParams.get('metric').includes('post_total_media_view_unique')) return u.pathname.includes('page1_old') ? reply({ error: { message: 'Invalid metric', code: 100 } }, 400) : reply({ data: [{ name: 'post_total_media_view_unique', values: [{ value: 500 }] }, { name: 'post_media_view', values: [{ value: 900 }] }] });
        return reply({ data: [{ name: 'post_impressions_unique', values: [{ value: 70 }] }] });
      }
      if (u.pathname.endsWith('/page1')) return reply({ followers_count: 1200 });
      if (u.pathname.endsWith('/ig1/media')) return reply({ data: [{ id: 'ig_native', caption: 'Reel from the app', media_type: 'VIDEO', thumbnail_url: 'https://cdn.test/t.jpg', permalink: 'https://instagram.com/p/x', timestamp: day(3), like_count: 90, comments_count: 4 }, { id: 'ig_old', timestamp: day(200), media_type: 'IMAGE' }], paging: { cursors: { after: 'A' }, next: 'https://graph.facebook.com/n' } });
      if (u.pathname.endsWith('/ig_native/insights')) return reply({ data: [{ name: 'views', values: [{ value: 3000 }] }, { name: 'reach', values: [{ value: 2000 }] }, { name: 'total_interactions', values: [{ value: 110 }] }] });
      if (u.pathname.endsWith('/ig1/insights')) return reply({ data: [{ name: u.searchParams.get('metric'), total_value: { value: u.searchParams.get('metric') === 'reach' ? 4000 : 9000 } }] });
      if (u.pathname.endsWith('/ig1')) return reply({ followers_count: 2500, media_count: 80 });
    }
    if (c.url.startsWith('https://api.linkedin.com/rest/posts?author=urn%3Ali%3Aorganization%3A777')) return reply({ elements: [{ id: 'urn:li:share:9', commentary: 'Hiring {hashtag|\\#|baristas} now \\(really\\)', publishedAt: Date.parse(day(4)), content: { article: {} } }] });
    if (c.url.startsWith('https://api.linkedin.com/rest/socialActions/urn%3Ali%3Ashare%3A9')) return reply({ likesSummary: { totalLikes: 15 }, commentsSummary: { aggregatedTotalComments: 2 } });
    if (c.url.startsWith('https://api.linkedin.com/rest/networkSizes/')) return reply({ firstDegreeSize: 340 });
    if (c.url.includes('/v5/pins?page_size=100')) return reply({ items: [{ id: 'pin9', title: 'Desk setup', description: 'Ideas', created_at: day(5), media: { media_type: 'image', images: { '600x': { url: 'https://i.pinimg.com/600x/a.jpg' } } } }], bookmark: null });
    if (c.url.includes('/v5/pins/pin9/analytics')) return reply({ all: { lifetime_metrics: { IMPRESSION: 800, SAVE: 12, PIN_CLICK: 30, OUTBOUND_CLICK: 9 } } });
    if (c.url.endsWith('/v5/user_account')) return reply({ follower_count: 75, monthly_views: 10000 });
    throw new Error('unexpected ' + c.url);
  };
  const { encryptSecret: encrypt } = require(`${ROOT}/api/_lib/core.js`);
  await db.exec(`insert into social_connections (workspace_id, client_id, platform, external_id, display_name, token_ciphertext, status) values ('${WS}', 'harbor', 'pinterest', 'harborpins', 'Harbor Pins', '${encrypt('pin-token', key)}', 'active') on conflict (workspace_id, client_id, platform) do nothing`);
  await db.exec(`update social_connections set status='active', last_error=null, synced_at=null`);
  const result = await syncDueConnections({ encryptionKey: key, limit: 10 });
  assert.ok(result.synced >= 4, JSON.stringify(result));
  for (const item of result.results) assert.ok(!item.error, `${item.platform}: ${item.error}`);
  const nposts = await q(`select platform, external_id, client_id, job_id is not null as via_sd, (metrics->>'engagements')::int as eng, (metrics->>'reach')::int as reach, text from network_posts order by platform, external_id`);
  const byId = Object.fromEntries(nposts.map((row) => [row.external_id, row]));
  assert.ok(byId.page1_native && !byId.page1_native.via_sd, 'a post made in the Facebook app is included');
  assert.equal(byId.page1_post1.via_sd, true, 'SignalDesk’s own post is linked to its job');
  assert.equal(byId.page1_post1.eng, 48); assert.equal(byId.page1_post1.reach, 500);
  assert.equal((await q(`select (metrics->>'views')::int as v from network_posts where external_id='page1_post1'`))[0].v, 900, 'views from Meta’s new media view metric');
  assert.equal((await q(`select (metrics->>'reach')::int as r from network_posts where external_id='page1_old'`))[0].r, 70, 'falls back to the older reach metric');
  assert.ok(byId.page1_old, 'later pages are read with the cursor');
  assert.equal(byId.ig_native.reach, 2000); assert.equal(byId.ig_native.eng, 110);
  assert.ok(!byId.ig_old, 'posts older than the window are skipped');
  assert.equal(byId['urn:li:share:9'].text, 'Hiring #baristas now (really)'); assert.equal(byId['urn:li:share:9'].eng, 17);
  assert.equal(byId.pin9.platform, 'pinterest');
  const stats = Object.fromEntries((await q(`select platform, metrics from account_stats`)).map((row) => [row.platform, row.metrics]));
  assert.equal(stats.facebook.followers, 1200); assert.deepEqual([stats.instagram.followers, stats.instagram.reach, stats.instagram.views], [2500, 4000, 9000]);
  assert.equal(stats.pinterest.followers, 75);
  // Each post's numbers are kept once a day; a second sync the same day updates that day's row.
  const tracked = await q(`select external_id, day, (metrics->>'engagements')::int as eng from post_metric_days where external_id='page1_post1'`);
  assert.equal(tracked.length, 1); assert.equal(tracked[0].eng, 48);
  const { recordMetricDays } = require(`${ROOT}/api/_lib/sync.js`);
  const fbConn = (await q(`select id from social_connections where platform='facebook' and client_id='pk-works'`))[0];
  const growthRow = { workspace_id: WS, connection_id: fbConn.id, platform: 'facebook', external_id: 'page1_post1', published_at: new Date(Date.now() - 2 * 86400000).toISOString() };
  await recordMetricDays([{ ...growthRow, metrics: { engagements: 30 } }], Date.now() - 86400000);
  await recordMetricDays([{ ...growthRow, metrics: { engagements: 55 } }]);
  await recordMetricDays([{ ...growthRow, published_at: new Date(Date.now() - 200 * 86400000).toISOString(), external_id: 'too-old', metrics: { engagements: 1 } }]);
  assert.equal((await q(`select count(*)::int as n from post_metric_days where external_id='too-old'`))[0].n, 0, 'only the first 90 days are tracked');
  const growthPost = (await q(`select id from network_posts where external_id='page1_post1'`))[0];
  r = await call({ action: 'post-metrics-history', postId: growthPost.id }, 'user');
  assert.equal(r.status, 200, JSON.stringify(r.payload));
  assert.deepEqual(r.payload.days.map((d) => d.metrics.engagements), [30, 55], 'oldest first, the latest numbers for each day');
  r = await call({ action: 'post-metrics-history', postId: '00000000-0000-4000-8000-000000000000' });
  assert.equal(r.status, 404);
  // Personal LinkedIn profiles can't be read; the reason is kept for Setup & health and the calendar
  const personal = (await q(`select sync_error from social_connections where platform='linkedin' and client_id='pk-works'`))[0];
  assert.match(personal.sync_error, /personal profile/);
  assert.equal((await syncDueConnections({ encryptionKey: key, limit: 10 })).synced, 0, 'not again until 3 hours have passed');
  // Calendar data, filtered by network
  r = await call({ action: 'network-posts', from: day(30), to: new Date(Date.now() + 86400000).toISOString(), platform: 'facebook' }, 'user');
  assert.equal(r.status, 200, JSON.stringify(r.payload));
  assert.deepEqual(r.payload.posts.map((p) => [p.platform, p.viaSignalDesk]).sort(), [['facebook', false], ['facebook', false], ['facebook', true]]);
  assert.ok(r.payload.accounts.some((a) => a.platform === 'linkedin' && /personal profile/.test(a.note || '')));
  // The summary counts posts from every source, once each
  r = await call({ action: 'overview' });
  assert.ok(r.payload.published.total >= 6, JSON.stringify(r.payload.published)); assert.ok(r.payload.published.viaSignalDesk >= 1);
  assert.ok(r.payload.engagement.total >= 48 + 14 + 110 + 17, JSON.stringify(r.payload.engagement.total));
  assert.equal(r.payload.audience.find((a) => a.platform === 'instagram').followers, 2500);
  // Sync now: limited to once every 10 minutes per client
  r = await call({ action: 'sync-now', clientId: 'pk-works' });
  assert.equal(r.status, 429);
  r = await call({ action: 'sync-now', clientId: 'pk-works' }, 'user');
  assert.equal(r.status, 403, 'admins only');
  // An expired sign-in is flagged for reconnecting
  networkHandler = (c) => reply({ error: { message: 'Error validating access token: Session has expired', type: 'OAuthException', code: 190 } }, 400);
  const fb = (await q(`select id, workspace_id, client_id, platform, synced_at from social_connections where platform='facebook'`))[0];
  const failed = await syncConnection(fb, { encryptionKey: key });
  assert.match(failed.error, /expired/);
  assert.equal((await q(`select status from social_connections where id='${fb.id}'`))[0].status, 'needs_reauth');
  await db.exec(`update social_connections set status='active', last_error=null`);
}

// --- Invite-only beta: platform tools, limits, errors, account deletion, brand kit from a website ---
{
  process.env.PLATFORM_ADMIN_EMAILS = 'Owner@x.com';
  process.env.RESEND_API_KEY = 're_test'; process.env.NOTIFY_FROM_EMAIL = 'SignalDesk <hi@signaldesk.test>';
  const mails = [];
  networkHandler = (c) => { if (c.url === 'https://api.resend.com/emails') { mails.push(body(c)); return reply({ id: 'm' }); } throw new Error('unexpected ' + c.url); };
  r = await call({ action: 'platform-status' }, 'user');
  assert.equal(r.status, 403, 'members who are not platform owners are refused');
  r = await call({ action: 'platform-status' });
  assert.equal(r.status, 200, JSON.stringify(r.payload)); assert.equal(r.payload.inviteOnly, true);
  r = await call({ action: 'create-invite', email: 'New.Person@Agency.test', label: 'Agency', maxUses: 3, days: 14 });
  assert.equal(r.status, 200, JSON.stringify(r.payload));
  const code = r.payload.code;
  assert.match(code, /^[A-Z2-9]{8}$/); assert.equal(r.payload.link, `https://signaldesk.test/?invite=${code}`); assert.equal(r.payload.emailed, true);
  assert.equal(mails[0].to[0], 'new.person@agency.test'); assert.match(mails[0].html, new RegExp(code)); assert.match(mails[0].html, /\?invite=/);
  r = await call({ action: 'create-invite', email: 'not-an-email' });
  assert.equal(r.status, 400);
  r = await call({ action: 'platform-status' });
  const listed = r.payload.invites.find((invite) => invite.code === code);
  assert.deepEqual([listed.maxUses, listed.uses, listed.status, listed.label], [3, 0, 'active', 'Agency']);
  r = await call({ action: 'revoke-invite', code });
  assert.equal((await call({ action: 'platform-status' })).payload.invites.find((invite) => invite.code === code).status, 'revoked');
  r = await call({ action: 'set-invite-only', inviteOnly: false });
  assert.equal(r.payload.inviteOnly, false);
  assert.equal((await q(`select value::text as v from app_settings where key='invite_only'`))[0].v, 'false');
  await call({ action: 'set-invite-only', inviteOnly: true });
  // Errors are recorded once per message per hour, with a count
  const { recordAppError, alertPlatformAdmins } = require(`${ROOT}/api/_lib/platform.js`);
  await recordAppError('api/test', new Error('Boom')); await recordAppError('api/test', new Error('Boom')); await recordAppError('api/test', new Error('Other'));
  const errs = await q(`select message, count from app_errors where source='api/test' order by message`);
  assert.deepEqual(errs, [{ message: 'Boom', count: 2 }, { message: 'Other', count: 1 }]);
  mails.length = 0;
  const alert = await alertPlatformAdmins({});
  assert.equal(alert.sent, 1, JSON.stringify(alert)); assert.equal(mails[0].to[0], 'owner@x.com'); assert.match(mails[0].html, /Boom/);
  assert.equal((await alertPlatformAdmins({ lastAlert: new Date().toISOString() })).reason, 'recently alerted');
  assert.equal((await q(`select count(*)::int as n from app_errors where alerted_at is null and source='api/test'`))[0].n, 0, 'alerted errors are marked');
  delete process.env.RESEND_API_KEY;
  // Daily post limit per workspace
  await db.exec(`insert into scheduled_posts (workspace_id, client_id, title, status, scheduled_for, content, created_by) select '11111111-1111-1111-1111-111111111111', 'pk-works', 'Bulk ' || g, 'scheduled', now() + interval '20 days', '{"text":"x"}', '${ADMIN}' from generate_series(1, 150) g`);
  networkHandler = () => reply({});
  r = await call({ action: 'publish', clientId: 'pk-works', text: 'One too many', platforms: [], manual: ['tiktok'], scheduleDate: new Date(Date.now() + 86400000).toISOString() });
  assert.equal(r.status, 429); assert.match(r.payload.error, /150 posts/);
  await db.exec(`delete from scheduled_posts where title like 'Bulk %'`);
  // Team size limit
  await db.exec(`insert into workspace_invites (workspace_id, email, role) select '11111111-1111-1111-1111-111111111111', 'bulk' || g || '@x.com', 'user' from generate_series(1, 23) g`);
  r = await call({ action: 'invite', email: 'one.more@x.com', role: 'user' });
  assert.equal(r.status, 409); assert.match(r.payload.error, /up to 25 people/);
  await db.exec(`delete from workspace_invites where email like 'bulk%'`);
  // Brand kit from a website
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  let aiPrompt = '';
  networkHandler = (c) => {
    if (c.url === 'https://harbor.test/') return new Response(`<html><head><title>Harbor Coffee</title><meta name="description" content="Small-batch coffee"><meta name="theme-color" content="#7a4b2a"><style>:root{--brand-accent:#e7b75f}</style><link rel="icon" href="/fav.png"></head><body><img class="site-logo" src="/logo.png"><nav><a href="/about">About us</a><a href="https://instagram.com/harborcoffee">IG</a><a href="https://www.facebook.com/sharer/sharer.php">share</a></nav><h1>Roasted by the water</h1><p>We roast small batches every morning for neighbors and cafés.</p></body></html>`, { headers: { 'content-type': 'text/html' } });
    if (c.url === 'https://harbor.test/about') return new Response('<html><body><h1>Our story</h1><p>Started in a garage in 2015 by two friends.</p></body></html>', { headers: { 'content-type': 'text/html' } });
    if (c.url.startsWith('https://api.anthropic.com/v1/messages')) {
      aiPrompt = body(c).messages[0].content;
      return reply({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: JSON.stringify({ description: 'Small-batch roaster.', voice: 'Warm and neighborly.', audience: 'Coffee lovers nearby', requiredHashtags: ['#HarborCoffee', 'bad tag!'], avoidWords: ['cheapest'], watchTerms: ['Harbor Coffee'], primaryColor: '#7A4B2A', secondaryColor: '#123456', logoUrl: 'https://harbor.test/logo.png', contentPillars: ['Roast days', 'Café partners'] }) }] });
    }
    throw new Error('unexpected ' + c.url);
  };
  r = await call({ action: 'brand-from-site', clientId: 'pk-works', url: 'harbor.test' }, 'user');
  assert.equal(r.status, 403, 'brand kits are for admins');
  r = await call({ action: 'brand-from-site', clientId: 'pk-works', url: 'harbor.test' });
  assert.equal(r.status, 200, JSON.stringify(r.payload));
  const brand = r.payload.brand;
  assert.equal(brand.description, 'Small-batch roaster.');
  assert.match(brand.voice, /^Warm and neighborly\.\n\nAudience: Coffee lovers nearby\n\nRecurring topics: Roast days; Café partners\.$/);
  assert.equal(brand.requiredHashtags, '#HarborCoffee #badtag');
  assert.deepEqual(brand.colors, ['#7a4b2a'], 'colors must come from the site; invented ones are dropped');
  assert.equal(brand.logo, 'https://harbor.test/logo.png');
  assert.deepEqual(brand.social, { instagram: 'https://instagram.com/harborcoffee' });
  assert.match(aiPrompt, /Started in a garage/, 'the About page is read too');
  assert.match(aiPrompt, /#7a4b2a, #e7b75f/);
  r = await call({ action: 'brand-from-site', clientId: 'pk-works', url: 'http://127.0.0.1/' });
  assert.equal(r.status, 400);
  // Account deletion: blocked for the only admin while others remain
  networkHandler = (c) => {
    if (c.url.startsWith('https://sb.test/storage/v1/object/list/')) { const prefix = body(c).prefix; return reply(prefix === `${USER}/` ? [{ id: 'f1', name: 'photo.jpg' }] : prefix === `${ADMIN}/` ? [{ id: 'f2', name: 'kit.png' }] : prefix === 'system/instagram/' ? [{ id: 'f3', name: 'other-0.jpg' }] : []); }
    if (c.url === 'https://sb.test/storage/v1/object/social-media' && c.method === 'DELETE') { deletedFiles.push(...body(c).prefixes); return reply([]); }
    if (c.url.startsWith('https://sb.test/auth/v1/admin/users/') && c.method === 'DELETE') { deletedUsers.push(c.url.split('/').pop()); return reply({}); }
    throw new Error('unexpected ' + c.method + ' ' + c.url);
  };
  const deletedFiles = [], deletedUsers = [];
  r = await call({ action: 'account-plan' });
  assert.match(r.payload.blocked, /only admin/);
  r = await call({ action: 'delete-account', confirm: 'DELETE' });
  assert.equal(r.status, 409);
  r = await call({ action: 'delete-account' }, 'user');
  assert.equal(r.status, 400, 'needs the typed confirmation');
  // A member leaves: their membership, files, and sign-in go; the workspace stays
  r = await call({ action: 'delete-account', confirm: 'DELETE' }, 'user');
  assert.equal(r.status, 200, JSON.stringify(r.payload)); assert.equal(r.payload.workspaceDeleted, false);
  assert.deepEqual(deletedFiles, [`${USER}/photo.jpg`]); assert.deepEqual(deletedUsers, [USER]);
  assert.equal((await q(`select count(*)::int as n from workspace_members where user_id='${USER}'`))[0].n, 0);
  assert.equal((await q(`select count(*)::int as n from workspaces where id='11111111-1111-1111-1111-111111111111'`))[0].n, 1);
  // The last member deletes: the whole workspace and everything in it goes
  const before = (await q(`select (select count(*) from scheduled_posts where workspace_id='11111111-1111-1111-1111-111111111111')::int as posts, (select count(*) from social_connections where workspace_id='11111111-1111-1111-1111-111111111111')::int as connections`))[0];
  assert.ok(before.posts > 0 && before.connections > 0, JSON.stringify(before));
  r = await call({ action: 'account-plan' });
  assert.deepEqual([r.payload.soleMember, r.payload.blocked], [true, null]);
  r = await call({ action: 'delete-account', confirm: 'DELETE' });
  assert.equal(r.status, 200, JSON.stringify(r.payload)); assert.equal(r.payload.workspaceDeleted, true);
  const after = (await q(`select (select count(*) from workspaces)::int as ws, (select count(*) from scheduled_posts)::int as posts, (select count(*) from publish_jobs)::int as jobs, (select count(*) from social_connections)::int as connections, (select count(*) from workspace_state)::int as state, (select count(*) from short_links)::int as links`))[0];
  assert.deepEqual(after, { ws: 0, posts: 0, jobs: 0, connections: 0, state: 0, links: 0 });
  assert.ok(deletedFiles.includes(`${ADMIN}/kit.png`)); assert.ok(!deletedFiles.includes('system/instagram/other-0.jpg'), 'other workspaces’ converted images are kept');
  assert.deepEqual(deletedUsers, [USER, ADMIN]);
}

console.log('queue tests passed');
