// Planning: holiday and key-date math, reminders ("Valentine's Day is in 2 weeks"), wrap-up "Coming up",
// the "What to post next" note, and which comments still need a reply.
const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
const crypto = require('node:crypto');
const key = crypto.randomBytes(32);
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', SOCIAL_PROFILE_ENCRYPTION_KEY: key.toString('base64'), ANTHROPIC_API_KEY: 'test' });
const { observancesFor, upcomingObservances, leadPhrase } = require(ROOT + '/js/observances.js');
const planning = require(ROOT + '/api/_lib/planning.js');

// --- dates
const on = (year, name) => observancesFor(year).find((item) => item.name === name)?.date;
assert.equal(on(2026, 'Thanksgiving'), '2026-11-26');
assert.equal(on(2026, 'Black Friday'), '2026-11-27');
assert.equal(on(2026, 'Easter'), '2026-04-05');
assert.equal(on(2027, 'Easter'), '2027-03-28');
assert.equal(on(2026, 'Mother’s Day'), '2026-05-10');
assert.equal(on(2026, 'Father’s Day'), '2026-06-21');
assert.equal(on(2026, 'Memorial Day'), '2026-05-25');
assert.equal(on(2026, 'Labor Day'), '2026-09-07');
assert.equal(on(2026, 'Super Bowl Sunday'), '2026-02-08');
assert.equal(on(2026, 'Mardi Gras'), '2026-02-17');
assert.equal(on(2026, 'Daylight Saving Time begins'), '2026-03-08');
assert.equal(on(2026, 'Daylight Saving Time ends'), '2026-11-01');
assert.equal(on(2026, 'First day of winter'), '2026-12-21');
assert.equal(on(2025, 'First day of summer'), '2025-06-20', 'the 2025 solstice is the evening of June 20 in US Eastern time');
assert.equal(on(2027, 'First day of fall'), '2027-09-23');
assert.equal(on(2026, 'Tax Day'), '2026-04-15');
assert.equal(on(2028, 'Tax Day'), '2028-04-17', 'moves off a weekend');
assert.equal(on(2026, 'Election Day'), '2026-11-03');
assert.equal(on(2027, 'Election Day'), undefined, 'only in even years');
assert.equal(on(2028, 'Leap Day'), '2028-02-29');
assert.equal(on(2026, 'Hanukkah begins'), '2026-12-04');
const hispanic = observancesFor(2026).find((item) => item.name === 'Hispanic Heritage Month');
assert.deepEqual([hispanic.date, hispanic.end], ['2026-09-15', '2026-10-15']);
assert.equal(observancesFor(2026).find((item) => item.name === 'Pride Month').end, '2026-06-30');
assert.ok(observancesFor(2026).every((item, index, list) => !index || list[index - 1].date <= item.date), 'sorted by date');
assert.ok(observancesFor(2026).every((item) => item.tip && item.kind), 'every date has a content tip');
const soon = upcomingObservances('2026-10-28', 10, { scope: 'major' });
assert.deepEqual(soon.map((item) => [item.name, item.daysAway]), [['Halloween', 3], ['Daylight Saving Time ends', 4]]);
assert.ok(upcomingObservances('2026-10-28', 10).some((item) => item.name === 'Boss’s Day') === false, 'Boss’s Day already passed');
assert.ok(upcomingObservances('2026-10-20', 3, { ongoing: true }).some((item) => item.name === 'Breast Cancer Awareness Month'), 'awareness months under way');
assert.deepEqual(upcomingObservances('2026-12-20', 14, { scope: 'major' }).map((item) => item.name), ['First day of winter', 'Christmas Eve', 'Christmas Day', 'New Year’s Eve', 'New Year’s Day'], 'crosses into next year');
assert.deepEqual([1, 5, 7, 14, 30, 60, 90].map(leadPhrase), ['tomorrow', 'in 5 days', 'next week', 'in 2 weeks', 'about a month away', 'about 2 months away', 'about 3 months away']);

// --- reminders
const titles = (day, options) => planning.planningRemindersFor(day, options).map((reminder) => planning.planningReminderCopy(reminder, day).title);
assert.deepEqual(titles('2026-01-31', { leads: [14] }), ['Valentine’s Day is in 2 weeks']);
const valentine = planning.planningReminderCopy(planning.planningRemindersFor('2026-01-31', { leads: [14] })[0], '2026-01-31');
assert.equal(valentine.body, 'It’s January 31. Have you started on Valentine’s Day ideas yet? Gift guides, couples and Galentine’s angles, and last-minute offers.');
assert.equal(valentine.date, '2026-02-14');
assert.deepEqual(titles('2026-01-15', { leads: [30] }), ['Valentine’s Day is about a month away']);
assert.deepEqual(titles('2025-12-16', { leads: [60] }), ['Valentine’s Day is about 2 months away']);
// Thanksgiving through Giving Tuesday (and Hanukkah right after) is one heads-up, not five.
const thanks = planning.planningRemindersFor('2026-10-27', { leads: [30] });
assert.equal(thanks.length, 1);
assert.deepEqual(thanks[0].items.map((item) => item.name), ['Thanksgiving', 'Black Friday', 'Small Business Saturday', 'Cyber Monday', 'Giving Tuesday', 'Hanukkah begins']);
assert.equal(planning.planningReminderCopy(thanks[0], '2026-10-27').title, 'Thanksgiving, Black Friday, and 4 more are about a month away');
assert.match(planning.planningReminderCopy(thanks[0], '2026-10-27').body, /Also coming up: Black Friday \(November 27\), Small Business Saturday/);
assert.deepEqual(titles('2026-11-12', { leads: [30] }), [], 'not on other days');
// Several lead times: each fires on its own day.
assert.deepEqual(titles('2026-01-31', { leads: [60, 14] }), ['Valentine’s Day is in 2 weeks']);
assert.deepEqual(titles('2025-12-16', { leads: [60, 14] }), ['Valentine’s Day is about 2 months away']);
// Never: nothing at all, not even clock changes.
assert.deepEqual(titles('2026-10-25', { leads: [] }), []);
// Clock changes always come a week ahead, whatever lead time is chosen.
assert.deepEqual(titles('2026-10-25', { leads: [90] }), ['Heads-up: Daylight Saving Time ends next week']);
// Fun days only with "everything".
assert.deepEqual(titles('2026-09-15', { leads: [14] }), []);
assert.deepEqual(titles('2026-09-15', { leads: [14], scope: 'all' }), ['Breast Cancer Awareness Month and National Coffee Day are in 2 weeks'], 'the major date leads');
assert.deepEqual(titles('2026-01-01', { leads: [7, 'x', 45] }), [], 'unknown lead times are ignored');

// --- Coming up in wrap-ups
const coming = planning.comingUpSection('2026-10-01', { planning_leads: [30], planning_scope: 'major' }, 30);
assert.equal(coming[0].title, 'Coming up: dates to plan for');
const comingTitles = coming[0].items.map((item) => item.title);
assert.ok(coming[0].items.some((item) => item.title === 'Halloween · Sat, October 31' && item.meta === 'About a month away'));
assert.ok(comingTitles.includes('Thanksgiving · Thu, November 26'), 'reaches past the reminder window by the wrap-up period');
assert.ok(!comingTitles.some((title) => title.startsWith('Daylight Saving')), 'clock changes only show when they’re close');
assert.deepEqual(planning.comingUpSection('2026-10-01', { planning_leads: [] }), [], 'Never: no Coming up');

// --- fake services for the note and the comment inbox
const calls = [];
let planningRows = [];
const ok = (body, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let aiRequest = null;
global.fetch = async (input, opts = {}) => {
  const url = String(input.url || input), method = opts.method || 'GET';
  let body; try { body = opts.body ? JSON.parse(opts.body) : undefined; } catch {}
  calls.push({ url, method, body });
  if (url.includes('api.anthropic.com')) {
    aiRequest = body;
    return ok({ id: 'msg', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: JSON.stringify({
      working: 'Reels with the team got 3× the engagement of photos.', gaps: 'Nothing is scheduled Nov 4–10.',
      dates: [{ name: 'Halloween', date: '2026-10-31', angle: 'Team costume reel.' }, { name: 'Made-up Day', date: '2026-11-02', angle: 'x' }],
      ideas: [
        { title: 'Costume reel', why: 'Reels do best.', date: '2026-10-30', platforms: ['instagram', 'tiktok'], starter: 'Who wore it best?' },
        { title: 'Old idea', why: 'x', date: '2020-01-01', platforms: [], starter: '' }
      ]
    }) }] });
  }
  if (url.includes('/rest/v1/network_posts?')) return ok([{ platform: 'instagram', text: 'Team reel', published_at: '2026-10-10T15:00:00Z', metrics: { engagements: 300, views: 4000 } }, { platform: 'instagram', text: 'Photo', published_at: '2026-10-12T15:00:00Z', metrics: { engagements: 100 } }]);
  if (url.includes('/rest/v1/scheduled_posts?') && url.includes('status=in.')) return ok([{ title: 'Fall menu', scheduled_for: '2026-10-29T16:00:00Z', status: 'scheduled' }]);
  if (url.includes('/rest/v1/social_connections?')) return ok([{ platform: 'instagram' }, { platform: 'facebook' }]);
  if (url.includes('/rest/v1/planning_notes') && method === 'POST') { planningRows.unshift({ id: 'n1', client_id: body.client_id, data: body.data, created_at: '2026-10-28T13:00:00Z' }); return ok([planningRows[0]]); }
  if (url.includes('/rest/v1/planning_notes?') && url.includes('offset=5')) return ok([]);
  if (url.includes('/rest/v1/planning_notes?')) return ok(planningRows.slice(0, 1));
  return ok([]);
};

(async () => {
  const client = { id: 'pk-works', name: 'PK Works', desc: 'Creative studio', brand: { voice: 'Warm, plain-spoken' } };
  const now = new Date('2026-10-28T13:00:00Z');
  const context = await planning.planningContext({ workspaceId: 'ws-1', client, timeZone: 'America/New_York', now });
  assert.equal(context.todayIso, '2026-10-28');
  assert.deepEqual(context.networks, ['instagram', 'facebook']);
  assert.equal(context.top[0].engagements, 300);
  assert.deepEqual(context.byNetwork.instagram, { posts: 2, avgEngagements: 200 });
  assert.equal(context.emptyDays.length, 13, 'Oct 29 has a post; the other 13 days are empty');
  assert.ok(context.dates.some((item) => item.name === 'Halloween'));
  assert.ok(context.dates.some((item) => item.name === 'Breast Cancer Awareness Month'), 'ongoing months are included');
  const note = await planning.createPlanningNote({ workspaceId: 'ws-1', client, timeZone: 'America/New_York', now });
  assert.equal(aiRequest.model, 'claude-opus-5-5');
  assert.match(aiRequest.system, /Warm, plain-spoken/);
  assert.match(aiRequest.messages[0].content, /Today is 2026-10-28/);
  assert.match(aiRequest.messages[0].content, /2026-10-31 Halloween \[holiday, major\]/);
  assert.deepEqual(note.dates.map((item) => item.name), ['Halloween'], 'dates not on the list are dropped');
  assert.deepEqual(note.ideas[0].platforms, ['instagram'], 'only connected networks');
  assert.equal(note.ideas[1].date, '', 'past dates are cleared');
  assert.equal(note.working, 'Reels with the team got 3× the engagement of photos.');
  assert.equal((await planning.latestPlanningNote('ws-1', 'pk-works')).createdAt, '2026-10-28T13:00:00Z');
  const section = await planning.planningNotesSection('ws-1', [client], now);
  assert.equal(section[0].items[0].title, 'PK Works: what to post next');
  assert.match(section[0].items[0].body, /Ideas: Costume reel \(October 30\); Old idea\./);

  // --- comments: answered when we replied (here or on the network) or someone marked it done
  const publishing = require(ROOT + '/api/_lib/publishing.js');
  const platforms = require(ROOT + '/api/_lib/platforms.js');
  const job = { id: 'aaaaaaaa-0000-0000-0000-000000000001', post_id: 'bbbbbbbb-0000-0000-0000-000000000001', client_id: 'pk-works', platform: 'facebook', external_id: 'page_1', connection_id: 'cccccccc-0000-0000-0000-000000000001', published_at: '2026-10-27T15:00:00Z', metrics: { comments: 3 }, url: 'https://fb/post' };
  const adapter = platforms.adapterFor('facebook');
  adapter.listComments = async () => [
    { id: 'c1', author: 'Ana Ruiz', text: 'Love this!', at: '2026-10-27T16:00:00Z', replies: [] },
    { id: 'c2', author: 'Ben', text: 'Price?', at: '2026-10-27T17:00:00Z', replies: [{ id: 'r1', author: 'PK Works', text: 'DM sent', mine: true }] },
    { id: 'c3', author: 'Cy', text: 'Cool', at: '2026-10-27T18:00:00Z', replies: [] },
    { id: 'c4', author: 'PK Works', text: 'Thanks all!', at: '2026-10-27T19:00:00Z', replies: [], mine: true }
  ];
  global.fetch = async (input, opts = {}) => {
    const url = String(input.url || input), method = opts.method || 'GET';
    calls.push({ url, method, body: opts.body });
    if (url.includes('/rest/v1/publish_jobs?')) return ok([job, { ...job, id: 'aaaaaaaa-0000-0000-0000-000000000002', metrics: { comments: 0 } }]);
    if (url.includes('/rest/v1/comment_states?') && method === 'GET') return ok([{ job_id: job.id, comment_id: 'c3', state: 'done' }]);
    if (url.includes('/rest/v1/scheduled_posts?')) return ok([{ id: job.post_id, title: 'Fall menu launch' }]);
    if (url.includes('/rest/v1/social_connections?')) return ok([{ id: job.connection_id, platform: 'facebook', status: 'active', external_id: 'page_1', token_ciphertext: require(ROOT + '/api/_lib/core.js').encryptSecret('tok', key) }]);
    return ok([]);
  };
  const open = await publishing.openComments('ws-1', { encryptionKey: key });
  assert.deepEqual(open.comments.map((item) => [item.id, item.author, item.postTitle]), [['c1', 'Ana Ruiz', 'Fall menu launch']]);
  assert.deepEqual(open.counts, { [job.id]: 1 });
  assert.equal(open.checked, 1, 'posts with no comments are skipped');
  assert.ok(calls.some((call) => call.url.includes('/rest/v1/publish_jobs?') && call.url.includes('published_at=gte.')));
  calls.length = 0;
  await publishing.setCommentState('ws-1', job.id, 'c1', 'done', 'user-1').catch(() => {});
  assert.ok(calls.some((call) => call.url.includes('comment_states?on_conflict=workspace_id,job_id,comment_id') && JSON.parse(call.body).state === 'done'));
  calls.length = 0;
  await publishing.setCommentState('ws-1', job.id, 'c1', null).catch(() => {});
  assert.ok(calls.some((call) => call.method === 'DELETE' && call.url.includes('comment_states?') && call.url.includes('comment_id=eq.c1')));
  console.log('planning tests passed');
})().catch((error) => { console.error(error); process.exit(1); });
