// A backup can really be restored: copy a workspace's data, lose some of it, run the generated SQL,
// and everything is back as it was, including self-numbered history, with nothing doubled on a
// second run and new rows still getting fresh numbers afterwards.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import zlib from 'node:zlib';
import assert from 'node:assert';
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
const rest = await createRest(db);
const q = async (sql, params) => (await db.query(sql, params)).rows;

const A = 'aaaaaaaa-0000-4000-8000-00000000000a', WA = 'a1111111-1111-4111-8111-111111111111';
const POST = 'a3333333-3333-4333-8333-333333333333', JOB = 'a4444444-4444-4444-8444-444444444444';
const later = new Date(Date.now() + 3 * 86400000).toISOString();
await db.exec(`
insert into auth.users values ('${A}','a@x.com',now());
insert into workspaces (id, name, created_by) values ('${WA}','Agency A','${A}');
insert into workspace_members values ('${WA}','${A}','a@x.com','admin',now());
insert into workspace_state (workspace_id, state) values ('${WA}','{"clients":[{"id":"c1","name":"Harbor Coffee"}],"settings":{"timezone":"Eastern Time (US & Canada)"}}');
insert into scheduled_posts (id, workspace_id, client_id, title, status, scheduled_for, content, options, created_by)
  values ('${POST}','${WA}','c1','Fall kits','scheduled','${later}','{"text":"Fall kits are here","platforms":["facebook"]}','{"tags":["fall"]}','${A}');
insert into publish_jobs (id, post_id, workspace_id, client_id, platform, provider, run_at) values ('${JOB}','${POST}','${WA}','c1','facebook','direct','${later}');
insert into activity_log (workspace_id, actor_name, action, detail) values ('${WA}','A','client_added','{"name":"Harbor Coffee"}'),('${WA}','A','member_invited','{}');
`);

// The backup, through the same API calls the server makes.
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc' });
const reply = (body, status = 200) => new Response(body === null ? '' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let uploaded = null;
global.fetch = async (input, options = {}) => {
  const url = String(input), method = options.method || 'GET';
  if (url.startsWith('https://sb.test/rest/v1/')) {
    try { return reply(await rest(url.slice('https://sb.test/rest/v1/'.length), { method, headers: options.headers || {}, body: options.body })); } catch (error) { return reply({ message: error.message }, 400); }
  }
  if (url.startsWith('https://sb.test/auth/v1/admin/users')) return reply({ users: (await q('select id, email from auth.users')).map((row) => ({ ...row, created_at: new Date().toISOString() })) });
  if (url === 'https://sb.test/storage/v1/bucket') return reply({ name: 'backups' });
  if (url.startsWith('https://sb.test/storage/v1/object/list/backups')) return reply([]);
  if (url.startsWith('https://sb.test/storage/v1/object/backups/') && method === 'POST') { uploaded = Buffer.from(options.body); return reply({ Key: 'x' }); }
  throw new Error('unexpected request ' + method + ' ' + url);
};
const { runBackup, restoreSql } = require(`${ROOT}/api/_lib/backup.js`);
const result = await runBackup({ now: new Date('2026-11-18T15:00:00Z') });
assert.ok(result.rows >= 7, 'the copy holds the seeded rows');
const backup = JSON.parse(zlib.gunzipSync(uploaded));

const snapshot = async () => JSON.stringify({
  post: await q(`select id, title, status, scheduled_for, content, options from scheduled_posts order by id`),
  jobs: await q(`select id, post_id, platform, status, run_at from publish_jobs order by id`),
  state: await q(`select state from workspace_state`),
  activity: await q(`select id, action, detail from activity_log order by id`)
});
const before = await snapshot();

// Something goes wrong: a post, its job, and the activity history are deleted.
await db.exec(`delete from activity_log; delete from scheduled_posts where id = '${POST}';`);
assert.equal((await q(`select count(*)::int n from publish_jobs`))[0].n, 0, 'deleting the post took its job with it');

// Restoring just what was lost.
const repair = restoreSql(backup, { tables: ['scheduled_posts', 'publish_jobs', 'activity_log'] });
await db.exec(repair);
assert.equal(await snapshot(), before, 'the lost rows are back exactly as they were');
await db.exec(repair);
assert.equal(await snapshot(), before, 'running it twice changes nothing');
const [{ id: nextId }] = await q(`insert into activity_log (workspace_id, actor_name, action, detail) values ('${WA}','A','x','{}') returning id`);
assert.ok(nextId > Math.max(...backup.tables.activity_log.map((row) => Number(row.id))), 'new activity gets a fresh number after a restore');
await db.exec(`delete from activity_log where id = ${nextId}`);

// Restoring everything into an emptied database (after the schema and accounts are back).
await db.exec(`delete from activity_log; delete from scheduled_posts; delete from workspace_state; delete from workspace_members; delete from workspaces;`);
await db.exec(restoreSql(backup));
assert.equal(await snapshot(), before, 'a full restore brings the workspace back');
assert.equal((await q(`select count(*)::int n from workspace_members`))[0].n, 1);

console.log('backup database tests passed');
