// The daily backup check: a copy made before an update isn't faulted for tables that update added, but
// a copy missing a table it was meant to hold (or a core table) is.
const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
const zlib = require('node:zlib');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc' });
const { verifyLatestBackup } = require(ROOT + '/api/_lib/backup.js');
const now = Date.now();
let copy;
global.fetch = async (url) => {
  if (String(url).includes('/object/list/')) return new Response(JSON.stringify([{ id: '1', name: new Date(now).toISOString().slice(0, 10) + '.json.gz', created_at: new Date(now - 3600000).toISOString(), metadata: { size: 10 } }]), { status: 200, headers: { 'content-type': 'application/json' } });
  return new Response(zlib.gzipSync(Buffer.from(JSON.stringify(copy))), { status: 200 });
};
const core = { workspaces: [{ id: 'w' }], workspace_members: [], workspace_state: [], scheduled_posts: [], publish_jobs: [], social_connections: [] };
(async () => {
  copy = { tables: { ...core, notifications: [] } };
  assert.strictEqual((await verifyLatestBackup({ now })).tables, 7, 'an older copy without the newest tables is fine');
  copy = { tableList: [...Object.keys(core), 'credit_ledger'], tables: { ...core } };
  await assert.rejects(verifyLatestBackup({ now }), /missing 1 table: credit_ledger/, 'a table the copy was meant to hold is missing');
  const { social_connections: _, ...noCore } = core;
  copy = { tables: noCore };
  await assert.rejects(verifyLatestBackup({ now }), /social_connections/, 'core tables are always required');
  console.log('backup-check: ok');
})().catch((error) => { console.error(error); process.exit(1); });
