// Each client can have its own time zone; otherwise the workspace's, otherwise Eastern.
const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc' });
const { clientTimeZone, WORKSPACE_TIMEZONES } = require(ROOT + '/api/_lib/core.js');
const state = { settings: { timezone: 'Central Time (US & Canada)' }, clients: [{ id: 'a', timezone: 'London' }, { id: 'b' }, { id: 'c', timezone: 'Nowhere' }] };
assert.strictEqual(clientTimeZone(state, 'a'), 'Europe/London');
assert.strictEqual(clientTimeZone(state, 'b'), 'America/Chicago');
assert.strictEqual(clientTimeZone(state, 'c'), 'America/Chicago', 'unknown names fall back');
assert.strictEqual(clientTimeZone({}, 'x'), 'America/New_York');
assert.strictEqual(WORKSPACE_TIMEZONES['Mountain Time (US & Canada)'], 'America/Denver');
// The app's list matches the server's.
const ui = require('node:fs').readFileSync(ROOT + '/js/ui.js', 'utf8');
for (const [name, zone] of Object.entries(WORKSPACE_TIMEZONES)) assert.ok(ui.includes(`['${name}','${zone}']`), name);
console.log('client-timezone: ok');
