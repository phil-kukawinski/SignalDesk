const { databaseRequest, getWorkspaceState, WORKSPACE_TIMEZONES, zonedParts, zonedToUtc, ayrshareConfigured, getProfile } = require('./core');
const { sendPush } = require('./push');

const CATEGORIES = ['approvals', 'autopilot', 'reports', 'team', 'publishing', 'planning'];
const DEFAULT_PREFERENCES = { week_ahead: true, email_frequency: 'monthly', email_categories: CATEGORIES, weekly_day: 1, monthly_day: 1, yearly_month: 1, custom_days: 14, planning_leads: [30], planning_scope: 'major', last_digest_at: null };
const DIGEST_HOUR = 8;
// Alerts that can't wait for a wrap-up: they're emailed right away (unless email is off or the
// category is unticked) and left out of digests so they don't arrive twice.
const URGENT_TYPES = new Set(['publish_failed', 'publish_unknown', 'connection_expired', 'connection_expiring', 'connection_signed_out', 'posts_at_risk', 'manual_due', 'worker_stalled', 'comment_failed']);
// Status colors shared by every email: green good, yellow attention, red warning, dark red emergency,
// blue for plain updates. LEVEL_ORDER is most serious first.
const STATUS_LEVELS = {
  emergency: { label: 'Emergency', color: '#7f1d1d' },
  warning: { label: 'Warning', color: '#dc2626' },
  attention: { label: 'Attention', color: '#ca8a04' },
  good: { label: 'Good', color: '#16a34a' },
  info: { label: 'Update', color: '#0b5fdc' }
};
const LEVEL_ORDER = ['emergency', 'warning', 'attention', 'good', 'info'];
// Emergency: posts are failing or about to fail with no way around it. Warning: something broke.
// Attention: needs someone, nothing is down. Good: a step went through.
const TYPE_LEVELS = {
  worker_stalled: 'emergency', posts_at_risk: 'emergency',
  publish_failed: 'warning', connection_expired: 'warning', connection_signed_out: 'warning', comment_failed: 'warning', autopilot_error: 'warning',
  publish_unknown: 'attention', connection_expiring: 'attention', manual_due: 'attention', review_overdue: 'attention', approval_requested: 'attention', autopilot_review: 'attention',
  approval_decided: 'good', client_review: 'good'
};
const levelFor = (type, level) => (STATUS_LEVELS[level] ? level : TYPE_LEVELS[type] || 'info');
const levelRank = (level) => LEVEL_ORDER.indexOf(STATUS_LEVELS[level] ? level : 'info');
// A legend of the colored levels that appear (plain updates aren't colored), most serious last so it reads like a scale.
const levelLegend = (levels) => [...LEVEL_ORDER].reverse().filter((level) => level !== 'info' && levels.includes(level)).map((level) => [STATUS_LEVELS[level].label, STATUS_LEVELS[level].color]);
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CATEGORY_LABELS = { approvals: 'Approvals', autopilot: 'Autopilot', reports: 'Reports', team: 'Team', publishing: 'Publishing', planning: 'Planning' };

function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_FROM_EMAIL);
}

function appUrl() {
  return process.env.APP_URL || (process.env.APP_ORIGINS || '').split(',').map((item) => item.trim()).find((origin) => origin.startsWith('https://')) || '';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

async function preferencesFor(userIds) {
  if (!userIds.length) return new Map();
  const rows = await databaseRequest(`notification_preferences?user_id=in.(${userIds.join(',')})&select=*`) || [];
  return new Map(rows.map((row) => [row.user_id, row]));
}

function withDefaults(row) {
  return { ...DEFAULT_PREFERENCES, ...(row || {}) };
}

// Network colors, matching the charts in SignalDesk.
const NETWORK_COLORS = { facebook: '#2563eb', facebook_story: '#60a5fa', instagram: '#db2777', instagram_story: '#f472b6', linkedin: '#0d9488', threads: '#7c3aed', twitter: '#d97706', pinterest: '#dc2626', youtube: '#ea580c', tiktok: '#0891b2' };
const safeColor = (value) => /^#[0-9a-f]{3,8}$/i.test(String(value)) ? value : '#8d95a3';
function renderEmail({ heading, intro, sections, legend = [], status = null, ctaLabel = 'Open SignalDesk', ctaUrl = '', eyebrow = 'SIGNALDESK', showCta = true, footer = 'Change how often you get these in SignalDesk under Settings → Notifications.' }) {
  const url = showCta ? ctaUrl || appUrl() : '';
  const sectionHtml = sections.map((section) => `
    <h2 style="font:700 14px Arial,sans-serif;color:#101828;margin:24px 0 8px">${escapeHtml(section.title)}</h2>
    ${section.items.map((item) => `<div style="border:1px solid #e4e7ec;${item.color ? `border-left:4px solid ${safeColor(item.color)};` : ''}border-radius:10px;padding:12px 14px;margin:0 0 8px">
      <div style="font:700 13px Arial,sans-serif;color:#101828">${item.color ? `<span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${safeColor(item.color)};margin-right:6px"></span>` : ''}${escapeHtml(item.title)}${item.badge ? ` <span style="display:inline-block;margin-left:6px;padding:2px 8px;border-radius:10px;background:${safeColor(item.color || '#5d6676')};color:#fff;font:700 10px Arial,sans-serif;letter-spacing:.04em;vertical-align:1px">${escapeHtml(item.badge.toUpperCase())}</span>` : ''}</div>
      ${item.bar !== undefined ? `<div style="background:#eef0f3;border-radius:4px;height:8px;margin-top:8px"><div style="width:${Math.max(2, Math.min(100, Math.round(item.bar)))}%;background:${safeColor(item.color || '#0b5fdc')};height:8px;border-radius:4px"></div></div>` : ''}
      ${item.body ? `<div style="font:13px/1.5 Arial,sans-serif;color:#5d6676;margin-top:4px">${escapeHtml(item.body)}</div>` : ''}
      ${item.meta ? `<div style="font:11px Arial,sans-serif;color:#8d95a3;margin-top:6px">${escapeHtml(item.meta)}</div>` : ''}
    </div>`).join('')}`).join('');
  const html = `<div style="background:#f5f6f8;padding:24px"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e4e7ec;${status ? `border-top:6px solid ${safeColor(status.color)};` : ''}border-radius:16px;padding:28px">
    <div style="margin:0 0 18px"><span style="display:inline-block;vertical-align:middle;width:28px;height:28px;line-height:28px;border-radius:7px;background:#001d51;color:#ffffff;text-align:center;font:800 13px Arial,sans-serif;letter-spacing:-.04em">S<span style="color:#4d9bff">D</span></span> <span style="vertical-align:middle;font:700 16px Arial,sans-serif;color:#001d51">Signal<span style="color:#0469fa">Desk</span></span></div>
    <div style="font:600 10px Arial,sans-serif;letter-spacing:.08em;color:#0b5fdc">${escapeHtml(eyebrow)}</div>
    ${status ? `<div style="margin:12px 0 0"><span style="display:inline-block;padding:3px 10px;border-radius:10px;background:${safeColor(status.color)};color:#fff;font:700 10px Arial,sans-serif;letter-spacing:.06em">${escapeHtml(status.label.toUpperCase())}</span></div>` : ''}
    <h1 style="font:800 20px Arial,sans-serif;color:#101828;margin:10px 0 6px">${escapeHtml(heading)}</h1>
    <p style="font:13px/1.5 Arial,sans-serif;color:#5d6676;margin:0">${escapeHtml(intro)}</p>
    ${legend.length ? `<div style="margin:14px 0 0;font:11px Arial,sans-serif;color:#5d6676">${legend.map(([label, color]) => `<span style="display:inline-block;margin:0 12px 4px 0;white-space:nowrap"><span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${safeColor(color)};margin-right:5px"></span>${escapeHtml(label)}</span>`).join('')}</div>` : ''}
    ${sectionHtml}
    ${url ? `<a href="${escapeHtml(url)}" style="display:inline-block;margin-top:20px;background:#0b5fdc;color:#fff;font:700 13px Arial,sans-serif;text-decoration:none;padding:10px 16px;border-radius:10px">${escapeHtml(ctaLabel)}</a>` : ''}
    ${footer ? `<p style="font:11px Arial,sans-serif;color:#8d95a3;margin-top:24px">${escapeHtml(footer)}</p>` : ''}
    <p style="font:11px Arial,sans-serif;color:#8d95a3;margin:${footer ? '6px' : '24px'} 0 0">SignalDesk is a product of PK Works · <a href="https://socialsignaldesk.com" style="color:#8d95a3">socialsignaldesk.com</a></p>
  </div></div>`;
  const text = [`${status ? `[${status.label.toUpperCase()}] ` : ''}${heading}`, '', intro, ...sections.flatMap((section) => ['', section.title.toUpperCase(), ...section.items.map((item) => `- ${item.badge ? `[${item.badge.toUpperCase()}] ` : ''}${item.title}${item.body ? `: ${item.body}` : ''}${item.meta ? ` (${item.meta})` : ''}`)]), '', url].join('\n');
  return { html, text };
}

async function sendEmail(to, subject, content, { replyTo = null } = {}) {
  if (!emailConfigured()) return false;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.NOTIFY_FROM_EMAIL, to: [to], subject, html: content.html, text: content.text, ...(replyTo ? { reply_to: replyTo } : {}) })
  });
  if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}.`);
  return true;
}

// Creates in-app notifications and sends immediate emails. Never throws: a failed
// notification must not undo the action that triggered it.
async function notify({ workspaceId, audience = 'admins', userIds = [], excludeUserId, type, category, title, body = '', view = null, data = {}, cta = null, level = null }) {
  const urgent = URGENT_TYPES.has(type);
  const status = levelFor(type, level);
  data = { ...data, level: status, ...(urgent ? { urgent: true } : {}) };
  try {
    const members = await databaseRequest(`workspace_members?workspace_id=eq.${workspaceId}&select=user_id,email,role`) || [];
    const recipients = members.filter((member) => member.user_id !== excludeUserId
      && (audience === 'admins' ? member.role === 'admin' : audience === 'all' ? true : userIds.includes(member.user_id)));
    if (!recipients.length) return 0;
    await sendPush(recipients.map((member) => member.user_id), { title, body, view });
    await databaseRequest('notifications', {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify(recipients.map((member) => ({ workspace_id: workspaceId, user_id: member.user_id, type, category, title, body, view, data })))
    });
    if (emailConfigured()) {
      const preferences = await preferencesFor(recipients.map((member) => member.user_id));
      for (const member of recipients) {
        const prefs = withDefaults(preferences.get(member.user_id));
        if (!(prefs.email_frequency === 'immediate' || (urgent && prefs.email_frequency !== 'off')) || !prefs.email_categories.includes(category) || !member.email) continue;
        await sendEmail(member.email, ['emergency', 'warning'].includes(status) ? `${STATUS_LEVELS[status].label}: ${title}` : title, renderEmail({ heading: title, intro: body || 'There is new activity in your SignalDesk workspace.', sections: [], status: status === 'info' ? null : STATUS_LEVELS[status], ...(cta ? { ctaLabel: cta.label, ctaUrl: cta.url } : {}) }))
          .catch((error) => console.error('Immediate email failed:', error.message));
      }
    }
    return recipients.length;
  } catch (error) {
    console.error('Notification failed:', error.message);
    return 0;
  }
}

function localDateKey(date, timeZone) {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function formatNumber(value) {
  return typeof value === 'number' ? value.toLocaleString('en-US') : '—';
}

const networkLabel = (platform) => require('./publishing').PLATFORM_LABELS?.[platform] || platform;
async function weeklyReportSection(workspaceId, clients) {
  const since = new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10);
  const reports = await databaseRequest(`weekly_reports?workspace_id=eq.${workspaceId}&week_start=gte.${since}&select=client_id,week_start,data&order=week_start.desc`) || [];
  const latest = new Map();
  reports.forEach((report) => { if (!latest.has(report.client_id)) latest.set(report.client_id, report); });
  const items = [];
  for (const report of latest.values()) {
    const name = clients.find((client) => client.id === report.client_id)?.name || report.client_id;
    const top = [...(report.data.rows || [])].sort((a, b) => (b.metrics.engagements || 0) - (a.metrics.engagements || 0)).slice(0, 3);
    top.forEach((row, index) => items.push({
      title: `${name} · #${index + 1} on ${networkLabel(row.platform)}`, color: NETWORK_COLORS[row.platform],
      body: row.text || '(no caption)',
      meta: `${formatNumber(row.metrics.views)} views · ${formatNumber(row.metrics.engagements)} engagements · ${formatNumber(row.metrics.comments)} comments · ${formatNumber(row.metrics.likes)} likes`
    }));
  }
  return items.length ? [{ title: 'Top posts last week', items }] : [];
}

const ordinal = (n) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`;
const clampInt = (value, min, max, fallback) => { const n = parseInt(value, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };
const dayNumber = (date, timeZone) => Date.parse(`${localDateKey(date, timeZone)}T00:00:00Z`) / 86400000;

// Whether a digest is due today (8 AM or later, local time) and the period it covers.
function digestSchedule(prefs, now, timeZone) {
  const frequency = prefs.email_frequency;
  const parts = zonedParts(now, timeZone);
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  const monthlyDay = clampInt(prefs.monthly_day, 1, 28, 1), yearlyMonth = clampInt(prefs.yearly_month, 1, 12, 1), customDays = clampInt(prefs.custom_days, 2, 180, 14);
  let due = false, start = new Date(now);
  if (frequency === 'daily') { due = true; start = new Date(now - 86400000); }
  else if (frequency === 'weekly') { due = weekday === prefs.weekly_day; start = new Date(now - 7 * 86400000); }
  else if (frequency === 'monthly') { due = parts.day === monthlyDay; start.setUTCMonth(start.getUTCMonth() - 1); }
  else if (frequency === 'yearly') { due = parts.month === yearlyMonth && parts.day === 1; start.setUTCFullYear(start.getUTCFullYear() - 1); }
  else if (frequency === 'custom') {
    // Counted from the last one sent, or from when this schedule was chosen.
    const anchor = prefs.last_digest_at || prefs.updated_at;
    due = Boolean(anchor) && dayNumber(now, timeZone) - dayNumber(new Date(anchor), timeZone) >= customDays;
    start = new Date(now - customDays * 86400000);
  }
  if (parts.hour < DIGEST_HOUR) due = false;
  if (due && prefs.last_digest_at && localDateKey(new Date(prefs.last_digest_at), timeZone) === localDateKey(now, timeZone)) due = false;
  return { due, start, monthlyDay, yearlyMonth, customDays };
}

function digestCopy(prefs, schedule, count) {
  const { email_frequency: frequency } = prefs;
  if (frequency === 'daily') return { subject: 'Your SignalDesk daily digest', heading: 'Daily digest', intro: `${count} update${count === 1 ? '' : 's'} since your last digest.`, listTitle: 'Since yesterday' };
  if (frequency === 'weekly') return { subject: 'Your SignalDesk weekly wrap-up', heading: 'Weekly wrap-up', intro: `Here's what came through your workspace this week, sent ${WEEKDAY_NAMES[prefs.weekly_day]}s at 8 AM.`, listTitle: 'This week' };
  if (frequency === 'monthly') return { subject: 'Your SignalDesk monthly wrap-up', heading: 'Monthly wrap-up', intro: `Here's your workspace's past month, sent on the ${ordinal(schedule.monthlyDay)} of each month at 8 AM.`, listTitle: 'Latest updates' };
  if (frequency === 'yearly') return { subject: 'Your SignalDesk year in review', heading: 'Year in review', intro: `Here's your workspace's past year, sent every ${MONTH_NAMES[schedule.yearlyMonth - 1]} 1 at 8 AM.`, listTitle: 'Latest updates' };
  return { subject: 'Your SignalDesk wrap-up', heading: 'Your wrap-up', intro: `Here's what came through your workspace in the last ${schedule.customDays} days.`, listTitle: 'Latest updates' };
}

// Posts published in the period: totals per client and the five that did best.
async function periodPostsSection(workspaceId, clients, since) {
  const { allRows } = require('./publishing');
  const rows = await allRows(`network_posts?workspace_id=eq.${workspaceId}&published_at=gte.${since}&select=client_id,platform,text,url,published_at,metrics&order=published_at.desc`, { maxRows: 5000 }).catch(() => []) || [];
  if (!rows.length) return [];
  const nameOf = (id) => clients.find((client) => client.id === id)?.name || id;
  const sum = (list, key) => { const values = list.map((row) => row.metrics?.[key]).filter((value) => typeof value === 'number'); return values.length ? values.reduce((a, b) => a + b, 0) : null; };
  const byClient = new Map();
  rows.forEach((row) => byClient.set(row.client_id, [...(byClient.get(row.client_id) || []), row]));
  const colorOf = (id) => clients.find((client) => client.id === id)?.color;
  const totals = [...byClient].map(([clientId, list]) => ({ color: colorOf(clientId), title: `${nameOf(clientId)} · ${list.length} post${list.length === 1 ? '' : 's'} published`, body: `${formatNumber(sum(list, 'views'))} views · ${formatNumber(sum(list, 'engagements'))} engagements` }));
  const top = rows.filter((row) => typeof row.metrics?.engagements === 'number').sort((a, b) => b.metrics.engagements - a.metrics.engagements).slice(0, 5);
  const sections = [{ title: 'Your posts', items: totals }];
  if (top.length) sections.push({ title: 'Top posts', items: top.map((row, index) => ({ color: NETWORK_COLORS[row.platform], title: `#${index + 1} · ${nameOf(row.client_id)} on ${networkLabel(row.platform)}`, body: row.text || '(no caption)', meta: `${formatNumber(row.metrics.views)} views · ${formatNumber(row.metrics.engagements)} engagements${row.url ? ` · ${row.url}` : ''}` })) });
  return sections;
}

// Admins are reminded to keep a copy of their own workspace (Settings → General → Export) when nobody
// has downloaded one in 30 days, at most once every four weeks per person, inside a wrap-up they'd
// get anyway. SignalDesk's own daily backups cover every workspace and only platform owners reach them.
const COPY_REMINDER_DAYS = 30;
const COPY_REMINDER_EVERY_DAYS = 28;
async function copyReminderSection(member, now) {
  const reminderRun = `copy-reminder:${member.user_id}`;
  const [exports, reminded] = await Promise.all([
    databaseRequest(`activity_log?workspace_id=eq.${member.workspace_id}&action=eq.workspace_exported&select=created_at&order=created_at.desc&limit=1`).catch(() => null),
    databaseRequest(`worker_runs?name=eq.${encodeURIComponent(reminderRun)}&select=last_run_at`).catch(() => null)
  ]);
  if (!Array.isArray(exports)) return [];
  const lastExport = exports[0]?.created_at, lastReminder = Array.isArray(reminded) ? reminded[0]?.last_run_at : null;
  const days = (iso) => (now - Date.parse(iso)) / 86400000;
  if (lastExport && days(lastExport) < COPY_REMINDER_DAYS) return [];
  if (lastReminder && days(lastReminder) < COPY_REMINDER_EVERY_DAYS) return [];
  await databaseRequest('worker_runs?on_conflict=name', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ name: reminderRun, last_run_at: now.toISOString(), last_result: {} }) }).catch(() => {});
  const base = appUrl().replace(/\/+$/, '');
  return [{ title: 'Keep your own copy', items: [{
    title: 'Download a copy of your workspace',
    body: `SignalDesk backs up everything every day, and a copy of your own means you always have your work. ${lastExport ? `Your workspace’s last copy was ${Math.floor(days(lastExport))} days ago.` : 'Your workspace hasn’t made one yet.'} In SignalDesk, open Settings → General and select Export. Save the two files in a private folder of your own, on your computer or in your own iCloud Drive, Google Drive, or Dropbox, not a shared one, since they hold your clients’ content. Once a month is plenty. If something ever goes missing, Settings → General → Restore brings it back from your copy.`,
    meta: base ? `How backups work: ${base}/backups` : 'Settings → General → Export'
  }] }];
}

// Sends digests and wrap-ups (daily, weekly, monthly, yearly, or every few days) at 8 AM in each workspace's time zone.
async function processEmailDigests({ limit = 40, now = new Date() } = {}) {
  if (!emailConfigured()) return { sent: 0, configured: false };
  const members = await databaseRequest('workspace_members?select=user_id,email,role,workspace_id') || [];
  const preferences = await preferencesFor(members.map((member) => member.user_id));
  const states = new Map();
  let sent = 0;
  for (const member of members) {
    if (sent >= limit) break;
    const prefs = withDefaults(preferences.get(member.user_id));
    if (!['daily', 'weekly', 'monthly', 'yearly', 'custom'].includes(prefs.email_frequency) || !member.email) continue;
    if (!states.has(member.workspace_id)) states.set(member.workspace_id, await getWorkspaceState(member.workspace_id));
    const state = states.get(member.workspace_id);
    const timeZone = WORKSPACE_TIMEZONES[state.settings?.timezone] || 'America/New_York';
    const schedule = digestSchedule(prefs, now, timeZone);
    if (!schedule.due) continue;
    const since = prefs.last_digest_at && Date.parse(prefs.last_digest_at) > schedule.start ? prefs.last_digest_at : schedule.start.toISOString();
    const short = ['daily', 'weekly'].includes(prefs.email_frequency);
    const query = new URLSearchParams({ select: 'title,body,category,created_at,type,data', user_id: `eq.${member.user_id}`, created_at: `gt.${since}`, category: `in.(${prefs.email_categories.join(',')})`, 'data->>urgent': 'is.null', type: 'neq.planning_reminder', order: 'created_at.desc', limit: short ? '50' : '1000' });
    const notifications = (await databaseRequest(`notifications?${query}`) || []).map((item) => ({ ...item, level: levelFor(item.type, item.data?.level) }))
      .sort((a, b) => levelRank(a.level) - levelRank(b.level));
    const copy = digestCopy(prefs, schedule, notifications.length);
    const listItem = (item) => ({ title: item.title, body: item.body, ...(item.level === 'info' ? {} : { color: STATUS_LEVELS[item.level].color, badge: STATUS_LEVELS[item.level].label }), meta: new Date(item.created_at).toLocaleString('en-US', { timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) });
    const sections = [];
    if (notifications.length && short) sections.push({ title: copy.listTitle, items: notifications.map(listItem) });
    if (notifications.length && !short) {
      // Longer periods: a count per category, then only the latest few.
      const counts = new Map();
      notifications.forEach((item) => counts.set(item.category, (counts.get(item.category) || 0) + 1));
      sections.push({ title: 'At a glance', items: [...counts].map(([category, count]) => ({ title: CATEGORY_LABELS[category] || category, body: `${count}${count === 1000 ? '+' : ''} update${count === 1 ? '' : 's'}` })) });
      sections.push({ title: copy.listTitle, items: notifications.slice(0, 8).map(listItem) });
    }
    if (member.role === 'admin' && prefs.email_categories.includes('reports')) {
      if (prefs.email_frequency === 'weekly') sections.push(...await weeklyReportSection(member.workspace_id, state.clients || []));
      else if (!short) sections.push(...await periodPostsSection(member.workspace_id, state.clients || [], since));
    }
    // Planning reminders aren't repeated here (they'd be stale); the dates still ahead are listed instead.
    // Daily digests list them on Mondays only.
    if (prefs.email_categories.includes('planning') && (prefs.email_frequency !== 'daily' || new Date(`${localDateKey(now, timeZone)}T00:00:00Z`).getUTCDay() === 1)) {
      const { comingUpSection, planningNotesSection } = require('./planning');
      const periodDays = { daily: 7, weekly: 7, monthly: 30, yearly: 90, custom: schedule.customDays }[prefs.email_frequency];
      sections.push(...comingUpSection(localDateKey(now, timeZone), prefs, periodDays));
      if (member.role === 'admin') sections.push(...await planningNotesSection(member.workspace_id, state.clients || [], now));
    }
    // Added only to a wrap-up that's going out anyway, so it never sends an email on its own.
    if (sections.length && member.role === 'admin') sections.push(...await copyReminderSection(member, now));
    try {
      if (sections.length) {
        const shown = (short ? notifications : notifications.slice(0, 8)).map((item) => item.level);
        await sendEmail(member.email, copy.subject, renderEmail({ heading: copy.heading, intro: copy.intro, sections, legend: shown.some((level) => level !== 'info') ? levelLegend(shown) : [] }));
        sent += 1;
      }
      await databaseRequest('notification_preferences?on_conflict=user_id', {
        method: 'POST',
        headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ user_id: member.user_id, workspace_id: member.workspace_id, last_digest_at: now.toISOString() })
      });
    } catch (error) {
      console.error('Digest email failed:', error.message);
    }
  }
  return { sent, configured: true };
}

// The week ahead, on each person's weekly day at 8 AM (Mondays unless they picked another day): what goes
// out in the next 7 days, what's waiting on them (approvals for admins, posts assigned to them), and what
// failed in the last 7 days. Separate from wrap-ups, which look back. Turned off per person in Settings →
// Notifications. Skipped entirely until the database has the week_ahead column, so it can't resend.
async function processWeekAhead({ limit = 40, now = new Date() } = {}) {
  if (!emailConfigured()) return { sent: 0, configured: false };
  const ready = await databaseRequest('notification_preferences?select=week_ahead,last_week_ahead_at&limit=1').then(() => true).catch(() => false);
  if (!ready) return { sent: 0, ready: false };
  const members = await databaseRequest('workspace_members?select=user_id,email,role,workspace_id') || [];
  const preferences = await preferencesFor(members.map((member) => member.user_id));
  const workspaces = new Map();
  let sent = 0;
  for (const member of members) {
    if (sent >= limit) break;
    const prefs = withDefaults(preferences.get(member.user_id));
    if (prefs.week_ahead === false || prefs.email_frequency === 'off' || !member.email) continue;
    if (!workspaces.has(member.workspace_id)) {
      const state = await getWorkspaceState(member.workspace_id);
      workspaces.set(member.workspace_id, { state, timeZone: WORKSPACE_TIMEZONES[state.settings?.timezone] || 'America/New_York', posts: null });
    }
    const space = workspaces.get(member.workspace_id), { timeZone } = space;
    const parts = zonedParts(now, timeZone), weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
    if (weekday !== clampInt(prefs.weekly_day, 0, 6, 1) || parts.hour < DIGEST_HOUR) continue;
    if (prefs.last_week_ahead_at && localDateKey(new Date(prefs.last_week_ahead_at), timeZone) === localDateKey(now, timeZone)) continue;
    if (!space.posts) {
      const from = new Date(now.getTime() - 7 * 86400000).toISOString(), to = new Date(now.getTime() + 14 * 86400000).toISOString();
      space.posts = await databaseRequest(`scheduled_posts?workspace_id=eq.${member.workspace_id}&parent_id=is.null&scheduled_for=gte.${from}&scheduled_for=lt.${to}&status=neq.canceled&select=id,title,client_id,status,scheduled_for,assigned_to,publish_jobs(platform,status)&order=scheduled_for.asc&limit=1000`).catch(() => []) || [];
      const repeats = await databaseRequest(`scheduled_posts?workspace_id=eq.${member.workspace_id}&parent_id=not.is.null&scheduled_for=gte.${now.toISOString()}&scheduled_for=lt.${new Date(now.getTime() + 7 * 86400000).toISOString()}&status=neq.canceled&select=id,title,client_id,status,scheduled_for,assigned_to,publish_jobs(platform,status)&limit=500`).catch(() => []) || [];
      space.posts = [...space.posts, ...repeats].sort((a, b) => Date.parse(a.scheduled_for) - Date.parse(b.scheduled_for));
    }
    const sections = weekAheadSections({ posts: space.posts, clients: space.state.clients || [], member, now, timeZone });
    try {
      if (sections.length) {
        await sendEmail(member.email, 'Your week ahead in SignalDesk', renderEmail({ heading: 'Your week ahead', intro: 'What goes out this week, what’s waiting on you, and anything that needs a look.', sections, footer: 'Turn the week-ahead email off in SignalDesk under Settings → Notifications.' }));
        sent += 1;
      }
      await databaseRequest('notification_preferences?on_conflict=user_id', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: member.user_id, workspace_id: member.workspace_id, last_week_ahead_at: now.toISOString() }) });
    } catch (error) {
      console.error('Week-ahead email failed:', error.message);
    }
  }
  return { sent, configured: true };
}

function weekAheadSections({ posts, clients, member, now, timeZone }) {
  const nameOf = (id) => clients.find((client) => client.id === id)?.name || 'Client';
  const colorOf = (id) => clients.find((client) => client.id === id)?.color;
  const when = (iso) => new Date(iso).toLocaleString('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const nets = (post) => [...new Set((post.publish_jobs || []).filter((job) => job.status !== 'canceled').map((job) => networkLabel(job.platform)))].join(', ');
  const item = (post) => ({ color: colorOf(post.client_id), title: `${nameOf(post.client_id)} · ${post.title || 'Untitled post'}`, body: nets(post), meta: when(post.scheduled_for) });
  const t = now.getTime(), week = t + 7 * 86400000;
  const upcoming = posts.filter((post) => ['scheduled', 'pending_approval'].includes(post.status) && Date.parse(post.scheduled_for) >= t && Date.parse(post.scheduled_for) < week);
  const waiting = posts.filter((post) => Date.parse(post.scheduled_for) >= t && ((member.role === 'admin' && post.status === 'pending_approval') || (post.assigned_to === member.user_id && ['scheduled', 'pending_approval'].includes(post.status))));
  const failed = posts.filter((post) => ['failed', 'partial'].includes(post.status) && Date.parse(post.scheduled_for) < t);
  const sections = [];
  if (waiting.length) sections.push({ title: `Waiting on you (${waiting.length})`, items: waiting.slice(0, 10).map((post) => ({ ...item(post), badge: post.status === 'pending_approval' ? 'Needs approval' : 'Assigned to you', color: STATUS_LEVELS.attention.color })) });
  if (upcoming.length) {
    const byClient = new Map();
    upcoming.forEach((post) => byClient.set(post.client_id, (byClient.get(post.client_id) || 0) + 1));
    sections.push({ title: `Going out this week (${upcoming.length})`, items: [...upcoming.slice(0, 12).map(item), ...(upcoming.length > 12 ? [{ title: `And ${upcoming.length - 12} more`, body: [...byClient].map(([id, count]) => `${nameOf(id)}: ${count}`).join(' · ') }] : [])] });
  }
  if (failed.length) sections.push({ title: `Needs a look (${failed.length})`, items: failed.slice(0, 10).map((post) => ({ ...item(post), badge: post.status === 'partial' ? 'Partly published' : 'Failed', color: STATUS_LEVELS.warning.color })) });
  return sections;
}

const pad = (value) => String(value).padStart(2, '0');

function reportEmails(value) {
  return [...new Set(String(value || '').split(/[,;\s]+/).map((item) => item.trim().toLowerCase()).filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)))].slice(0, 5);
}

// Emails each client its report for the previous month, on the day of the month set in its brand kit.
async function processClientReports({ encryptionKey, now = new Date(), limit = 2 } = {}) {
  if (!emailConfigured()) return { sent: 0, configured: false };
  const { buildTopPostsReport, reportHighlights, changeText } = require('./reports');
  const { lastWorkerRun, recordWorkerRun } = require('./publishing');
  const rows = await databaseRequest('workspace_state?select=workspace_id,state') || [];
  let sent = 0;
  for (const row of rows) {
    const timeZone = WORKSPACE_TIMEZONES[row.state?.settings?.timezone] || 'America/New_York';
    const parts = zonedParts(now, timeZone);
    for (const client of row.state?.clients || []) {
      if (sent >= limit) return { sent, configured: true };
      const config = client.reports;
      const emails = reportEmails(config?.emails);
      if (!config?.enabled || !emails.length) continue;
      const day = Math.min(28, Math.max(1, parseInt(config.day, 10) || 1));
      if (parts.day < day || (parts.day === day && parts.hour < 8)) continue;
      const runName = `client-report:${row.workspace_id}:${client.id}:${parts.year}-${pad(parts.month)}`;
      if (await lastWorkerRun(runName)) continue;
      const previous = parts.month === 1 ? { year: parts.year - 1, month: 12 } : { year: parts.year, month: parts.month - 1 };
      const start = zonedToUtc(previous.year, previous.month, 1, 0, 0, timeZone);
      const end = zonedToUtc(parts.year, parts.month, 1, 0, 0, timeZone) - 1;
      try {
        const profile = ayrshareConfigured() ? await getProfile(row.workspace_id, client.id, encryptionKey) : null;
        const report = await buildTopPostsReport({ profile, workspaceId: row.workspace_id, encryptionKey, clientId: client.id, clientName: client.name, start, end });
        const before = previous.month === 1 ? { year: previous.year - 1, month: 12 } : { year: previous.year, month: previous.month - 1 };
        const prior = await buildTopPostsReport({ profile, workspaceId: row.workspace_id, encryptionKey, clientId: client.id, clientName: client.name, start: zonedToUtc(before.year, before.month, 1, 0, 0, timeZone), end: start - 1 }).catch(() => null);
        const highlights = reportHighlights(report, prior, { timeZone });
        const vs = (value, old) => { const text = changeText(value, old); return text ? ` (${text})` : ''; };
        const monthLabel = new Date(Date.UTC(previous.year, previous.month - 1, 15)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        const totals = report.totals;
        const top = [...report.rows].sort((a, b) => (b.metrics.engagements || 0) - (a.metrics.engagements || 0)).slice(0, 5);
        const { PLATFORM_LABELS } = require('./publishing');
        const label = (platform) => PLATFORM_LABELS[platform] || platform;
        const networks = Object.entries(report.rows.reduce((all, item) => { const entry = all[item.platform] ||= { posts: 0, engagements: 0, views: 0 }; entry.posts += 1; entry.engagements += item.metrics.engagements || 0; entry.views += item.metrics.views || 0; return all; }, {})).sort((a, b) => b[1].engagements - a[1].engagements);
        const bestNetwork = Math.max(1, ...networks.map(([, entry]) => entry.engagements));
        // A short "What worked" paragraph, written from these numbers. Costs about a cent; skipped if AI is off or fails.
        const summary = report.rows.length && process.env.ANTHROPIC_API_KEY && client.reports?.aiSummary !== false
          ? await require('./assist').reportSummary({ client, periodLabel: monthLabel, totals, previous: prior?.totals || null, top: top.map((item) => ({ network: label(item.platform), text: String(item.text || '').slice(0, 200), engagements: item.metrics.engagements ?? null, views: item.metrics.views ?? null })), byNetwork: Object.fromEntries(networks.map(([platform, entry]) => [label(platform), entry])), highlights }).catch(() => '')
          : '';
        const content = renderEmail({
          eyebrow: (row.state?.settings?.name || 'Your social media team').toUpperCase(),
          heading: `${client.name} social report: ${monthLabel}`,
          intro: `${report.postCount} post${report.postCount === 1 ? '' : 's'} published · ${formatNumber(totals.views)} views${vs(totals.views, prior?.totals?.views)} · ${formatNumber(totals.engagements)} engagements${vs(totals.engagements, prior?.totals?.engagements)}${totals.engagementRate === null ? '' : totals.engagementRate >= 100 ? ' · more engagements than people reached' : ` · ${totals.engagementRate}% engagement rate`}.`,
          sections: [...(summary ? [{ title: 'What worked', items: [{ title: '', body: summary }] }] : []), ...(highlights.length ? [{ title: 'Highlights', items: highlights.map((line) => ({ title: line })) }] : []), ...(networks.length > 1 ? [{ title: 'By network', items: networks.map(([platform, entry]) => ({ title: `${label(platform)}: ${formatNumber(entry.engagements)} engagements`, meta: `${entry.posts} post${entry.posts === 1 ? '' : 's'} · ${formatNumber(entry.views)} views`, color: NETWORK_COLORS[platform], bar: entry.engagements / bestNetwork * 100 })) }] : []), ...(top.length ? [{ title: 'Top posts', items: top.map((item) => ({ color: NETWORK_COLORS[item.platform], title: `${label(item.platform)} · ${item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone }) : ''}`, body: item.text || '(no caption)', meta: `${formatNumber(item.metrics.views)} views · ${formatNumber(item.metrics.engagements)} engagements${item.url ? ` · ${item.url}` : ''}` })) }] : [])],
          showCta: false,
          footer: 'Metrics come from each network and may change slightly as they update.'
        });
        for (const email of emails) await sendEmail(email, `${client.name} social report: ${monthLabel}`, content);
        sent += 1;
      } catch (error) {
        console.error('Client report email failed:', client.id, error.message);
      }
      // Recorded either way so a broken report doesn't email again every run.
      await recordWorkerRun(runName, { emails: emails.length });
    }
  }
  return { sent, configured: true };
}

module.exports = { NETWORK_COLORS, STATUS_LEVELS, LEVEL_ORDER, levelFor, levelLegend, URGENT_TYPES, CATEGORIES, DEFAULT_PREFERENCES, digestSchedule, emailConfigured, sendEmail, appUrl, notify, processEmailDigests, processWeekAhead, weekAheadSections, renderEmail, processClientReports, reportEmails };
