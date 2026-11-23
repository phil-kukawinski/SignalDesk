const zlib = require('node:zlib');
const { databaseRequest } = require('./core');

// A daily copy of the whole database, made by the worker, because the free Supabase plan has no
// automatic backups. Every table is read through the API and saved as one compressed JSON file in
// a private "backups" bucket that only the server can reach. It keeps the last 7 days plus 5
// weekly copies (Mondays). Sign-in accounts are included without passwords, which the API never
// returns, so after a full rebuild people choose a new password. Uploaded files aren't copied;
// media_files lists them. scripts/restore-backup.mjs reads a copy back.

const BUCKET = 'backups';
const KEEP_DAILY = 7;
const KEEP_WEEKLY = 5;
const PAGE = 1000;
const MAX_ROWS = 200000;

// Every table in supabase/schema.sql and the columns that order it (its primary key), so paging
// through a table never skips or repeats a row. Listed so each table comes after the ones it refers
// to, which is the order a restore writes them in. OAuth sessions are left out: they last 15 minutes.
// tests/unit/backup.test.js checks this against the schema.
const TABLES = {
  workspaces: 'id', workspace_members: 'workspace_id,user_id', workspace_invites: 'workspace_id,email', workspace_state: 'workspace_id',
  social_profiles: 'workspace_id,client_id', user_drafts: 'user_id', saved_drafts: 'workspace_id,id', autopilot_feeds: 'id', scheduled_posts: 'id',
  autopilot_items: 'id', social_connections: 'id', publish_jobs: 'id', scheduled_comments: 'id', notifications: 'id', notification_preferences: 'user_id',
  post_submissions: 'workspace_id,provider_post_id', weekly_reports: 'id', trend_reports: 'id', publish_attempts: 'id', review_links: 'id', post_notes: 'id',
  post_history: 'id', push_subscriptions: 'endpoint', bio_pages: 'slug', short_links: 'code', link_click_days: 'code,day', network_posts: 'id',
  account_stats: 'connection_id,day', post_metric_days: 'workspace_id,platform,external_id,day', planning_notes: 'id', comment_states: 'workspace_id,job_id,comment_id', message_states: 'workspace_id,connection_id,conversation_id',
  invite_requests: 'id', data_deletion_requests: 'code', worker_runs: 'name', beta_invites: 'code', beta_redemptions: 'code,user_id', app_settings: 'key',
  app_errors: 'id', ai_usage: 'id', media_files: 'path', activity_log: 'id', client_uploads: 'id', email_reply_codes: 'code', credit_ledger: 'id', stripe_events: 'id'
};
const SKIPPED = ['oauth_sessions'];
// Tables every copy must have, whenever it was made.
const CORE_TABLES = ['workspaces', 'workspace_members', 'workspace_state', 'scheduled_posts', 'publish_jobs', 'social_connections'];
// Tables whose id the database numbers itself. A restore keeps the old numbers and moves the counter past them.
const NUMBERED = ['publish_attempts', 'post_history', 'app_errors', 'ai_usage', 'activity_log', 'credit_ledger'];

function serviceHeaders(extra = {}) {
  return { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, ...extra };
}

async function storage(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${process.env.SUPABASE_URL}/storage/v1/${path}`, {
    method, headers: serviceHeaders(headers), ...(body === undefined ? {} : { body })
  });
  if (!response.ok) {
    const error = new Error(`Storage returned HTTP ${response.status}.`);
    error.status = response.status;
    error.detail = await response.text().catch(() => '');
    throw error;
  }
  return response.headers.get('content-type')?.includes('json') ? response.json() : response.arrayBuffer();
}

async function ensureBucket() {
  try {
    await storage('bucket', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }) });
  } catch (error) {
    // Already there: Storage answers 400 or 409 with "already exists".
    if (!/already exists|Duplicate/i.test(error.detail || '')) throw error;
  }
}

async function tableRows(table, order) {
  const rows = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const page = await databaseRequest(`${table}?select=*&order=${order}&limit=${PAGE}&offset=${offset}`);
    if (!Array.isArray(page)) throw new Error(`Couldn’t read ${table}.`);
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
  throw new Error(`${table} has more than ${MAX_ROWS} rows; the backup needs a bigger limit.`);
}

// Sign-in accounts from the Auth admin API: who they are, never their passwords.
async function authUsers() {
  const users = [];
  for (let page = 1; page <= 200; page += 1) {
    const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${PAGE}`, { headers: serviceHeaders() });
    if (!response.ok) throw new Error(`Couldn’t read sign-in accounts (HTTP ${response.status}).`);
    const batch = (await response.json())?.users || [];
    users.push(...batch.map((user) => ({
      id: user.id, email: user.email, created_at: user.created_at, email_confirmed_at: user.email_confirmed_at,
      last_sign_in_at: user.last_sign_in_at, user_metadata: user.user_metadata || {}, app_metadata: user.app_metadata || {}
    })));
    if (batch.length < PAGE) return users;
  }
  return users;
}

async function exportDatabase({ now = new Date() } = {}) {
  const tables = {};
  for (const [table, order] of Object.entries(TABLES)) tables[table] = await tableRows(table, order);
  // tableList records which tables this copy was meant to hold, so a later check knows what to expect.
  return { format: 'signaldesk-backup', version: 1, createdAt: now.toISOString(), skipped: SKIPPED, tableList: Object.keys(TABLES), users: await authUsers(), tables };
}

const dayOf = (date) => date.toISOString().slice(0, 10);

async function listCopies(folder) {
  const items = await storage(`object/list/${BUCKET}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prefix: folder, limit: 1000, sortBy: { column: 'name', order: 'desc' } }) });
  return (items || []).filter((item) => item.id && /\.json\.gz$/.test(item.name))
    .map((item) => ({ path: `${folder}/${item.name}`, day: item.name.slice(0, 10), kind: folder, bytes: Number(item.metadata?.size) || 0, createdAt: item.created_at }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

async function prune(folder, keep) {
  const old = (await listCopies(folder)).slice(keep).map((copy) => copy.path);
  if (old.length) await storage(`object/${BUCKET}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prefixes: old }) });
  return old.length;
}

async function runBackup({ now = new Date() } = {}) {
  const started = Date.now();
  const data = await exportDatabase({ now });
  const file = zlib.gzipSync(Buffer.from(JSON.stringify(data)));
  await ensureBucket();
  const upload = (path) => storage(`object/${BUCKET}/${path}`, { method: 'POST', headers: { 'content-type': 'application/gzip', 'x-upsert': 'true' }, body: file });
  const daily = `daily/${dayOf(now)}.json.gz`;
  await upload(daily);
  const weekly = now.getUTCDay() === 1 ? `weekly/${dayOf(now)}.json.gz` : null;
  if (weekly) await upload(weekly);
  const removed = await prune('daily', KEEP_DAILY) + await prune('weekly', KEEP_WEEKLY);
  const rows = Object.values(data.tables).reduce((sum, list) => sum + list.length, 0);
  return { path: daily, weekly, bytes: file.length, tables: Object.keys(data.tables).length, rows, users: data.users.length, removed, seconds: Math.round((Date.now() - started) / 1000) };
}

async function listBackups() {
  const [daily, weekly] = await Promise.all([listCopies('daily').catch(() => []), listCopies('weekly').catch(() => [])]);
  return [...daily, ...weekly];
}

// A link that downloads one copy, valid for five minutes.
async function backupDownloadUrl(path) {
  if (typeof path !== 'string' || !/^(daily|weekly)\/\d{4}-\d{2}-\d{2}\.json\.gz$/.test(path)) {
    throw Object.assign(new Error('Choose a backup to download.'), { status: 400 });
  }
  const signed = await storage(`object/sign/${BUCKET}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn: 300 }) });
  const link = signed?.signedURL || signed?.signedUrl;
  if (!link) throw new Error('Storage didn’t return a download link.');
  return `${process.env.SUPABASE_URL}/storage/v1${link.startsWith('/') ? '' : '/'}${link}&download=${path.replace('/', '-')}`;
}

// SQL that puts a backup's rows back, for the Supabase SQL editor. Rows that still exist are left
// alone, so it can repair a few deleted rows or refill an empty database (after the schema and the
// sign-in accounts are back). Triggers and reference checks are paused while it runs.
function restoreSql(backup, { tables = Object.keys(TABLES) } = {}) {
  if (backup?.format !== 'signaldesk-backup') throw new Error('This isn’t a SignalDesk backup file.');
  const unknown = tables.filter((table) => !TABLES[table]);
  if (unknown.length) throw new Error(`Not in the backup: ${unknown.join(', ')}`);
  const lines = [`-- SignalDesk restore from the backup made ${backup.createdAt}.`, 'begin;', 'set local session_replication_role = replica;'];
  for (const table of Object.keys(TABLES).filter((name) => tables.includes(name))) {
    const rows = backup.tables[table] || [];
    if (!rows.length) continue;
    const json = JSON.stringify(rows);
    let tag = 'rows';
    while (json.includes(`$${tag}$`)) tag += 'x';
    lines.push(`-- ${table}: ${rows.length} row${rows.length === 1 ? '' : 's'}`,
      `insert into public.${table} overriding system value select * from jsonb_populate_recordset(null::public.${table}, $${tag}$${json}$${tag}$::jsonb) on conflict do nothing;`);
    if (NUMBERED.includes(table)) lines.push(`select setval(pg_get_serial_sequence('public.${table}', 'id'), greatest((select max(id) from public.${table}), 1));`);
  }
  lines.push('commit;');
  return lines.join('\n') + '\n';
}

// Daily, from the worker: once a copy is under 20 hours old nothing happens, and after a failure it
// waits an hour before trying again (the failure is logged for the platform owners' alerts).
async function maybeRunBackup({ now = new Date() } = {}) {
  const { lastWorkerRun, recordWorkerRun } = require('./publishing');
  const [last, tried] = await Promise.all([lastWorkerRun('backup'), lastWorkerRun('backup-try')]);
  if (last && now - Date.parse(last) < 20 * 3600000) return { skipped: true };
  if (tried && now - Date.parse(tried) < 3600000) return { skipped: true, retryLater: true };
  await recordWorkerRun('backup-try', {});
  try {
    const result = await runBackup({ now });
    await recordWorkerRun('backup', result);
    return result;
  } catch (error) {
    await recordWorkerRun('backup-try', { error: error.message });
    throw error;
  }
}

// When the last copy was made, and what it held.
// Once a day: is the newest daily copy recent, does it open, and does it hold every table? A problem goes to
// the platform error list, which emails platform admins (alertPlatformAdmins).
async function verifyLatestBackup({ now = Date.now() } = {}) {
  const [latest] = await listCopies('daily');
  const problem = (message) => { const error = new Error(message); error.backupCheck = true; throw error; };
  if (!latest) problem('There’s no daily database copy at all.');
  const age = now - Date.parse(latest.createdAt || `${latest.day}T00:00:00Z`);
  if (age > 36 * 3600000) problem(`The newest database copy is ${Math.round(age / 3600000)} hours old.`);
  const response = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${latest.path}`, { headers: serviceHeaders({}) });
  if (!response.ok) problem(`The newest copy (${latest.path}) couldn’t be downloaded: HTTP ${response.status}.`);
  let data;
  try { data = JSON.parse(require('node:zlib').gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8')); } catch { problem(`The newest copy (${latest.path}) doesn’t open.`); }
  // Judge the copy by what it should hold: the core tables always, and every table its own list names
  // (a copy made before an update can't contain tables that update added).
  const listed = Array.isArray(data?.tableList) ? data.tableList : Object.keys(data?.tables || {});
  const expected = [...new Set([...CORE_TABLES, ...listed])];
  const missing = expected.filter((table) => !Array.isArray(data?.tables?.[table]));
  if (missing.length) problem(`The newest copy is missing ${missing.length} table${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}.`);
  if (!data.tables.workspaces.length) problem('The newest copy has no workspaces in it.');
  return { path: latest.path, tables: Object.keys(data.tables).length, rows: Object.values(data.tables).reduce((sum, rows) => sum + rows.length, 0) };
}

async function lastBackup() {
  const rows = await databaseRequest('worker_runs?name=in.(backup,backup-try)&select=name,last_run_at,last_result').catch(() => []) || [];
  const done = rows.find((row) => row.name === 'backup'), tried = rows.find((row) => row.name === 'backup-try');
  return { at: done?.last_run_at || null, ...(done?.last_result || {}), error: tried?.last_result?.error && (!done || Date.parse(tried.last_run_at) > Date.parse(done.last_run_at)) ? tried.last_result.error : null };
}

module.exports = { verifyLatestBackup, restoreSql, NUMBERED, maybeRunBackup, lastBackup, BUCKET, KEEP_DAILY, KEEP_WEEKLY, TABLES, SKIPPED, exportDatabase, runBackup, listBackups, backupDownloadUrl };
