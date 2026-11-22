// Values the server writes must be ones the database allows. A check constraint that leaves out a value the
// code uses fails quietly when the app catches the error (weekly planning reminders were lost this way), and
// the database tests only catch it on the paths and dates they happen to run. This reads the code instead.
const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// The schema's allowed values, by table and column. The schema is append-only, so the last definition wins.
const schema = fs.readFileSync(`${ROOT}/supabase/schema.sql`, 'utf8');
const tables = [...schema.matchAll(/(?:create table if not exists public\.(\w+)|alter table public\.(\w+))/g)].map((m) => [m.index, m[1] || m[2]]);
const allowed = {};
for (const m of schema.matchAll(/check\s*\(\s*\(?(\w+)\s+in\s*\(([^)]*)\)/g)) {
  const table = tables.filter(([at]) => at < m.index).pop()[1];
  allowed[`${table}.${m[1]}`] = new Set(m[2].split(',').map((value) => value.trim().replace(/^'|'$/g, '')));
}
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? (entry.name === 'node_modules' ? [] : files(path.join(dir, entry.name))) : entry.name.endsWith('.js') ? [path.join(dir, entry.name)] : []);
const api = files(`${ROOT}/api`).map((file) => [path.relative(ROOT, file), fs.readFileSync(file, 'utf8')]);
const read = (file) => fs.readFileSync(`${ROOT}/${file}`, 'utf8');
function expectAllowed(column, values, where) {
  assert.ok(allowed[column], `the schema should limit ${column}`);
  const missing = [...values].filter((value) => !allowed[column].has(value));
  assert.deepEqual(missing, [], `${where} uses ${missing.map((value) => `'${value}'`).join(', ')}, which ${column} doesn't allow. Add it to the schema's check constraint.`);
}

// Notification categories: every notify() call, and the email preference list.
const categories = new Set(api.flatMap(([, text]) => [...text.matchAll(/\bcategory: '([a-z_]+)'/g)].map((m) => m[1])));
assert.ok(categories.has('planning') && categories.has('approvals'), 'the category scan should find the notify calls');
expectAllowed('notifications.category', categories, 'a notification');
expectAllowed('notifications.category', JSON.parse(read('api/_lib/notify.js').match(/const CATEGORIES = (\[[^\]]*\])/)[1].replace(/'/g, '"')), 'the email category list');

// Plans: every plan billing knows about.
const plans = new Set([...read('api/_lib/billing.js').matchAll(/\bplan: '([a-z_]+)'/g)].map((m) => m[1]));
assert.ok(plans.has('pro') && plans.has('beta'));
expectAllowed('workspaces.plan', plans, 'billing');

// Credits: every kind of credit billing grants.
expectAllowed('credit_ledger.kind', new Set([...read('api/_lib/billing.js').matchAll(/\bkind: '([a-z_]+)'/g)].map((m) => m[1])), 'billing');

// Connected accounts: every platform a network adapter saves.
const platforms = new Set(['api/_lib/platforms.js', 'api/_lib/networks.js', 'api/_lib/fediverse.js'].flatMap((file) => [...read(file).matchAll(/\bplatform: '([a-z_]+)'/g)].map((m) => m[1])));
assert.ok(platforms.has('instagram') && platforms.has('bluesky'));
expectAllowed('social_connections.platform', platforms, 'a network adapter');

// Sign-in connections: every network that starts a sign-in.
const social = read('api/social.js');
expectAllowed('oauth_sessions.provider', new Set(Object.keys(Function(`return ${social.match(/const providerName = (\{[^}]*\})/)[1]}`)())), 'oauth-start');

// Email schedules: every choice in Notification settings.
const frequencies = new Set([...`${read('index.html')}${fs.readdirSync(`${ROOT}/js`).filter((file) => file.endsWith('.js') && !file.endsWith('.min.js')).map((file) => read(`js/${file}`)).join('')}`.matchAll(/value="(immediate|daily|weekly|monthly|yearly|custom|off|hourly|never|biweekly|quarterly)"/g)].map((m) => m[1]));
assert.ok(frequencies.has('weekly'));
expectAllowed('notification_preferences.email_frequency', frequencies, 'Notification settings');

// Post and job statuses written by the publisher and the review page.
const statusWrites = (file, table) => new Set([...read(file).matchAll(new RegExp(`${table}[^\\n]*?status: '([a-z_]+)'`, 'g'))].map((m) => m[1]));
expectAllowed('publish_jobs.status', new Set([...read('api/_lib/publishing.js').matchAll(/patchJobs?\([^\n]*?status: '([a-z_]+)'/g)].map((m) => m[1])), 'the publisher');
expectAllowed('autopilot_items.status', new Set([...statusWrites('api/_lib/publishing.js', 'autopilot_items'), ...[...read('api/_lib/core.js').matchAll(/insertAutopilotItems\([^\n]*?status: '([a-z_]+)'|\bstatus: '(baseline|filtered|skipped|failed|in_review|scheduled)'/g)].map((m) => m[1] || m[2])]), 'Autopilot');
expectAllowed('scheduled_posts.client_status', new Set([...read('api/review.js').matchAll(/client_status: '([a-z_]+)'/g)].map((m) => m[1])), 'the review page');
expectAllowed('comment_states.state', new Set([...read('api/_lib/publishing.js').matchAll(/setCommentState\([^)]*'([a-z_]+)'/g), ...social.matchAll(/setCommentState\([^)]*'([a-z_]+)'/g)].map((m) => m[1])), 'comment states');

console.log('schema values ok');
