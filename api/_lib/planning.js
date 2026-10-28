// Planning ahead: reminders about upcoming holidays and key dates ("It's February 1. Have you started on
// Valentine's Day ideas yet?"), sent as far ahead as each person chooses, and the "What to post next"
// note: AI suggestions per client from its recent results, gaps in the schedule, and dates coming up.
const { Anthropic } = require('@anthropic-ai/sdk');
const { databaseRequest, getWorkspaceState, WORKSPACE_TIMEZONES, zonedParts } = require('./core');
const { observancesFor, upcomingObservances, leadPhrase } = require('../../js/observances');

const PLANNING_LEADS = [7, 14, 30, 60, 90];
const DEFAULT_LEADS = [30];
// Dates within a few days of each other share one reminder (Thanksgiving through Giving Tuesday is one heads-up).
const CLUSTER_GAP_DAYS = 3;
const NOTE_MODEL = 'claude-opus-5-5';
const NOTE_MAX_AGE_DAYS = 7;

const dayMs = 86400000;
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const toDay = (iso) => Date.parse(`${iso}T00:00:00Z`);
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
function localIso(now, timeZone) {
  const parts = zonedParts(now, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}
function niceDate(iso, { weekday = false } = {}) {
  return new Date(toDay(iso)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', ...(weekday ? { weekday: 'short' } : {}) });
}
function normalLeads(value) {
  return Array.isArray(value) ? [...new Set(value.map(Number))].filter((lead) => PLANNING_LEADS.includes(lead)).sort((a, b) => b - a) : DEFAULT_LEADS;
}

// Groups the in-scope dates around `todayIso` into clusters that start a reminder together.
function clustersAround(todayIso, scope) {
  const year = Number(todayIso.slice(0, 4));
  const items = [year - 1, year, year + 1].flatMap((y) => observancesFor(y)).filter((item) => !item.lead && (scope === 'all' || item.major));
  const clusters = [];
  for (const item of items) {
    const last = clusters[clusters.length - 1];
    if (last && toDay(item.date) - toDay(last[last.length - 1].date) <= CLUSTER_GAP_DAYS * dayMs) last.push(item);
    else clusters.push([item]);
  }
  return clusters;
}

// The reminders due today for one person: each is a group of dates and how far off the first one is.
function planningRemindersFor(todayIso, { leads = DEFAULT_LEADS, scope = 'major' } = {}) {
  const chosen = normalLeads(leads);
  if (!chosen.length) return [];
  const today = toDay(todayIso), reminders = [];
  const clusters = clustersAround(todayIso, scope === 'all' ? 'all' : 'major');
  for (const lead of chosen) {
    for (const cluster of clusters) if (toDay(cluster[0].date) - today === lead * dayMs) reminders.push({ lead, items: cluster });
  }
  // Clock changes always come a week ahead: it's about checking scheduled times, not content.
  const year = Number(todayIso.slice(0, 4));
  for (const item of [...observancesFor(year), ...observancesFor(year + 1)]) {
    if (item.lead && toDay(item.date) - today === item.lead * dayMs) reminders.push({ lead: item.lead, items: [item] });
  }
  return reminders;
}

function planningReminderCopy(reminder, todayIso) {
  // A major date leads even when a fun day comes a day or two before it.
  const ordered = [...reminder.items.filter((item) => item.major), ...reminder.items.filter((item) => !item.major)];
  const [first, ...rest] = ordered;
  const phrase = leadPhrase(reminder.lead);
  const names = ordered.map((item) => item.name);
  const subject = names.length === 1 ? `${names[0]} is` : names.length === 2 ? `${names[0]} and ${names[1]} are` : `${names[0]}, ${names[1]}, and ${names.length - 2} more are`;
  const ask = first.lead ? '' : ` Have you started on ${first.name} ideas yet?`;
  const also = rest.length ? ` Also coming up: ${rest.map((item) => `${item.name} (${niceDate(item.date)})`).join(', ')}.` : '';
  return {
    title: first.lead ? `Heads-up: ${first.name} ${phrase}` : `${subject} ${phrase}`,
    body: `It’s ${niceDate(todayIso)}.${ask} ${first.tip}${also}`.replace(/\s+/g, ' ').trim(),
    date: reminder.items[0].date
  };
}

// Once a day per workspace, after 8 AM local time: each person's reminders as in-app notifications
// (and push). Emails come only with "Email me: right away"; wrap-ups list what's coming up instead.
async function processPlanningReminders({ now = new Date(), limit = 20 } = {}) {
  const { notify } = require('./notify');
  const { lastWorkerRun, recordWorkerRun } = require('./publishing');
  const rows = await databaseRequest('workspace_state?select=workspace_id,state') || [];
  let workspaces = 0, sent = 0;
  for (const row of rows) {
    if (workspaces >= limit) break;
    const timeZone = WORKSPACE_TIMEZONES[row.state?.settings?.timezone] || 'America/New_York';
    if (zonedParts(now, timeZone).hour < 8) continue;
    const todayIso = localIso(now, timeZone);
    const runName = `planning:${row.workspace_id}:${todayIso}`;
    if (await lastWorkerRun(runName)) continue;
    workspaces += 1;
    const members = await databaseRequest(`workspace_members?workspace_id=eq.${row.workspace_id}&select=user_id`) || [];
    const prefs = members.length ? await databaseRequest(`notification_preferences?user_id=in.(${members.map((member) => member.user_id).join(',')})&select=user_id,planning_leads,planning_scope`).catch(() => []) || [] : [];
    const byUser = new Map(prefs.map((item) => [item.user_id, item]));
    // People with the same choices get the same reminders, so they share one notification call.
    const groups = new Map();
    for (const member of members) {
      const pref = byUser.get(member.user_id);
      const reminders = planningRemindersFor(todayIso, { leads: pref?.planning_leads ?? DEFAULT_LEADS, scope: pref?.planning_scope || 'major' });
      for (const reminder of reminders) {
        const copy = planningReminderCopy(reminder, todayIso);
        const key = `${copy.title}|${copy.body}`;
        if (!groups.has(key)) groups.set(key, { copy, userIds: [] });
        groups.get(key).userIds.push(member.user_id);
      }
    }
    for (const { copy, userIds } of groups.values()) {
      sent += await notify({ workspaceId: row.workspace_id, audience: 'users', userIds, type: 'planning_reminder', category: 'planning', title: copy.title, body: copy.body, view: 'calendar', data: { date: copy.date, planning: true } });
    }
    await recordWorkerRun(runName, { reminders: groups.size });
  }
  return { workspaces, sent };
}

// "Coming up" for an email wrap-up: dates within reach of the person's reminder window.
function comingUpSection(todayIso, prefs, periodDays = 30) {
  const leads = normalLeads(prefs?.planning_leads ?? DEFAULT_LEADS);
  if (!leads.length) return [];
  const window = Math.min(120, Math.max(30, Math.max(...leads) + periodDays));
  const items = upcomingObservances(todayIso, window, { scope: prefs?.planning_scope === 'all' ? 'all' : 'major' }).filter((item) => !item.lead || item.daysAway <= 14).slice(0, 10);
  if (!items.length) return [];
  return [{ title: 'Coming up: dates to plan for', items: items.map((item) => ({ title: `${item.name} · ${niceDate(item.date, { weekday: true })}`, body: item.tip, meta: capitalize(leadPhrase(item.daysAway)) })) }];
}

// --- What to post next ---

const NOTE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['working', 'gaps', 'dates', 'ideas'],
  properties: {
    working: { type: 'string', description: 'One or two sentences on what has worked lately, citing the posts or numbers. If there is no history yet, say so briefly.' },
    gaps: { type: 'string', description: 'One sentence on gaps in the upcoming schedule (empty days, networks with nothing planned). Empty string if the schedule looks full.' },
    dates: {
      type: 'array', description: 'Up to 5 upcoming dates from the list that genuinely fit this client, soonest first. Leave out dates that do not fit the brand.',
      items: {
        type: 'object', additionalProperties: false, required: ['name', 'date', 'angle'],
        properties: { name: { type: 'string', description: 'Exactly as given in the list.' }, date: { type: 'string', description: 'YYYY-MM-DD, exactly as given in the list.' }, angle: { type: 'string', description: 'One sentence: how this client could use the date.' } }
      }
    },
    ideas: {
      type: 'array', description: 'Three to five post ideas for the next few weeks.',
      items: {
        type: 'object', additionalProperties: false, required: ['title', 'why', 'date', 'platforms', 'starter'],
        properties: {
          title: { type: 'string', description: 'A short name for the post idea.' },
          why: { type: 'string', description: 'One sentence linking the idea to the results, a schedule gap, or a date.' },
          date: { type: 'string', description: 'Suggested day to post (YYYY-MM-DD) within the next 60 days, or an empty string.' },
          platforms: { type: 'array', items: { type: 'string' }, description: 'Network keys from the connected list.' },
          starter: { type: 'string', description: 'A first draft of the caption in the brand voice, ready to edit.' }
        }
      }
    }
  }
};

// What the note is based on: recent results, the schedule, and dates coming up.
async function planningContext({ workspaceId, client, timeZone, now = new Date() }) {
  const todayIso = localIso(now, timeZone);
  const since = new Date(now - 90 * dayMs).toISOString();
  const until = new Date(now.getTime() + 30 * dayMs).toISOString();
  const [posts, scheduled, connections] = await Promise.all([
    databaseRequest(`network_posts?workspace_id=eq.${workspaceId}&client_id=eq.${encodeURIComponent(client.id)}&published_at=gte.${since}&select=platform,text,published_at,metrics&order=published_at.desc&limit=300`).catch(() => []),
    databaseRequest(`scheduled_posts?workspace_id=eq.${workspaceId}&client_id=eq.${encodeURIComponent(client.id)}&status=in.(scheduled,pending_approval)&scheduled_for=gte.${now.toISOString()}&scheduled_for=lte.${until}&parent_id=is.null&select=title,scheduled_for,status&order=scheduled_for.asc&limit=100`).catch(() => []),
    databaseRequest(`social_connections?workspace_id=eq.${workspaceId}&client_id=eq.${encodeURIComponent(client.id)}&status=eq.active&select=platform`).catch(() => [])
  ]);
  const measured = (posts || []).filter((post) => typeof post.metrics?.engagements === 'number');
  const top = [...measured].sort((a, b) => b.metrics.engagements - a.metrics.engagements).slice(0, 6);
  const byNetwork = {};
  for (const post of posts || []) {
    const entry = byNetwork[post.platform] ||= { posts: 0, engagements: 0, measured: 0 };
    entry.posts += 1;
    if (typeof post.metrics?.engagements === 'number') { entry.engagements += post.metrics.engagements; entry.measured += 1; }
  }
  const busy = new Set((scheduled || []).map((post) => localIso(new Date(post.scheduled_for), timeZone)));
  const emptyDays = Array.from({ length: 14 }, (_, index) => isoDay(toDay(todayIso) + (index + 1) * dayMs)).filter((day) => !busy.has(day));
  return {
    todayIso,
    networks: [...new Set((connections || []).map((item) => item.platform))],
    top: top.map((post) => ({ platform: post.platform, date: post.published_at.slice(0, 10), engagements: post.metrics.engagements, views: post.metrics.views ?? post.metrics.reach ?? null, text: String(post.text || '').slice(0, 280) })),
    byNetwork: Object.fromEntries(Object.entries(byNetwork).map(([platform, entry]) => [platform, { posts: entry.posts, avgEngagements: entry.measured ? Math.round(entry.engagements / entry.measured) : null }])),
    scheduled: (scheduled || []).map((post) => ({ date: localIso(new Date(post.scheduled_for), timeZone), title: String(post.title || 'Untitled').slice(0, 100), waiting: post.status === 'pending_approval' })),
    emptyDays,
    dates: upcomingObservances(todayIso, 75, { ongoing: true }).map((item) => ({ name: item.name, date: item.date, kind: item.kind, major: item.major, tip: item.tip }))
  };
}

function aiClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw Object.assign(new Error('AI suggestions are not configured. Add ANTHROPIC_API_KEY to the server environment.'), { status: 503 });
  return new Anthropic();
}

async function generatePlanningNote({ client, context }) {
  const brand = client.brand || {};
  const about = [
    `Client: ${client.name}${client.desc ? ` — ${client.desc}` : ''}`,
    brand.voice && `Brand voice: ${brand.voice}`,
    brand.requiredHashtags && `Always include: ${brand.requiredHashtags}`,
    brand.bannedWords && `Never use these words: ${brand.bannedWords}`
  ].filter(Boolean).join('\n');
  const response = await aiClient().beta.messages.create({
    model: NOTE_MODEL,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: NOTE_SCHEMA } },
    system: `You help a social media manager plan ahead for one client. They work a month or two in advance, so favor dates and ideas they can start on now. Base "working" on the numbers given, never invented ones. Pick only dates that make sense for this brand and its audience (a law firm skips National Rum Day; a bakery uses National Coffee Day). Be careful with sensitive dates (remembrance days, religious holidays, awareness months): suggest respectful angles and no sales pushes. Ideas should mix proven formats from the top posts, fills for empty days, and the chosen dates. Use only the connected networks for platforms (or leave platforms empty if none are connected). Captions follow the brand voice and never invent prices, offers, or facts.\n\n${about}`,
    messages: [{ role: 'user', content: `Today is ${context.todayIso}.\n\nConnected networks: ${context.networks.join(', ') || 'none yet'}\n\nTop posts, last 90 days (by engagements):\n${context.top.length ? context.top.map((post) => `- ${post.date} ${post.platform}: ${post.engagements} engagements${post.views !== null ? `, ${post.views} views` : ''} — "${post.text}"`).join('\n') : '(no published posts with results yet)'}\n\nBy network, last 90 days: ${JSON.stringify(context.byNetwork)}\n\nScheduled in the next 30 days:\n${context.scheduled.length ? context.scheduled.map((post) => `- ${post.date}: ${post.title}${post.waiting ? ' (waiting for approval)' : ''}`).join('\n') : '(nothing scheduled)'}\n\nDays in the next two weeks with nothing scheduled: ${context.emptyDays.join(', ') || 'none'}\n\nUpcoming dates (US):\n${context.dates.map((item) => `- ${item.date} ${item.name} [${item.kind}${item.major ? ', major' : ''}]: ${item.tip}`).join('\n')}` }]
  });
  if (response.stop_reason === 'refusal') throw Object.assign(new Error('The request was declined.'), { status: 422 });
  if (response.stop_reason === 'max_tokens') throw new Error('The suggestions ran out of room. Try again.');
  const raw = JSON.parse(response.content.find((block) => block.type === 'text')?.text || '{}');
  const known = new Map(context.dates.map((item) => [`${item.date}|${item.name}`, item]));
  const validDay = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value > context.todayIso && toDay(value) - toDay(context.todayIso) <= 90 * dayMs ? value : '';
  const text = (value, max) => String(value || '').trim().slice(0, max);
  return {
    working: text(raw.working, 600),
    gaps: text(raw.gaps, 400),
    dates: (raw.dates || []).filter((item) => known.has(`${item.date}|${item.name}`)).slice(0, 5).map((item) => ({ name: item.name, date: item.date, angle: text(item.angle, 300), major: known.get(`${item.date}|${item.name}`).major })),
    ideas: (raw.ideas || []).slice(0, 5).map((item) => ({
      title: text(item.title, 120), why: text(item.why, 300), date: validDay(item.date),
      platforms: (Array.isArray(item.platforms) ? item.platforms : []).filter((platform) => context.networks.includes(platform)).slice(0, 6),
      starter: text(item.starter, 2200)
    })).filter((item) => item.title)
  };
}

async function latestPlanningNote(workspaceId, clientId) {
  const [row] = await databaseRequest(`planning_notes?workspace_id=eq.${workspaceId}&client_id=eq.${encodeURIComponent(clientId)}&select=id,data,created_at&order=created_at.desc&limit=1`) || [];
  return row ? { ...row.data, createdAt: row.created_at } : null;
}

async function createPlanningNote({ workspaceId, client, timeZone, userId = null, now = new Date() }) {
  const context = await planningContext({ workspaceId, client, timeZone, now });
  const note = await generatePlanningNote({ client, context });
  const [row] = await databaseRequest('planning_notes', { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify({ workspace_id: workspaceId, client_id: client.id, data: note, created_by: userId }) });
  // Older notes aren't needed: keep the latest few per client.
  const old = await databaseRequest(`planning_notes?workspace_id=eq.${workspaceId}&client_id=eq.${encodeURIComponent(client.id)}&select=id&order=created_at.desc&offset=5`).catch(() => []) || [];
  if (old.length) await databaseRequest(`planning_notes?id=in.(${old.map((item) => item.id).join(',')})`, { method: 'DELETE' }).catch(() => {});
  return { ...note, createdAt: row?.created_at || now.toISOString() };
}

// Weekly refresh: clients with posts in the last 60 days or coming up get a fresh note once their
// latest is a week old. One per run, since each takes a little while to write.
async function processPlanningNotes({ now = new Date(), limit = 1 } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) return { created: 0, configured: false };
  // Looking for clients that are due takes a few queries, so it runs at most every half hour.
  const { lastWorkerRun, recordWorkerRun } = require('./publishing');
  const lastCheck = await lastWorkerRun('planning-notes');
  if (lastCheck && now - Date.parse(lastCheck) < 30 * 60000) return { created: 0, skipped: true };
  await recordWorkerRun('planning-notes', {});
  const since = new Date(now - 60 * dayMs).toISOString();
  const active = await databaseRequest(`scheduled_posts?scheduled_for=gte.${since}&parent_id=is.null&select=workspace_id,client_id&order=scheduled_for.desc&limit=2000`) || [];
  const pairs = [...new Map(active.map((row) => [`${row.workspace_id}|${row.client_id}`, row])).values()];
  let created = 0;
  for (const pair of pairs) {
    if (created >= limit) break;
    const latest = await latestPlanningNote(pair.workspace_id, pair.client_id);
    if (latest && now - Date.parse(latest.createdAt) < NOTE_MAX_AGE_DAYS * dayMs) continue;
    const state = await getWorkspaceState(pair.workspace_id);
    const client = (state.clients || []).find((item) => item.id === pair.client_id);
    if (!client) continue;
    const timeZone = WORKSPACE_TIMEZONES[state.settings?.timezone] || 'America/New_York';
    try {
      await createPlanningNote({ workspaceId: pair.workspace_id, client, timeZone, now });
      created += 1;
    } catch (error) {
      console.error('Planning note failed:', pair.client_id, error.message);
      // Don't retry a failing client every run: try again tomorrow.
      await databaseRequest('planning_notes', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ workspace_id: pair.workspace_id, client_id: pair.client_id, data: { failed: true, working: '', gaps: '', dates: [], ideas: [] }, created_at: new Date(now - (NOTE_MAX_AGE_DAYS - 1) * dayMs).toISOString() }) }).catch(() => {});
      break;
    }
  }
  return { created, configured: true };
}

// "What to post next" for an admin's wrap-up: each client's latest note, if it's recent.
async function planningNotesSection(workspaceId, clients, now = new Date()) {
  const rows = await databaseRequest(`planning_notes?workspace_id=eq.${workspaceId}&created_at=gte.${new Date(now - 10 * dayMs).toISOString()}&select=client_id,data,created_at&order=created_at.desc&limit=100`).catch(() => []) || [];
  const latest = new Map();
  rows.forEach((row) => { if (!latest.has(row.client_id) && !row.data?.failed) latest.set(row.client_id, row.data); });
  const items = [];
  for (const [clientId, note] of latest) {
    const name = clients.find((client) => client.id === clientId)?.name;
    if (!name) continue;
    const ideas = (note.ideas || []).slice(0, 3).map((idea) => `${idea.title}${idea.date ? ` (${niceDate(idea.date)})` : ''}`);
    items.push({ title: `${name}: what to post next`, body: [note.working, note.gaps, ideas.length && `Ideas: ${ideas.join('; ')}.`].filter(Boolean).join(' '), meta: (note.dates || []).length ? `Dates that fit: ${note.dates.map((item) => item.name).join(', ')}` : '' });
  }
  return items.length ? [{ title: 'What to post next', items: items.slice(0, 8) }] : [];
}

module.exports = {
  PLANNING_LEADS, planningRemindersFor, planningReminderCopy, processPlanningReminders, comingUpSection,
  planningContext, createPlanningNote, latestPlanningNote, processPlanningNotes, planningNotesSection, NOTE_MAX_AGE_DAYS
};
