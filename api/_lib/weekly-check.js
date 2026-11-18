const { databaseRequest } = require('./core');
const { lastWorkerRun, recordWorkerRun } = require('./publishing');
const crypto = require('crypto');
const { emailConfigured, sendEmail, renderEmail, appUrl, STATUS_LEVELS } = require('./notify');
const { platformAdmins } = require('./platform');
const { missingFromDatabase } = require('./health');

// Once a week, checks that the whole platform still works and emails the platform owners the result,
// including when everything is fine, so a quiet week means the check itself stopped.

const DAY_MS = 86400000;
const CHECK_DAY = 1; // Monday
const CHECK_HOUR_UTC = 13;
const PUBLISH_STALE_MS = 30 * 60000;
const WORKER_STALE_MS = 60 * 60000;
// Resend's test address: mail to it is accepted and thrown away, so the check reaches no one's inbox.
const AUTH_EMAIL_TEST_ADDRESS = 'delivered@resend.dev';

// How serious each result is, worst first. Emergency: posts or sign-in are stopped now. Warning: something
// is broken and will hurt soon. Attention: worth a look, nothing is down.
const LEVELS = {
  emergency: { ...STATUS_LEVELS.emergency, section: 'Emergency: fix now' },
  warning: { ...STATUS_LEVELS.warning, section: 'Warning: broken' },
  attention: { ...STATUS_LEVELS.attention, section: 'Needs attention' },
  ok: { ...STATUS_LEVELS.good, section: 'Working' }
};
const LEVEL_ORDER = ['emergency', 'warning', 'attention', 'ok'];
const pass = (title, body) => ({ ok: true, level: 'ok', title, body });
const fail = (title, body, level = 'warning') => ({ ok: false, level, title, body });
const emergency = (title, body) => fail(title, body, 'emergency');
const attention = (title, body) => fail(title, body, 'attention');

async function databaseCheck() {
  const missing = await missingFromDatabase();
  return missing.length ? emergency('Database', `Missing: ${missing.join(', ')}. Run the latest supabase/schema.sql.`) : pass('Database', 'Every table and column is in place.');
}

// The daily database copy (api/_lib/backup.js) ran in the last two days.
async function backupCheck(now) {
  const { lastBackup } = require('./backup');
  const last = await lastBackup();
  const size = last.bytes ? ` (${Math.max(0.1, last.bytes / 1048576).toFixed(1)} MB, ${last.rows} rows)` : '';
  if (!last.at || now - Date.parse(last.at) > 2 * DAY_MS) return fail('Backups', `The last database copy was ${last.at ? new Date(last.at).toUTCString() : 'never'}${last.error ? `. The last try failed: ${last.error}` : ''}. Settings → Usage & costs → Back up now tries again.`);
  return pass('Backups', `A database copy was made ${new Date(last.at).toUTCString()}${size}.`);
}

async function schedulerCheck(now) {
  const [publish, worker] = await Promise.all([lastWorkerRun('publish'), lastWorkerRun('worker')]);
  const age = (iso) => (iso ? now - Date.parse(iso) : Infinity);
  if (age(publish) > PUBLISH_STALE_MS) return emergency('Publishing schedule', `The publishing run last finished ${publish ? new Date(publish).toUTCString() : 'never'}. Check the pg_cron jobs in Supabase.`);
  if (age(worker) > WORKER_STALE_MS) return fail('Background work', `Reports, reminders, and token upkeep last ran ${worker ? new Date(worker).toUTCString() : 'never'}. Check the pg_cron jobs in Supabase.`);
  return pass('Schedule', 'Publishing and background work are both running.');
}

// The live page and its script both load. A 403 is worth knowing about: Vercel's bot checkpoint
// also blocks the scheduler when it's on.
async function siteCheck() {
  const base = appUrl().replace(/\/+$/, '');
  if (!base) return emergency('Live site', 'APP_URL isn’t set.');
  try {
    const page = await fetch(`${base}/`, { signal: AbortSignal.timeout(10000) });
    if (page.status === 403) return emergency('Live site', 'The site refused this check (HTTP 403). Vercel’s bot checkpoint may be on, which also stops scheduled posts. Check Firewall in the Vercel dashboard.');
    if (!page.ok) return emergency('Live site', `The site returned HTTP ${page.status}.`);
    const script = /js\/app\.min\.js\?v=[a-z0-9]+/.exec(await page.text())?.[0];
    if (!script) return emergency('Live site', 'The page loaded, but without the app’s script.');
    const bundle = await fetch(`${base}/${script}`, { signal: AbortSignal.timeout(10000) });
    return bundle.ok ? pass('Live site', `${base} and its script load.`) : emergency('Live site', `The page loaded, but its script returned HTTP ${bundle.status}.`);
  } catch (error) {
    return emergency('Live site', `Couldn’t reach ${base}: ${error.message}`);
  }
}

async function signInCheck() {
  try {
    const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/health`, { headers: { apikey: process.env.SUPABASE_ANON_KEY || '' }, signal: AbortSignal.timeout(10000) });
    return response.ok ? pass('Sign-in', 'Supabase Auth is up.') : emergency('Sign-in', `Supabase Auth returned HTTP ${response.status}.`);
  } catch (error) {
    return emergency('Sign-in', `Couldn’t reach Supabase Auth: ${error.message}`);
  }
}

// Sign-up and password emails go out through Supabase's own email settings, not the key this app uses.
// Sends one real password email to a throwaway account, which fails if those settings have broken.
async function authEmailCheck() {
  const base = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY || '', service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const reason = async (response) => { const text = await response.text(); try { const body = JSON.parse(text); return body.msg || body.message || body.error_description || text; } catch { return text || `HTTP ${response.status}`; } };
  const settings = await fetch(`${base}/auth/v1/settings`, { headers: { apikey: anon }, signal: AbortSignal.timeout(10000) });
  if (!settings.ok) return attention('Sign-up emails', `Couldn’t read Supabase’s sign-in settings (HTTP ${settings.status}).`);
  const { external, mailer_autoconfirm: autoconfirm } = await settings.json();
  if (external?.email === false) return fail('Sign-up emails', 'Email sign-in is turned off in Supabase, so people can’t sign up or reset a password.');
  if (autoconfirm) return attention('Sign-up emails', 'Supabase has “Confirm email” turned off, so new accounts aren’t asked to confirm their address.');
  const created = await fetch(`${base}/auth/v1/admin/users`, {
    method: 'POST', headers: { apikey: service, authorization: `Bearer ${service}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ email: AUTH_EMAIL_TEST_ADDRESS, password: crypto.randomBytes(32).toString('base64url'), email_confirm: true })
  });
  if (!created.ok && created.status !== 422) return fail('Sign-up emails', `Couldn’t prepare the test account: ${await reason(created)}`);
  const sent = await fetch(`${base}/auth/v1/recover`, { method: 'POST', headers: { apikey: anon, 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000), body: JSON.stringify({ email: AUTH_EMAIL_TEST_ADDRESS }) });
  if (!sent.ok) return fail('Sign-up emails', `Supabase couldn’t send a test password email: ${await reason(sent)}. New sign-ups are probably failing too. Check Authentication → SMTP in Supabase.`);
  return pass('Sign-up emails', 'Supabase sent a test password email without an error.');
}

// Whether the address emails come from is still verified. A send-only key can't read domains, and
// this email arriving shows sending works anyway.
async function emailCheck() {
  const domain = /@([^>\s]+)/.exec(process.env.NOTIFY_FROM_EMAIL || '')?.[1]?.toLowerCase();
  try {
    const response = await fetch('https://api.resend.com/domains', { headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}` }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) return pass('Email', 'The email provider accepts this key.');
    const found = ((await response.json()).data || []).find((item) => item.name?.toLowerCase() === domain);
    if (!found) return fail('Email', `${domain} isn’t in the email provider’s account, so emails from it will be refused.`);
    return found.status === 'verified' ? pass('Email', `${domain} is verified.`) : fail('Email', `${domain} is ${found.status} at the email provider, so emails from it may be refused.`);
  } catch (error) {
    return attention('Email', `Couldn’t reach the email provider: ${error.message}`);
  }
}

async function weekInReview(now) {
  const since = new Date(now - 7 * DAY_MS).toISOString();
  const [jobs, reauth, errors] = await Promise.all([
    databaseRequest(`publish_jobs?updated_at=gte.${since}&status=in.(published,failed,unknown)&select=status&limit=5000`),
    databaseRequest('social_connections?status=eq.needs_reauth&select=id&limit=500'),
    databaseRequest(`app_errors?last_seen=gte.${since}&select=count&limit=500`)
  ]);
  const published = (jobs || []).filter((job) => job.status === 'published').length, failed = (jobs || []).length - published;
  const errorCount = (errors || []).reduce((sum, row) => sum + (row.count || 0), 0);
  return {
    results: [
      failed ? fail('Failed posts', `${failed} post${failed === 1 ? '' : 's'} failed or couldn’t be confirmed this week, out of ${failed + published}.`) : pass('Posts', `${published} published this week, none failed.`),
      reauth?.length ? attention('Accounts', `${reauth.length} account${reauth.length === 1 ? ' needs' : 's need'} reconnecting.`) : pass('Accounts', 'None need reconnecting.'),
      errorCount ? attention('Server errors', `${errorCount} this week. See Settings → Beta invites.`) : pass('Server errors', 'None this week.')
    ]
  };
}

async function runWeeklyCheck({ now = Date.now() } = {}) {
  const guard = (name, run) => run().catch((error) => attention(name, `The check itself failed: ${error.message}`));
  const week = await weekInReview(now).catch((error) => ({ results: [attention('This week’s activity', `The check itself failed: ${error.message}`)] }));
  const results = [
    await guard('Database', databaseCheck),
    await guard('Schedule', () => schedulerCheck(now)),
    await guard('Backups', () => backupCheck(now)),
    await guard('Live site', siteCheck),
    await guard('Sign-in', signInCheck),
    await guard('Email', emailCheck),
    await guard('Sign-up emails', authEmailCheck),
    ...week.results
  ];
  const problems = results.filter((item) => !item.ok);
  const worst = LEVEL_ORDER.find((level) => results.some((item) => item.level === level));
  const needs = `${problems.length} thing${problems.length === 1 ? '' : 's'} need${problems.length === 1 ? 's' : ''} a look`;
  const subject = problems.length ? `SignalDesk weekly check: ${LEVELS[worst].label.toLowerCase()}, ${needs}` : 'SignalDesk weekly check: all good';
  const toItem = ({ title, body, level }) => ({ title, body, color: LEVELS[level].color, badge: LEVELS[level].label });
  const content = renderEmail({
    eyebrow: 'SIGNALDESK · WEEKLY CHECK', status: LEVELS[worst], heading: problems.length ? needs : 'All good',
    intro: problems.length ? 'The weekly check found problems. Everything it looked at is below, most serious first.' : 'Everything the weekly check looks at is working.',
    legend: [...LEVEL_ORDER].reverse().map((level) => [LEVELS[level].label, LEVELS[level].color]),
    sections: LEVEL_ORDER.map((level) => ({ title: LEVELS[level].section, items: results.filter((item) => item.level === level).map(toItem) })).filter((section) => section.items.length),
    ctaLabel: 'Open Setup & health', ctaUrl: `${appUrl().replace(/\/+$/, '')}/#view=settings`,
    footer: 'You get this because your email is in PLATFORM_ADMIN_EMAILS.'
  });
  let sent = 0;
  if (emailConfigured()) for (const admin of platformAdmins()) if (await sendEmail(admin, subject, content).catch(() => false)) sent += 1;
  await recordWorkerRun('weekly-check', { problems: problems.map((item) => item.title), sent });
  return { sent, problems: problems.length, worst, results };
}

// Runs on Mondays, whichever scheduled run gets there first.
async function maybeRunWeeklyCheck({ now = Date.now() } = {}) {
  const today = new Date(now);
  if (today.getUTCDay() !== CHECK_DAY || today.getUTCHours() < CHECK_HOUR_UTC) return { skipped: true };
  const last = await lastWorkerRun('weekly-check');
  if (last && now - Date.parse(last) < 6 * DAY_MS) return { skipped: true };
  return runWeeklyCheck({ now });
}

module.exports = { runWeeklyCheck, maybeRunWeeklyCheck, authEmailCheck };
