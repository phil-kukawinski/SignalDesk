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

// A Story series is one row with its time span; a regular post with the same text stays its own row.
const base = Date.parse(at(5));
const story = (n) => ({ id: `s${n}`, title: 'Norway', client_id: 'c1', status: 'scheduled', scheduled_for: new Date(base + n * 60000).toISOString(), publish_jobs: [{ platform: 'instagram_story', status: 'queued' }] });
const series = weekAheadSections({ posts: [{ ...story(0), id: 'feed', publish_jobs: [{ platform: 'instagram', status: 'queued' }] }, ...[1, 2, 3, 4, 5, 6, 7, 8].map(story)], clients, member: { user_id: 'x', role: 'user' }, now, timeZone: 'America/New_York' })[0];
assert.strictEqual(series.title, 'Going out this week (9)', 'the count is still posts');
assert.strictEqual(series.items.length, 2);
assert.match(series.items[1].body, /Instagram Story · 8 Stories in a series/);
assert.match(series.items[1].meta, / – \d/, 'shows the time span');
const many = weekAheadSections({ posts: Array.from({ length: 14 }, (_, n) => ({ ...story(0), id: `p${n}`, title: `Post ${n}`, scheduled_for: at(1 + n * 0.3), publish_jobs: jobs })), clients, member: { user_id: 'x', role: 'user' }, now, timeZone: 'America/New_York' })[0];
assert.strictEqual(many.items[12].title, 'And 2 more');
console.log('week-ahead: ok');
