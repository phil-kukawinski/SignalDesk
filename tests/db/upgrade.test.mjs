import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert';
const db = new PGlite();
const stub = `
create role anon; create role authenticated; create role service_role;
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
grant usage on schema public, auth to authenticated; grant execute on function auth.uid() to authenticated;
`;
await db.exec(stub);
const A = 'aaaaaaaa-0000-0000-0000-000000000001', B = 'bbbbbbbb-0000-0000-0000-000000000002', C = 'cccccccc-0000-0000-0000-000000000003', D = 'dddddddd-0000-0000-0000-000000000004';
await db.exec(`insert into auth.users values ('${A}','Owner@x.com',now()),('${B}','teammate@x.com',now()),('${C}','unconfirmed@x.com',null),('${D}','solo@x.com',now());`);
// Legacy install with existing data
await db.exec(fs.readFileSync(new URL('./legacy.sql', import.meta.url), 'utf8'));
await db.exec(`insert into public.workspace_state (user_id, state) values ('${A}', '{"clients":[{"id":"pk-works","name":"PK Works"}],"settings":{"name":"PK Works Studio"},"draft":"old draft"}');
insert into public.social_profiles (user_id, client_id, ayrshare_ref_id, profile_key_ciphertext) values ('${A}','pk-works','ref','cipher');`);
const schema = fs.readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');
await db.exec(schema);
await db.exec(schema); // re-run must be safe
const q = async (sql) => (await db.query(sql)).rows;
const [ws] = await q(`select w.id, w.name, m.role, m.email from workspaces w join workspace_members m on m.workspace_id=w.id where m.user_id='${A}'`);
assert.equal(ws.role, 'admin'); assert.equal(ws.name, 'PK Works Studio'); assert.equal(ws.email, 'owner@x.com');
const [st] = await q(`select workspace_id, state->'settings'->>'name' as name, updated_by from workspace_state`);
assert.equal(st.workspace_id, ws.id); assert.equal(st.updated_by, A);
const [sp] = await q(`select workspace_id from social_profiles`); assert.equal(sp.workspace_id, ws.id);
const cols = (await q(`select column_name from information_schema.columns where table_name='workspace_state'`)).map((r) => r.column_name);
assert.ok(!cols.includes('user_id'));
const asUser = async (uid, sql) => { await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`); try { return (await db.query(sql)).rows; } finally { await db.exec(`select set_config('request.jwt.claim.sub', '', false)`); } };
// Existing admin keeps their workspace
let [r] = await asUser(A, `select * from ensure_workspace()`); assert.equal(r.workspace_id, ws.id); assert.equal(r.role, 'admin');
// Invites: confirmed user joins as User; unconfirmed invitee does not join
await db.exec(`insert into workspace_invites (workspace_id, email, role) values ('${ws.id}','teammate@x.com','user'),('${ws.id}','unconfirmed@x.com','user')`);
[r] = await asUser(B, `select * from ensure_workspace()`); assert.equal(r.workspace_id, ws.id); assert.equal(r.role, 'user');
// An unconfirmed invitee doesn't join, and (invite-only) can't make a workspace without a code
await assert.rejects(asUser(C, `select * from ensure_workspace()`), /invite-only/);
assert.equal((await q(`select count(*)::int as n from workspace_invites where email='teammate@x.com'`))[0].n, 0);
// Invite-only beta: a brand-new person needs a valid code
await db.exec(`insert into auth.users values ('eeeeeeee-0000-0000-0000-000000000005','meta@x.com',now(),'{"invite_code":"meta-code-1"}'),('ffffffff-0000-0000-0000-000000000006','late@x.com',now(),'{}')`);
await assert.rejects(asUser(D, `select * from ensure_workspace()`), /invite-only/);
await assert.rejects(asUser(D, `select * from ensure_workspace('NOPE1234')`), /isn’t valid/);
await db.exec(`insert into beta_invites (code, max_uses) values ('WELCOME1', 1), ('METACODE1', 5), ('OLDCODE1', 5), ('GONECODE1', 5);
  update beta_invites set expires_at = now() - interval '1 day' where code = 'OLDCODE1';
  update beta_invites set revoked_at = now() where code = 'GONECODE1';`);
// Brand-new user with a code (typed with spaces and lower case) gets their own workspace + state row
[r] = await asUser(D, `select * from ensure_workspace(' welcome 1 ')`); assert.equal(r.role, 'admin');
assert.deepEqual((await q(`select uses from beta_invites where code='WELCOME1'`))[0], { uses: 1 });
assert.equal((await q(`select count(*)::int as n from beta_redemptions where code='WELCOME1'`))[0].n, 1);
const [again] = await asUser(D, `select * from ensure_workspace()`); assert.equal(again.workspace_id, r.workspace_id, 'returning users keep their workspace without a code');
// The code saved on the account at sign-up works too
const [viaMeta] = await asUser('eeeeeeee-0000-0000-0000-000000000005', `select * from ensure_workspace()`); assert.equal(viaMeta.role, 'admin');
// Used-up, expired, and revoked codes are refused
await assert.rejects(asUser('ffffffff-0000-0000-0000-000000000006', `select * from ensure_workspace('WELCOME1')`), /isn’t valid/);
await assert.rejects(asUser('ffffffff-0000-0000-0000-000000000006', `select * from ensure_workspace('OLDCODE1')`), /isn’t valid/);
await assert.rejects(asUser('ffffffff-0000-0000-0000-000000000006', `select * from ensure_workspace('GONECODE1')`), /isn’t valid/);
// Opening sign-ups lets anyone create a workspace
await db.exec(`update app_settings set value = 'false'::jsonb where key = 'invite_only'`);
const [open] = await asUser('ffffffff-0000-0000-0000-000000000006', `select * from ensure_workspace()`); assert.equal(open.role, 'admin');
await db.exec(`update app_settings set value = 'true'::jsonb where key = 'invite_only'`);
// Upload bucket limits
assert.deepEqual((await q(`select file_size_limit::int as size, allowed_mime_types as types from storage.buckets where id='social-media'`))[0], { size: 52428800, types: ['image/*', 'video/*'] });
// Client limit applies to admins too
const manyClients = JSON.stringify(Array.from({ length: 51 }, (_, i) => ({ id: 'c' + i, name: 'C' + i })));
await assert.rejects(asUser(A, `update workspace_state set state = jsonb_set(state, '{clients}', '${manyClients}'::jsonb) where workspace_id='${ws.id}'`), /up to 50 clients/);
// Re-running the schema keeps the switch as it was
await db.exec(schema);
assert.equal((await q(`select value::text as v from app_settings where key='invite_only'`))[0].v, 'true');
assert.equal((await q(`select count(*)::int as n from workspace_state where workspace_id='${r.workspace_id}'`))[0].n, 1);
// Guard trigger: a User can add posts but not change clients/settings or approve
await asUser(B, `update workspace_state set state = state || '{"savedPosts":[{"id":"p1"}],"approvals":[{"id":"a1","status":"In Review"}]}' where workspace_id='${ws.id}'`);
await assert.rejects(asUser(B, `update workspace_state set state = jsonb_set(state,'{clients}','[]') where workspace_id='${ws.id}'`), /Only workspace admins can change clients/);
await assert.rejects(asUser(B, `update workspace_state set state = jsonb_set(state,'{approvals}','[{"id":"a1","status":"Approved"}]') where workspace_id='${ws.id}'`), /Only workspace admins can approve/);
await asUser(A, `update workspace_state set state = jsonb_set(state,'{approvals}','[{"id":"a1","status":"Approved"}]') where workspace_id='${ws.id}'`);
// RLS: as the authenticated role, a member reads only their workspace; non-members see nothing; users cannot read team tables
await db.exec(`grant usage on schema public to authenticated`);
const rls = async (uid, sql) => { await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`); try { return (await db.query(sql)).rows; } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); } };
assert.equal((await rls(B, `select workspace_id from workspace_state`)).length, 1);
assert.equal((await rls(D, `select workspace_id from workspace_state where workspace_id='${ws.id}'`)).length, 0);
await assert.rejects(rls(B, `select * from workspace_members`), /permission denied/);
await assert.rejects(rls(B, `select * from social_profiles`), /permission denied/);
await assert.rejects(rls(B, `insert into workspace_state (workspace_id) values (gen_random_uuid())`), /permission denied/);
await rls(B, `insert into user_drafts (user_id, workspace_id, draft) values ('${B}','${ws.id}','{"draft":"mine"}')`);
await assert.rejects(rls(B, `insert into user_drafts (user_id, workspace_id, draft) values ('${D}', null, '{}')`), /row-level security/);
assert.equal((await rls(A, `select * from user_drafts`)).length, 0);

// Notifications: invite join notified the admin; users read/mark only their own; can't edit other columns
const joined = await q(`select user_id, category, title from notifications where type='member_joined'`);
assert.equal(joined.length, 1); assert.equal(joined[0].user_id, A); assert.match(joined[0].title, /teammate@x.com joined/);
await db.exec(`insert into notifications (workspace_id, user_id, type, category, title) values ('${ws.id}','${B}','approval_decided','approvals','Approved')`);
assert.equal((await rls(B, `select * from notifications`)).length, 1);
assert.equal((await rls(A, `select * from notifications where user_id='${B}'`)).length, 0);
await rls(B, `update notifications set read_at = now() where user_id='${B}'`);
assert.equal((await q(`select count(*)::int n from notifications where user_id='${B}' and read_at is not null`))[0].n, 1);
await assert.rejects(rls(B, `update notifications set title='hacked'`), /permission denied/);
await assert.rejects(rls(B, `insert into notifications (workspace_id,user_id,type,category,title) values ('${ws.id}','${B}','x','team','x')`), /permission denied/);
// Preferences: own row via upsert, cannot set last_digest_at, cannot write someone else's
await rls(B, `insert into notification_preferences (user_id, workspace_id, email_frequency, email_categories, weekly_day, updated_at) values ('${B}','${ws.id}','weekly','{approvals}',5,now()) on conflict (user_id) do update set email_frequency=excluded.email_frequency, user_id=excluded.user_id, workspace_id=excluded.workspace_id, email_categories=excluded.email_categories, weekly_day=excluded.weekly_day, updated_at=excluded.updated_at`);
await rls(B, `insert into notification_preferences (user_id, workspace_id, email_frequency, email_categories, weekly_day, updated_at) values ('${B}','${ws.id}','daily','{approvals}',5,now()) on conflict (user_id) do update set email_frequency=excluded.email_frequency, user_id=excluded.user_id, workspace_id=excluded.workspace_id, email_categories=excluded.email_categories, weekly_day=excluded.weekly_day, updated_at=excluded.updated_at`);
assert.equal((await q(`select email_frequency from notification_preferences where user_id='${B}'`))[0].email_frequency, 'daily');
await assert.rejects(rls(B, `update notification_preferences set last_digest_at = now()`), /permission denied/);
await assert.rejects(rls(B, `insert into notification_preferences (user_id) values ('${D}')`), /row-level security/);
await assert.rejects(rls(B, `select * from trend_reports`), /permission denied/);
await assert.rejects(rls(B, `select * from weekly_reports`), /permission denied/);
await assert.rejects(rls(B, `select * from post_submissions`), /permission denied/);
for (const table of ['social_connections', 'oauth_sessions', 'scheduled_posts', 'publish_jobs', 'publish_attempts', 'worker_runs', 'review_links', 'post_notes', 'post_history', 'push_subscriptions', 'bio_pages']) {
  await assert.rejects(rls(B, `select * from ${table}`), /permission denied/, table);
  await assert.rejects(rls(A, `select * from ${table}`), /permission denied/, table);
}
await assert.rejects(rls(A, `select * from claim_publish_jobs(5, gen_random_uuid())`), /permission denied/);
console.log('sql tests passed');

