const { databaseRequest, getWorkspaceState, WORKSPACE_TIMEZONES, zonedParts, zonedToUtc, ayrshareConfigured, getProfile } = require('./core');
const { sendPush } = require('./push');

const CATEGORIES = ['approvals', 'autopilot', 'reports', 'team', 'publishing'];
const DEFAULT_PREFERENCES = { email_frequency: 'daily', email_categories: CATEGORIES, weekly_day: 1, last_digest_at: null };
const DIGEST_HOUR = 8;
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

function renderEmail({ heading, intro, sections, ctaLabel = 'Open SignalDesk', ctaUrl = '', eyebrow = 'SIGNALDESK · PART OF BEACON', showCta = true, footer = 'Change how often you get these under the bell icon → Preferences in SignalDesk.' }) {
  const url = showCta ? ctaUrl || appUrl() : '';
  const sectionHtml = sections.map((section) => `
    <h2 style="font:700 14px Arial,sans-serif;color:#1a1f3a;margin:24px 0 8px">${escapeHtml(section.title)}</h2>
    ${section.items.map((item) => `<div style="border:1px solid #e8e0dc;border-radius:10px;padding:12px 14px;margin:0 0 8px">
      <div style="font:700 13px Arial,sans-serif;color:#1a1f3a">${escapeHtml(item.title)}</div>
      ${item.body ? `<div style="font:13px/1.5 Arial,sans-serif;color:#606779;margin-top:4px">${escapeHtml(item.body)}</div>` : ''}
      ${item.meta ? `<div style="font:11px Arial,sans-serif;color:#8a8e9a;margin-top:6px">${escapeHtml(item.meta)}</div>` : ''}
    </div>`).join('')}`).join('');
  const html = `<div style="background:#fdf6f0;padding:24px"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e0dc;border-radius:16px;padding:28px">
    <div style="font:600 10px Arial,sans-serif;letter-spacing:.08em;color:#5b8db8">${escapeHtml(eyebrow)}</div>
    <h1 style="font:800 20px Arial,sans-serif;color:#1a1f3a;margin:10px 0 6px">${escapeHtml(heading)}</h1>
    <p style="font:13px/1.5 Arial,sans-serif;color:#606779;margin:0">${escapeHtml(intro)}</p>
    ${sectionHtml}
    ${url ? `<a href="${escapeHtml(url)}" style="display:inline-block;margin-top:20px;background:#5b8db8;color:#fff;font:700 13px Arial,sans-serif;text-decoration:none;padding:10px 16px;border-radius:10px">${escapeHtml(ctaLabel)}</a>` : ''}
    ${footer ? `<p style="font:11px Arial,sans-serif;color:#8a8e9a;margin-top:24px">${escapeHtml(footer)}</p>` : ''}
  </div></div>`;
  const text = [heading, '', intro, ...sections.flatMap((section) => ['', section.title.toUpperCase(), ...section.items.map((item) => `- ${item.title}${item.body ? `: ${item.body}` : ''}${item.meta ? ` (${item.meta})` : ''}`)]), '', url].join('\n');
  return { html, text };
}

async function sendEmail(to, subject, content) {
  if (!emailConfigured()) return false;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.NOTIFY_FROM_EMAIL, to: [to], subject, html: content.html, text: content.text })
  });
  if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}.`);
  return true;
}

// Creates in-app notifications and sends immediate emails. Never throws: a failed
// notification must not undo the action that triggered it.
async function notify({ workspaceId, audience = 'admins', userIds = [], excludeUserId, type, category, title, body = '', view = null, data = {} }) {
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
        if (prefs.email_frequency !== 'immediate' || !prefs.email_categories.includes(category) || !member.email) continue;
        await sendEmail(member.email, title, renderEmail({ heading: title, intro: body || 'There is new activity in your SignalDesk workspace.', sections: [] }))
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
      title: `${name} · #${index + 1} on ${row.platform}`,
      body: row.text || '(no caption)',
      meta: `${formatNumber(row.metrics.views)} views · ${formatNumber(row.metrics.engagements)} engagements · ${formatNumber(row.metrics.comments)} comments · ${formatNumber(row.metrics.likes)} likes`
    }));
  }
  return items.length ? [{ title: 'Top posts last week', items }] : [];
}

// Sends daily digests and weekly wrap-ups at 8 AM in each workspace's time zone.
async function processEmailDigests({ limit = 40, now = new Date() } = {}) {
  if (!emailConfigured()) return { sent: 0, configured: false };
  const members = await databaseRequest('workspace_members?select=user_id,email,role,workspace_id') || [];
  const preferences = await preferencesFor(members.map((member) => member.user_id));
  const states = new Map();
  let sent = 0;
  for (const member of members) {
    if (sent >= limit) break;
    const prefs = withDefaults(preferences.get(member.user_id));
    if (!['daily', 'weekly'].includes(prefs.email_frequency) || !member.email) continue;
    if (!states.has(member.workspace_id)) states.set(member.workspace_id, await getWorkspaceState(member.workspace_id));
    const state = states.get(member.workspace_id);
    const timeZone = WORKSPACE_TIMEZONES[state.settings?.timezone] || 'America/New_York';
    const parts = zonedParts(now, timeZone);
    const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
    if (parts.hour < DIGEST_HOUR) continue;
    if (prefs.email_frequency === 'weekly' && weekday !== prefs.weekly_day) continue;
    if (prefs.last_digest_at && localDateKey(new Date(prefs.last_digest_at), timeZone) === localDateKey(now, timeZone)) continue;
    const windowDays = prefs.email_frequency === 'weekly' ? 7 : 1;
    const since = prefs.last_digest_at && Date.parse(prefs.last_digest_at) > now - windowDays * 86400000 ? prefs.last_digest_at : new Date(now - windowDays * 86400000).toISOString();
    const query = new URLSearchParams({ select: 'title,body,category,created_at', user_id: `eq.${member.user_id}`, created_at: `gt.${since}`, category: `in.(${prefs.email_categories.join(',')})`, order: 'created_at.desc', limit: '50' });
    const notifications = await databaseRequest(`notifications?${query}`) || [];
    const sections = [];
    if (notifications.length) {
      sections.push({
        title: prefs.email_frequency === 'weekly' ? 'This week' : 'Since yesterday',
        items: notifications.map((item) => ({ title: item.title, body: item.body, meta: new Date(item.created_at).toLocaleString('en-US', { timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }))
      });
    }
    if (prefs.email_frequency === 'weekly' && member.role === 'admin' && prefs.email_categories.includes('reports')) {
      sections.push(...await weeklyReportSection(member.workspace_id, state.clients || []));
    }
    try {
      if (sections.length) {
        const weekly = prefs.email_frequency === 'weekly';
        await sendEmail(member.email, weekly ? 'Your SignalDesk weekly wrap-up' : 'Your SignalDesk daily digest', renderEmail({
          heading: weekly ? 'Weekly wrap-up' : 'Daily digest',
          intro: weekly ? `Here's what came through your workspace this week, sent ${WEEKDAY_NAMES[prefs.weekly_day]}s at 8 AM.` : `${notifications.length} update${notifications.length === 1 ? '' : 's'} since your last digest.`,
          sections
        }));
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

const pad = (value) => String(value).padStart(2, '0');

function reportEmails(value) {
  return [...new Set(String(value || '').split(/[,;\s]+/).map((item) => item.trim().toLowerCase()).filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)))].slice(0, 5);
}

// Emails each client its report for the previous month, on the day of the month set in its brand kit.
async function processClientReports({ encryptionKey, now = new Date(), limit = 2 } = {}) {
  if (!emailConfigured()) return { sent: 0, configured: false };
  const { buildTopPostsReport } = require('./reports');
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
        const monthLabel = new Date(Date.UTC(previous.year, previous.month - 1, 15)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        const totals = report.totals;
        const top = [...report.rows].sort((a, b) => (b.metrics.engagements || 0) - (a.metrics.engagements || 0)).slice(0, 5);
        const content = renderEmail({
          eyebrow: (row.state?.settings?.name || 'Your social media team').toUpperCase(),
          heading: `${client.name} social report: ${monthLabel}`,
          intro: `${report.postCount} post${report.postCount === 1 ? '' : 's'} published · ${formatNumber(totals.views)} views · ${formatNumber(totals.engagements)} engagements${totals.engagementRate !== null ? ` · ${totals.engagementRate}% engagement rate` : ''}.`,
          sections: top.length ? [{ title: 'Top posts', items: top.map((item) => ({ title: `${item.platform} · ${item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone }) : ''}`, body: item.text || '(no caption)', meta: `${formatNumber(item.metrics.views)} views · ${formatNumber(item.metrics.engagements)} engagements${item.url ? ` · ${item.url}` : ''}` })) }] : [],
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

module.exports = { CATEGORIES, emailConfigured, sendEmail, appUrl, notify, processEmailDigests, renderEmail, processClientReports, reportEmails };
