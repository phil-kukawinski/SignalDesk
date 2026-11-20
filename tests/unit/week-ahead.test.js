// The week-ahead email: what's waiting on this person (approvals for admins, posts assigned to them),
// what goes out in the next 7 days, and what failed in the last 7.
const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc' });
const { weekAheadSections, DEFAULT_PREFERENCES } = require(ROOT + '/api/_lib/notify.js');
const now = new Date('2026-11-23T13:00:00Z');
const at = (days) => new Date(now.getTime() + days * 86400000).toISOString();
const jobs = [{ platform: 'instagram', status: 'queued' }];
const posts = [
  { id: 'a', title: 'Monday tip', client_id: 'c1', status: 'scheduled', scheduled_for: at(1), assigned_to: null, publish_jobs: jobs },
  { id: 'b', title: 'Needs OK', client_id: 'c1', status: 'pending_approval', scheduled_for: at(2), assigned_to: null, publish_jobs: jobs },
  { id: 'c', title: 'Mine', client_id: 'c2', status: 'scheduled', scheduled_for: at(3), assigned_to: 'me', publish_jobs: jobs },
  { id: 'd', title: 'Broke', client_id: 'c2', status: 'failed', scheduled_for: at(-2), assigned_to: null, publish_jobs: jobs },
  { id: 'e', title: 'Later', client_id: 'c1', status: 'scheduled', scheduled_for: at(10), assigned_to: 'me', publish_jobs: jobs }
];
const clients = [{ id: 'c1', name: 'PK Works' }, { id: 'c2', name: 'Revere' }];
const titles = (sections) => sections.map((s) => s.title);
const admin = weekAheadSections({ posts, clients, member: { user_id: 'me', role: 'admin' }, now, timeZone: 'America/New_York' });
assert.deepStrictEqual(titles(admin), ['Waiting on you (3)', 'Going out this week (3)', 'Needs a look (1)']);
assert.deepStrictEqual(admin[0].items.map((i) => i.badge), ['Needs approval', 'Assigned to you', 'Assigned to you']);
assert.match(admin[1].items[0].title, /PK Works · Monday tip/);
const user = weekAheadSections({ posts, clients, member: { user_id: 'someone', role: 'user' }, now, timeZone: 'America/New_York' });
assert.deepStrictEqual(titles(user), ['Going out this week (3)', 'Needs a look (1)'], 'users are not asked to approve');
assert.deepStrictEqual(weekAheadSections({ posts: [], clients, member: { user_id: 'x', role: 'admin' }, now, timeZone: 'UTC' }), [], 'nothing to say means no email');
assert.strictEqual(DEFAULT_PREFERENCES.week_ahead, true, 'on by default');
console.log('week-ahead: ok');
