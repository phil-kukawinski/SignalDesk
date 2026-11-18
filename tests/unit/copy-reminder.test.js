// The wrap-up email reminds admins to download a copy of their workspace (Settings → Export) when
// nobody has in 30 days, at most once every four weeks, and never as an email of its own.
const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', RESEND_API_KEY: 're_test', NOTIFY_FROM_EMAIL: 'hello@signaldesk.test', APP_URL: 'https://signaldesk.test' });
const { processEmailDigests } = require(ROOT + '/api/_lib/notify.js');

const ADMIN = '11111111-1111-1111-1111-111111111111', USER = '22222222-2222-2222-2222-222222222222';
const ok = (body, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let lastExport = null, reminders = {}, notifications = true;
const emails = [];
global.fetch = async (input, options = {}) => {
  const url = decodeURIComponent(String(input)), method = options.method || 'GET';
  if (url.includes('/rest/v1/workspace_members?')) return ok([{ user_id: ADMIN, email: 'admin@x.com', role: 'admin', workspace_id: 'ws-1' }, { user_id: USER, email: 'user@x.com', role: 'user', workspace_id: 'ws-1' }]);
  if (url.includes('/rest/v1/notification_preferences?user_id=in.')) return ok([ADMIN, USER].map((user_id) => ({ user_id, email_frequency: 'weekly', email_categories: ['approvals'], weekly_day: 1, last_digest_at: null })));
  if (url.includes('/rest/v1/workspace_state?')) return ok([{ state: { clients: [], settings: { timezone: 'Eastern Time (US & Canada)' } } }]);
  if (url.includes('/rest/v1/notifications?')) return ok(notifications ? [{ title: 'A post was approved', body: 'Fall kits', category: 'approvals', created_at: '2026-11-16T10:00:00Z', type: 'post_approved', data: {} }] : []);
  if (url.includes('/rest/v1/activity_log?') && url.includes('action=eq.workspace_exported')) return ok(lastExport ? [{ created_at: lastExport }] : []);
  if (url.includes('/rest/v1/worker_runs?name=eq.copy-reminder:')) { const name = url.split('name=eq.')[1].split('&')[0]; return ok(reminders[name] ? [{ last_run_at: reminders[name] }] : []); }
  if (url.includes('/rest/v1/worker_runs?on_conflict=name') && method === 'POST') { const row = JSON.parse(options.body); reminders[row.name] = row.last_run_at; return new Response(null, { status: 201 }); }
  if (url.includes('/rest/v1/')) return new Response(null, { status: 204 });
  if (url === 'https://api.resend.com/emails') { emails.push(JSON.parse(options.body)); return ok({ id: 'e' }); }
  throw new Error('unexpected request ' + url);
};
const mondays = (date) => new Date(`${date}T13:00:00Z`); // 8 AM Eastern
const run = async (date) => { emails.length = 0; await processEmailDigests({ now: mondays(date) }); return Object.fromEntries(emails.map((email) => [email.to[0] || email.to, email.html + email.text])); };

(async () => {
  // Never downloaded: the admin's wrap-up suggests it, with a link to Settings; the user's doesn't.
  let sent = await run('2026-11-16');
  assert.match(sent['admin@x.com'], /Keep your own copy/);
  assert.match(sent['admin@x.com'], /hasn’t made one yet/);
  assert.match(sent['admin@x.com'], /not a shared one/, 'it says where to keep the file');
  assert.match(sent['admin@x.com'], /https:\/\/signaldesk\.test\/backups/, 'and links to the guide');
  assert.doesNotMatch(sent['user@x.com'], /Keep your own copy/, 'only admins can export, so only admins are asked');

  // The next weeks: not again until four weeks have passed.
  sent = await run('2026-11-23');
  assert.doesNotMatch(sent['admin@x.com'], /Keep your own copy/, 'not every week');
  sent = await run('2026-12-14');
  assert.match(sent['admin@x.com'], /Keep your own copy/, 'again after four weeks');

  // A recent download: no reminder. An old one: the reminder says how old.
  reminders = {}; lastExport = '2026-12-10T12:00:00Z';
  sent = await run('2026-12-21');
  assert.doesNotMatch(sent['admin@x.com'], /Keep your own copy/);
  reminders = {}; lastExport = '2026-11-01T12:00:00Z';
  sent = await run('2026-12-21');
  assert.match(sent['admin@x.com'], /last copy was 50 days ago/);

  // Nothing else to say this week: no email just for the reminder.
  reminders = {}; lastExport = null; notifications = false;
  sent = await run('2026-12-28');
  assert.deepEqual(Object.keys(sent), [], 'the reminder never sends an email on its own');

  console.log('copy reminder tests passed');
})().catch((error) => { console.error(error); process.exit(1); });
