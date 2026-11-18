// Measuring for the pricing plan, in the database: the daily AI counter can't be overrun by
// requests at the same moment, the client limit also covers a workspace's first save, AI usage and
// storage stay out of reach of signed-in browsers, and the platform owners' summaries add up.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
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
await db.exec(fs.readFileSync(`${ROOT}/supabase/schema.sql`, 'utf8')); // re-runnable
await db.exec(`grant usage on schema public, auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`);
const rest = await createRest(db);
const q = async (sql, params) => (await db.query(sql, params)).rows;

const A = 'aaaaaaaa-0000-4000-8000-00000000000a', B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const WA = 'a1111111-1111-4111-8111-111111111111', WB = 'b2222222-2222-4222-8222-222222222222';
await db.exec(`
insert into auth.users values ('${A}','a@x.com',now()),('${B}','b@x.com',now());
insert into workspaces (id, name, created_by, created_at) values ('${WA}','Agency A','${A}', now() - interval '2 days'),('${WB}','Agency B','${B}', now() - interval '1 day');
insert into workspace_members values ('${WA}','${A}','a@x.com','admin',now()),('${WB}','${B}','b@x.com','admin',now());
insert into workspace_state (workspace_id, state) values ('${WA}','{"clients":[{"id":"c1","name":"One"},{"id":"c2","name":"Two"}]}');
`);

// --- the daily counter: counted in one step, so it never passes its limit
const use = async (name, limit) => (await q('select public.use_daily_allowance($1, $2) as ok', [name, limit]))[0].ok;
const results = await Promise.all(Array.from({ length: 6 }, () => use(`ai-usage:${WA}:2026-11-18`, 4)));
assert.deepEqual(results.filter(Boolean).length, 4, 'only the allowance gets through, however many arrive at once');
assert.equal((await q(`select last_result from worker_runs where name = $1`, [`ai-usage:${WA}:2026-11-18`]))[0].last_result.count, 4, 'the count stops at the limit');
assert.equal(await use(`ai-usage:${WB}:2026-11-18`, 4), true, 'each workspace has its own count');
assert.equal(await use(`ai-usage:${WA}:2026-11-19`, 4), true, 'and each day starts fresh');
assert.equal(await use('trend-tries:x', 0), false, 'a zero allowance allows nothing');

// Signed-in browsers can't call it to spend or reset another workspace's allowance.
await db.exec(`set role authenticated`);
await assert.rejects(db.query(`select public.use_daily_allowance('ai-usage:x', 100)`), /permission denied/);
await assert.rejects(db.query(`select * from ai_usage`), /permission denied/, 'AI usage is server-only');
await assert.rejects(db.query(`select * from media_files`), /permission denied/, 'storage records are server-only');
await assert.rejects(db.query(`select * from platform_workspace_usage(now())`), /permission denied/, 'the platform summary is server-only');
await db.exec(`reset role`);

// --- the client limit, on a workspace's first save as well as later ones
const tooMany = JSON.stringify({ clients: Array.from({ length: 51 }, (_, index) => ({ id: `c${index}`, name: `Client ${index}` })) });
await db.exec(`select set_config('request.jwt.claim.sub', '${B}', false)`);
await assert.rejects(db.query(`insert into workspace_state (workspace_id, state) values ($1, $2)`, [WB, tooMany]), /up to 50 clients/, 'a first save over the limit is refused');
await db.query(`insert into workspace_state (workspace_id, state) values ($1, '{"clients":[{"id":"b1","name":"B One"}]}')`, [WB]);
await assert.rejects(db.query(`update workspace_state set state = $2 where workspace_id = $1`, [WB, tooMany]), /up to 50 clients/, 'and so is a later one');
await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
assert.equal((await q(`select public.workspace_client_limit($1) as n`, [WA]))[0].n, 50);

// --- what the platform owners' screen shows
await db.exec(`
insert into ai_usage (workspace_id, action, model, input_tokens, output_tokens, web_searches, cost_usd) values
  ('${WA}','trends-refresh','claude-sonnet-5-5',57322,6160,4,0.21624),
  ('${WA}','trends-refresh','claude-sonnet-5-5',60000,7000,6,0.25),
  ('${WA}','draft-captions','claude-sonnet-5-5',1000,200,0,0.004),
  ('${WB}','draft-captions','claude-sonnet-5-5',1200,300,0,0.0054);
insert into ai_usage (workspace_id, action, model, cost_usd, created_at) values ('${WB}','campaign-plan','claude-sonnet-5-5',0.04, now() - interval '40 days');
insert into media_files (path, workspace_id, user_id, size_bytes) values ('${A}/a.jpg','${WA}','${A}',2000000),('${A}/b.mp4','${WA}','${A}',30000000),('${B}/c.png','${WB}','${B}',500000);
`);
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc' });
const reply = (body, status = 200) => new Response(body === null ? '' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
global.fetch = async (input, options = {}) => {
  const url = String(input);
  if (!url.startsWith('https://sb.test/rest/v1/')) throw new Error('unexpected request ' + url);
  try { return reply(await rest(url.slice('https://sb.test/rest/v1/'.length), { method: options.method || 'GET', headers: options.headers || {}, body: options.body })); } catch (error) { return reply({ message: error.message }, 400); }
};
const { platformUsage } = require(`${ROOT}/api/_lib/platform.js`);
const usage = await platformUsage({ days: 30 });
assert.equal(usage.ready, true);
const [a, b] = usage.workspaces;
assert.deepEqual([a.name, a.members, a.clients, a.aiRequests, a.files, a.storageBytes], ['Agency A', 1, 2, 3, 2, 32000000]);
assert.equal(Math.round(a.aiCost * 1e5) / 1e5, 0.47024);
assert.deepEqual([b.name, b.clients, b.aiRequests, b.storageBytes], ['Agency B', 1, 1, 500000], 'requests older than the period are left out');
const scans = usage.costs.find((row) => row.action === 'trends-refresh');
assert.deepEqual([scans.requests, scans.averageCost, scans.highestCost, scans.searches, scans.averageOutput], [2, 0.23312, 0.25, 10, 6580]);
assert.equal(usage.costs[0].action, 'trends-refresh', 'the costliest kind of request comes first');
assert.ok(!usage.costs.some((row) => row.action === 'campaign-plan'), 'the period filter applies to costs too');

// Before the database update, the screen says so instead of failing.
await db.exec(`drop function public.platform_ai_costs(timestamptz)`);
const quiet = console.error; console.error = () => {};
assert.equal((await platformUsage()).ready, false);
console.error = quiet;

console.log('usage database tests passed');
