// The daily database copy: it covers every table in the schema, in an order a restore can follow,
// pages through big tables, never keeps passwords, keeps 7 daily and 5 weekly copies, and only
// hands out short-lived download links for its own files.
const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
const fs = require('node:fs');
const zlib = require('node:zlib');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc' });
const { TABLES, SKIPPED, NUMBERED, runBackup, maybeRunBackup, backupDownloadUrl, restoreSql, KEEP_DAILY, KEEP_WEEKLY } = require(ROOT + '/api/_lib/backup.js');

const schema = fs.readFileSync(ROOT + '/supabase/schema.sql', 'utf8');
const ok = (body, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

(async () => {
  // --- every table, keyed by its primary key, after the tables it refers to
  const defined = {};
  for (const match of schema.matchAll(/create table if not exists public\.(\w+) \(([\s\S]*?)\n\);/g)) defined[match[1]] = match[2];
  assert.deepEqual(Object.keys(TABLES).concat(SKIPPED).sort(), Object.keys(defined).sort(), 'the backup covers every table in schema.sql');
  for (const [table, order] of Object.entries(TABLES)) {
    const body = defined[table];
    const key = body.match(/primary key \(([^)]+)\)/)?.[1].replace(/\s/g, '') || body.match(/^\s*(\w+)[^\n]*primary key/m)?.[1];
    assert.equal(order, key, `${table} pages by its primary key`);
  }
  const position = Object.fromEntries(Object.keys(TABLES).map((table, index) => [table, index]));
  const refs = [...Object.entries(defined).flatMap(([table, body]) => [...body.matchAll(/references public\.(\w+)/g)].map((m) => [table, m[1]])),
    ...[...schema.matchAll(/alter table public\.(\w+) add column[^;]*references public\.(\w+)/g)].map((m) => [m[1], m[2]])];
  for (const [table, target] of refs) {
    if (table === target || !(table in position) || !(target in position)) continue;
    assert.ok(position[target] < position[table], `${target} is restored before ${table}, which refers to it`);
  }
  assert.deepEqual([...NUMBERED].sort(), Object.entries(defined).filter(([, body]) => /generated always as identity/.test(body)).map(([table]) => table).sort(), 'every self-numbered table gets its counter moved');

  // --- a backup run against fake services
  const uploads = {}, deleted = [], requests = [];
  let listed = { daily: [], weekly: [] };
  const bigTable = Array.from({ length: 1001 }, (_, index) => ({ id: `p${String(index).padStart(4, '0')}`, title: `Post ${index}` }));
  global.fetch = async (input, options = {}) => {
    const url = String(input), method = options.method || 'GET';
    requests.push(`${method} ${url}`);
    if (url.startsWith('https://sb.test/rest/v1/')) {
      const [path, query] = url.slice('https://sb.test/rest/v1/'.length).split('?');
      const params = new URLSearchParams(query);
      assert.equal(params.get('order'), TABLES[path], `${path} is read in key order`);
      const offset = Number(params.get('offset')), limit = Number(params.get('limit'));
      const rows = path === 'scheduled_posts' ? bigTable : path === 'workspaces' ? [{ id: 'w1', name: 'Agency' }] : [];
      return ok(rows.slice(offset, offset + limit));
    }
    if (url.startsWith('https://sb.test/auth/v1/admin/users')) {
      return ok({ users: [{ id: 'u1', email: 'a@x.com', encrypted_password: 'SECRET-HASH', created_at: '2026-10-01T00:00:00Z', user_metadata: { display_name: 'A' } }] });
    }
    if (url === 'https://sb.test/storage/v1/bucket') return new Response(JSON.stringify({ error: 'Duplicate', message: 'The resource already exists' }), { status: 400 });
    if (url.startsWith('https://sb.test/storage/v1/object/list/backups')) return ok(listed[JSON.parse(options.body).prefix]);
    if (url.startsWith('https://sb.test/storage/v1/object/backups/') && method === 'POST') {
      assert.equal(options.headers['x-upsert'], 'true', 'a second copy on the same day replaces the first');
      uploads[url.split('/object/backups/')[1]] = Buffer.from(options.body); return ok({ Key: 'x' });
    }
    if (url === 'https://sb.test/storage/v1/object/backups' && method === 'DELETE') { deleted.push(...JSON.parse(options.body).prefixes); return ok([]); }
    if (url.startsWith('https://sb.test/storage/v1/object/sign/backups/')) return ok({ signedURL: '/object/sign/backups/daily/2026-11-18.json.gz?token=abc' });
    throw new Error('unexpected request ' + method + ' ' + url);
  };
  const copies = (folder, count, from) => Array.from({ length: count }, (_, index) => ({ id: `${folder}${index}`, name: `${new Date(Date.parse(from) - index * 86400000 * (folder === 'weekly' ? 7 : 1)).toISOString().slice(0, 10)}.json.gz`, metadata: { size: 1000 } }));
  listed = { daily: copies('daily', 9, '2026-11-17'), weekly: copies('weekly', 6, '2026-11-16') };
  const tuesday = new Date('2026-11-17T15:00:00Z');
  const result = await runBackup({ now: tuesday });
  assert.deepEqual(Object.keys(uploads), ['daily/2026-11-17.json.gz'], 'a daily copy, and no weekly one on a Tuesday');
  const saved = JSON.parse(zlib.gunzipSync(uploads['daily/2026-11-17.json.gz']));
  assert.equal(saved.tables.scheduled_posts.length, 1001, 'a table over one page is read in full');
  assert.equal(saved.tables.workspaces[0].name, 'Agency');
  assert.equal(Object.keys(saved.tables).length, Object.keys(TABLES).length);
  assert.ok(!('oauth_sessions' in saved.tables), 'short-lived sign-in sessions are left out');
  assert.equal(saved.users[0].email, 'a@x.com');
  assert.ok(!JSON.stringify(saved).includes('SECRET-HASH'), 'passwords are never kept');
  assert.deepEqual(deleted, ['daily/2026-11-10.json.gz', 'daily/2026-11-09.json.gz', 'weekly/2026-10-12.json.gz'], `only the newest ${KEEP_DAILY} daily and ${KEEP_WEEKLY} weekly copies stay`);
  assert.deepEqual([result.rows, result.users, result.tables, result.removed], [1002, 1, Object.keys(TABLES).length, 3]);
  // Mondays also keep a weekly copy.
  for (const key of Object.keys(uploads)) delete uploads[key];
  listed = { daily: [], weekly: [] };
  await runBackup({ now: new Date('2026-11-16T15:00:00Z') });
  assert.deepEqual(Object.keys(uploads).sort(), ['daily/2026-11-16.json.gz', 'weekly/2026-11-16.json.gz']);

  // --- restore SQL: only known tables, rows kept as they were, counters moved past restored ids
  const sql = restoreSql({ format: 'signaldesk-backup', createdAt: 'x', users: [], tables: { workspaces: [{ id: 'w1', name: "O'Brien $rows$ Co" }], activity_log: [{ id: 7 }] } });
  assert.match(sql, /set local session_replication_role = replica;/);
  assert.match(sql, /\$rowsx\$\[\{"id":"w1","name":"O'Brien \$rows\$ Co"\}\]\$rowsx\$/, 'the quoting can’t be broken by what a row contains');
  assert.match(sql, /setval\(pg_get_serial_sequence\('public\.activity_log', 'id'\)/);
  assert.throws(() => restoreSql({ format: 'signaldesk-backup', tables: {} }, { tables: ['workspaces; drop table x'] }), /Not in the backup/);
  assert.throws(() => restoreSql({ tables: {} }), /isn’t a SignalDesk backup/);

  // --- downloads: only this bucket's own copies, through a five-minute link
  await assert.rejects(backupDownloadUrl('../other-bucket/secret'), /Choose a backup/);
  await assert.rejects(backupDownloadUrl('daily/x.json.gz'), /Choose a backup/);
  const link = await backupDownloadUrl('daily/2026-11-18.json.gz');
  assert.equal(link, 'https://sb.test/storage/v1/object/sign/backups/daily/2026-11-18.json.gz?token=abc&download=daily-2026-11-18.json.gz');

  // --- daily from the worker: skips a fresh copy, waits an hour after a failure
  let runs = {};
  const recorded = [];
  const publishing = require(ROOT + '/api/_lib/publishing.js');
  publishing.lastWorkerRun = async (name) => runs[name] || null;
  publishing.recordWorkerRun = async (name, value) => { recorded.push([name, value]); runs[name] = new Date().toISOString(); };
  const now = new Date();
  runs = { backup: new Date(now - 3600000).toISOString() };
  assert.deepEqual(await maybeRunBackup({ now }), { skipped: true }, 'a copy from an hour ago is fresh enough');
  runs = { backup: new Date(now - 30 * 3600000).toISOString(), 'backup-try': new Date(now - 10 * 60000).toISOString() };
  assert.deepEqual(await maybeRunBackup({ now }), { skipped: true, retryLater: true }, 'a recent failed try waits an hour');
  runs = { backup: new Date(now - 30 * 3600000).toISOString() };
  const ran = await maybeRunBackup({ now });
  assert.ok(ran.path && recorded.some(([name]) => name === 'backup'), 'a stale copy is replaced and recorded');

  console.log('backup tests passed');
})().catch((error) => { console.error(error); process.exit(1); });
