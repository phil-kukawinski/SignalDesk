// One workspace can never see or change another's data: not through the database directly (what a
// signed-in browser can reach with its own login), not through the app's server, and not through
// uploaded files. Two workspaces even share a client ID, since client IDs are only unique per workspace.
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
// Supabase turns on row-level security for storage and lets signed-in people use it; the policies decide the rest.
await db.exec(`alter table storage.objects enable row level security; grant usage on schema public, auth, storage to authenticated, anon; grant execute on function auth.uid() to authenticated, anon; grant select, insert, update, delete on storage.objects to authenticated;`);
const rest = await createRest(db);
const q = async (sql, params) => (await db.query(sql, params)).rows;

const A = 'aaaaaaaa-0000-4000-8000-00000000000a', B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const WA = 'a1111111-1111-4111-8111-111111111111', WB = 'b2222222-2222-4222-8222-222222222222';
const POST_A = 'a3333333-3333-4333-8333-333333333333', JOB_A = 'a4444444-4444-4444-8444-444444444444', FEED_A = 'a5555555-5555-4555-8555-555555555555', LINK_A = 'a6666666-6666-4666-8666-666666666666';
const SECRET = 'Workspace A private caption';
const later = new Date(Date.now() + 3 * 86400000).toISOString();
await db.exec(`
insert into auth.users values ('${A}','a@x.com',now()),('${B}','b@x.com',now());
insert into workspaces (id, name, created_by) values ('${WA}','Agency A','${A}'),('${WB}','Agency B','${B}');
insert into workspace_members values ('${WA}','${A}','a@x.com','admin',now()),('${WB}','${B}','b@x.com','admin',now());
insert into workspace_state (workspace_id, state) values
  ('${WA}','{"clients":[{"id":"shared","name":"A Client"}],"settings":{"timezone":"Eastern Time (US & Canada)"}}'),
  ('${WB}','{"clients":[{"id":"shared","name":"B Client"}],"settings":{"timezone":"Eastern Time (US & Canada)"}}');
insert into scheduled_posts (id, workspace_id, client_id, title, status, scheduled_for, content, options, created_by)
  values ('${POST_A}','${WA}','shared','${SECRET}','pending_approval','${later}','{"text":"${SECRET}"}','{}','${A}');
insert into publish_jobs (id, post_id, workspace_id, client_id, platform, provider, run_at) values ('${JOB_A}','${POST_A}','${WA}','shared','facebook','manual','${later}');
insert into post_notes (post_id, workspace_id, author_name, author_kind, body) values ('${POST_A}','${WA}','A','team','${SECRET} note');
insert into autopilot_feeds (id, workspace_id, client_id, url, platforms) values ('${FEED_A}','${WA}','shared','https://a.example/feed','{facebook}');
insert into review_links (id, workspace_id, client_id, token_hash, expires_at) values ('${LINK_A}','${WA}','shared','hash-a', now() + interval '30 days');
insert into saved_drafts (workspace_id, id, draft) values ('${WA}','draft-a','{"draft":"${SECRET}"}');
insert into user_drafts (user_id, workspace_id, draft) values ('${A}','${WA}','{"draft":"${SECRET}"}');
insert into notifications (workspace_id, user_id, type, category, title) values ('${WA}','${A}','approval_requested','approvals','${SECRET}');
insert into notification_preferences (user_id, workspace_id) values ('${A}','${WA}');
insert into storage.objects values ('social-media','${A}/photo.jpg');
`);
const snapshot = async () => JSON.stringify({
  post: await q(`select status, scheduled_for, title, content, client_status from scheduled_posts where id=$1`, [POST_A]),
  job: await q(`select status, run_at from publish_jobs where id=$1`, [JOB_A]),
  notes: await q(`select count(*)::int n from post_notes where workspace_id=$1`, [WA]),
  history: await q(`select count(*)::int n from post_history where workspace_id=$1`, [WA]),
  feed: await q(`select count(*)::int n from autopilot_feeds where id=$1`, [FEED_A]),
  link: await q(`select revoked_at from review_links where id=$1`, [LINK_A]),
  state: await q(`select state from workspace_state where workspace_id=$1`, [WA]),
  drafts: await q(`select draft from saved_drafts where workspace_id=$1`, [WA]),
  files: await q(`select name from storage.objects order by name`)
});
const before = await snapshot();

// --- The database itself, as a signed-in person from workspace B ---
const as = async (role, uid, sql) => {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid || ''}', false); set role ${role};`);
  try { return (await db.query(sql)).rows; } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
};
const denied = (promise, why) => assert.rejects(promise, /permission denied|row-level security/, why);

// Every table has row-level security, so a table added later without it fails here.
const open = await q(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1`);
assert.deepEqual(open.map((row) => row.relname), [], 'every table has row-level security turned on');
// Only these tables are reachable from a browser at all; the rest go through the server.
const tables = (await q(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`)).map((row) => row.relname);
const check = async (role) => { const out = []; for (const table of tables) for (const kind of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) if ((await q(`select has_table_privilege('${role}', 'public.${table}', '${kind}') ok`))[0].ok) { out.push(table); break; } return out; };
assert.deepEqual(await check('anon'), [], 'signed-out visitors can’t reach any table');
assert.deepEqual(await check('authenticated'), ['notification_preferences', 'notifications', 'saved_drafts', 'user_drafts', 'workspace_state'], 'only these tables are reachable when signed in');

// B sees only B's own rows in each of them, and can't change or add to A's.
for (const table of ['workspace_state', 'saved_drafts', 'user_drafts', 'notifications', 'notification_preferences']) {
  const column = ['workspace_state', 'saved_drafts'].includes(table) ? 'workspace_id' : 'user_id';
  const own = column === 'workspace_id' ? WB : B;
  const rows = await as('authenticated', B, `select ${column}::text v from public.${table}`);
  assert.ok(rows.every((row) => row.v === own), `${table}: B sees only its own rows (${JSON.stringify(rows)})`);
}
assert.equal((await as('authenticated', B, `select * from workspace_state where workspace_id='${WA}'`)).length, 0);
await as('authenticated', B, `update workspace_state set state = '{}' where workspace_id='${WA}'`);
await as('authenticated', B, `update saved_drafts set draft = '{}' where workspace_id='${WA}'`);
await as('authenticated', B, `delete from saved_drafts where workspace_id='${WA}'`);
await denied(as('authenticated', B, `insert into saved_drafts (workspace_id, id, draft) values ('${WA}','planted','{}')`), 'B can’t add a draft to A’s workspace');
await denied(as('authenticated', B, `insert into user_drafts (user_id, workspace_id, draft) values ('${B}','${WA}','{}')`), 'B can’t attach its draft to A’s workspace');
await denied(as('authenticated', B, `insert into notification_preferences (user_id, workspace_id) values ('${B}','${WA}')`), 'B can’t join A’s workspace through its email settings');
await as('authenticated', B, `update notifications set read_at = now() where user_id='${A}'`);
assert.equal((await q(`select count(*)::int n from notifications where user_id=$1 and read_at is not null`, [A]))[0].n, 0, 'B can’t mark A’s notifications read');
for (const table of ['scheduled_posts', 'publish_jobs', 'post_notes', 'social_connections', 'review_links', 'workspace_members', 'activity_log']) {
  await denied(as('authenticated', B, `select * from public.${table}`), `${table} isn’t reachable from a browser`);
}
// Uploads are capped at 50 MB and limited to images and video by the storage itself, whatever a browser sends.
assert.deepEqual(await q(`select file_size_limit::int size, allowed_mime_types types, public from storage.buckets where id='social-media'`), [{ size: 52428800, types: ['image/*', 'video/*'], public: true }]);
// Uploaded files: B can't put files in A's folder or delete A's.
await denied(as('authenticated', B, `insert into storage.objects values ('social-media','${A}/planted.jpg')`), 'B can’t upload into A’s folder');
await as('authenticated', B, `insert into storage.objects values ('social-media','${B}/mine.jpg')`);
await as('authenticated', B, `delete from storage.objects where name like '${A}/%'`);
await db.exec(`delete from storage.objects where name='${B}/mine.jpg'`);

// --- The app's server, signed in as B, pointing at A's IDs ---
Object.assign(process.env, {
  SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', SOCIAL_PROFILE_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
  APP_URL: 'https://signaldesk.test', APP_ORIGINS: 'https://signaldesk.test'
});
const reply = (body, status = 200) => new Response(body === null ? '' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
global.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url.startsWith('https://sb.test/rest/v1/')) {
    try { const result = await rest(url.slice('https://sb.test/rest/v1/'.length), { method: options.method || 'GET', headers: options.headers || {}, body: options.body }); return reply(result, result === null ? 201 : 200); } catch (error) { return reply({ message: error.message }, 400); }
  }
  if (url === 'https://sb.test/auth/v1/user') {
    const token = (options.headers.authorization || '').replace('Bearer ', '');
    return token === 'a' ? reply({ id: A, email: 'a@x.com' }) : token === 'b' ? reply({ id: B, email: 'b@x.com' }) : reply({}, 401);
  }
  throw new Error('unexpected request ' + url);
};
const social = require(`${ROOT}/api/social.js`);
const call = async (body, token = 'b') => {
  let status, payload;
  const res = { status(s) { status = s; return this; }, json(p) { payload = p; }, setHeader() {}, end() {} };
  await social({ method: 'POST', body, headers: { authorization: `Bearer ${token}`, origin: 'https://signaldesk.test' } }, res);
  return { status, payload: payload ?? {} };
};

// A's own view works, so the checks below aren't passing just because nothing loads.
const mine = await call({ action: 'posts-by-id', ids: [POST_A] }, 'a');
assert.equal(mine.payload.posts?.length, 1, 'A can load its own post: ' + JSON.stringify(mine));

const attempts = [
  { action: 'posts', from: new Date(Date.now() - 86400000).toISOString(), to: new Date(Date.now() + 30 * 86400000).toISOString() },
  { action: 'posts-by-id', ids: [POST_A] },
  { action: 'post-history', postId: POST_A },
  { action: 'post-notes', postId: POST_A },
  { action: 'add-note', postId: POST_A, body: 'planted' },
  { action: 'post-metrics-history', postId: POST_A },
  { action: 'approve', postId: POST_A },
  { action: 'reject', postId: POST_A, note: 'planted' },
  { action: 'reschedule-post', postId: POST_A, scheduleDate: new Date(Date.now() + 9 * 86400000).toISOString() },
  { action: 'set-cover', postId: POST_A, url: null },
  { action: 'cancel-post', postId: POST_A },
  { action: 'update-post', postId: POST_A, clientId: 'shared', text: 'planted', platforms: ['facebook'], scheduleDate: later },
  { action: 'retry-job', jobId: JOB_A, confirmed: true },
  { action: 'manual-done', jobId: JOB_A, url: 'https://example.com/x' },
  { action: 'job-comments', jobId: JOB_A },
  { action: 'comment-state', jobId: JOB_A, commentId: 'c1', done: true },
  { action: 'feed-delete', id: FEED_A },
  { action: 'revoke-review-link', id: LINK_A },
  { action: 'export' },
  { action: 'activity' },
  { action: 'overview', range: 30 },
  { action: 'campaigns' },
  { action: 'review-links', clientId: 'shared' },
  { action: 'autopilot', clientId: 'shared' },
  { action: 'feed-save', id: FEED_A, clientId: 'shared', url: 'https://planted.example/feed', platforms: ['facebook'] }
];
for (const body of attempts) {
  const result = await call(body);
  if (body.action === 'feed-delete' || body.action === 'revoke-review-link') assert.equal(result.status, 404, `${body.action} on A's item says not found: ${JSON.stringify(result)}`);
  const text = JSON.stringify(result.payload);
  assert.ok(!text.includes(SECRET) && !text.includes(POST_A) && !text.includes(JOB_A) && !text.includes(FEED_A) && !text.includes(LINK_A) && !text.includes('A Client'),
    `${body.action}: B's answer mentions nothing of A's (status ${result.status}): ${text.slice(0, 300)}`);
}
assert.equal(await snapshot(), before, 'nothing of A’s changed');
assert.equal((await q(`select count(*)::int n from activity_log where workspace_id=$1 and action in ('autopilot_deleted','review_link_revoked')`, [WB]))[0].n, 0, 'blocked deletes and revokes leave no line in B’s activity log');
console.log(`isolation tests passed (${attempts.length} server actions, ${tables.length} tables)`);
