const { databaseRequest, getConfig } = require('./core');
const { providerConfigured } = require('./platforms');
const { lastWorkerRun, listConnections, shortLinkBase, PLATFORM_LABELS } = require('./publishing');
const { emailConfigured } = require('./notify');
const { pushConfigured } = require('./push');

// Settings → Setup & health: what's configured, whether the scheduler is running, which
// accounts need attention, and what failed recently. Admin-only; never returns secret values.

const MINUTE = 60000;
// Tables added over time. If one is missing, the schema needs to be run again.
const TABLES = ['scheduled_posts', 'publish_jobs', 'social_connections', 'oauth_sessions', 'review_links', 'post_notes', 'post_history', 'push_subscriptions', 'bio_pages', 'data_deletion_requests', 'short_links', 'link_click_days'];

const check = (group, key, label, status, detail, fix = '') => ({ group, key, label, status, detail, fix });

function ago(iso) {
  if (!iso) return 'never';
  const minutes = Math.round((Date.now() - Date.parse(iso)) / MINUTE);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} hr ago` : `${Math.round(hours / 24)} days ago`;
}

async function missingTables() {
  const results = await Promise.all(TABLES.map((table) => databaseRequest(`${table}?select=*&limit=0`).then(() => null).catch(() => table)));
  return results.filter(Boolean);
}

function siteChecks(origin) {
  const appUrl = (process.env.APP_URL || '').replace(/\/+$/, '');
  const origins = (process.env.APP_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
  const checks = [];
  if (!appUrl) checks.push(check('core', 'app-url', 'Site address', 'error', 'APP_URL isn’t set, so network sign-ins and short links can’t work.', 'Set APP_URL in Vercel to this site’s address, e.g. https://signaldesk-social.vercel.app.'));
  else if (!appUrl.startsWith('https://')) checks.push(check('core', 'app-url', 'Site address', 'warn', `APP_URL is ${appUrl}, which isn’t https.`, 'Use the https address of the live site.'));
  else if (origin && origin !== appUrl) checks.push(check('core', 'app-url', 'Site address', 'warn', `APP_URL is ${appUrl}, but you’re using ${origin}. Network sign-ins return to APP_URL.`, 'Update APP_URL if this is the address you use now, and update the redirect URL in each developer app.'));
  else checks.push(check('core', 'app-url', 'Site address', 'ok', `${appUrl}. Network sign-ins return to ${appUrl}/api/oauth.`));
  if (origin && !origins.includes(origin)) checks.push(check('core', 'origins', 'Allowed origins', 'warn', `APP_ORIGINS doesn’t list ${origin}. Some requests from this address may be refused.`, `Add ${origin} to APP_ORIGINS in Vercel.`));
  else checks.push(check('core', 'origins', 'Allowed origins', 'ok', origin ? `${origin} is allowed.` : 'Set.'));
  return checks;
}

async function schedulerChecks() {
  const [publish, worker] = await Promise.all([lastWorkerRun('publish'), lastWorkerRun('worker')]);
  const age = (iso) => (iso ? (Date.now() - Date.parse(iso)) / MINUTE : Infinity);
  const fix = 'Check the two pg_cron jobs in Supabase (see the README, step 3) and that CRON_SECRET matches Vercel.';
  return [
    age(publish) <= 5 ? check('scheduler', 'publish', 'Publisher (every minute)', 'ok', `Last ran ${ago(publish)}.`)
      : check('scheduler', 'publish', 'Publisher (every minute)', age(publish) <= 20 ? 'warn' : 'error', publish ? `Last ran ${ago(publish)}. Scheduled posts wait until it runs.` : 'It has never run, so scheduled posts won’t go out.', fix),
    age(worker) <= 25 ? check('scheduler', 'worker', 'Background jobs (every 10 minutes)', 'ok', `Last ran ${ago(worker)}. Handles comments, token renewals, reports, and digests.`)
      : check('scheduler', 'worker', 'Background jobs (every 10 minutes)', age(worker) <= 60 ? 'warn' : 'error', worker ? `Last ran ${ago(worker)}.` : 'It has never run.', fix)
  ];
}

function networkChecks() {
  const checks = [];
  checks.push(providerConfigured('meta')
    ? check('networks', 'meta', 'Facebook & Instagram', 'ok', `App ${process.env.META_APP_ID} is set up${process.env.META_LOGIN_CONFIG_ID ? ', using a Facebook Login for Business configuration' : ''}. Graph API ${process.env.META_GRAPH_VERSION || 'v23.0'}.`)
    : check('networks', 'meta', 'Facebook & Instagram', 'off', 'Not set up.', 'Set META_APP_ID and META_APP_SECRET in Vercel.'));
  if (providerConfigured('linkedin')) {
    const orgs = process.env.LINKEDIN_ORGANIZATIONS === 'true';
    const custom = process.env.LINKEDIN_SCOPES;
    checks.push(check('networks', 'linkedin', 'LinkedIn', custom ? 'warn' : 'ok',
      `${orgs ? 'Personal profiles and company Pages.' : 'Personal profiles. Company Pages turn on once LinkedIn approves the Community Management API.'}${custom ? ` LINKEDIN_SCOPES overrides the permissions: ${custom}.` : ''}`,
      custom ? 'Delete LINKEDIN_SCOPES unless LinkedIn has approved every permission listed.' : 'Your LinkedIn app needs the “Sign In with LinkedIn using OpenID Connect” and “Share on LinkedIn” products.'));
  } else checks.push(check('networks', 'linkedin', 'LinkedIn', 'off', 'Not set up.', 'Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in Vercel.'));
  if (providerConfigured('pinterest')) checks.push(check('networks', 'pinterest', 'Pinterest', 'ok', process.env.PINTEREST_SANDBOX === 'true' ? 'Set up, using Pinterest’s sandbox (test Pins only).' : 'Set up.'));
  else if (process.env.PINTEREST_APP_ID) checks.push(check('networks', 'pinterest', 'Pinterest', 'error', 'PINTEREST_APP_ID is set, but PINTEREST_APP_SECRET is missing.', 'Add PINTEREST_APP_SECRET in Vercel, then redeploy.'));
  else checks.push(check('networks', 'pinterest', 'Pinterest', 'off', 'Not set up.', 'Set PINTEREST_APP_ID and PINTEREST_APP_SECRET in Vercel.'));
  checks.push(process.env.AYRSHARE_API_KEY
    ? check('networks', 'ayrshare', 'Other networks (Ayrshare)', 'ok', 'Set up.')
    : check('networks', 'ayrshare', 'Other networks (Ayrshare)', 'off', 'Optional. TikTok, YouTube, X, and others use reminders instead.'));
  return checks;
}

function imageCheck() {
  try {
    const sharp = require('sharp');
    return check('features', 'images', 'Instagram image conversion', 'ok', `Images Instagram would reject are converted to JPEG and fitted to 4:5–1.91:1 (sharp ${sharp.versions.sharp}).`);
  } catch (error) {
    return check('features', 'images', 'Instagram image conversion', 'error', `The image library didn’t load: ${error.message.slice(0, 160)}`, 'Redeploy. If it persists, Instagram posts need JPEG images between 4:5 and 1.91:1.');
  }
}

function featureChecks(tables) {
  const missingLinks = tables.includes('short_links') || tables.includes('link_click_days');
  return [
    imageCheck(),
    process.env.ANTHROPIC_API_KEY ? check('features', 'ai', 'AI writing help', 'ok', 'Caption drafts, image descriptions, proofreading, and trends.')
      : check('features', 'ai', 'AI writing help', 'off', 'Not set up.', 'Set ANTHROPIC_API_KEY in Vercel.'),
    emailConfigured() ? check('features', 'email', 'Notification emails', 'ok', `Sent from ${process.env.NOTIFY_FROM_EMAIL}.`)
      : check('features', 'email', 'Notification emails', 'off', 'Notifications appear in the app only.', 'Set RESEND_API_KEY and NOTIFY_FROM_EMAIL in Vercel.'),
    pushConfigured() ? check('features', 'push', 'Push notifications', 'ok', 'Turn them on per device under the bell → Preferences.')
      : check('features', 'push', 'Push notifications', 'off', 'Not set up.', 'Run npx web-push generate-vapid-keys and set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.'),
    process.env.UNSPLASH_ACCESS_KEY ? check('features', 'stock', 'Stock photos (Unsplash)', 'ok', 'Search Unsplash from the Publishing Studio.')
      : check('features', 'stock', 'Stock photos (Unsplash)', 'off', 'Not set up.', 'Create a free app at unsplash.com/developers and set UNSPLASH_ACCESS_KEY in Vercel.'),
    missingLinks ? check('features', 'links', 'Click-tracking short links', 'error', 'The short link tables are missing.', 'Run supabase/schema.sql again in the Supabase SQL editor.')
      : shortLinkBase() ? check('features', 'links', 'Click-tracking short links', 'ok', `Links look like ${shortLinkBase()}/l/AbC123.`)
        : check('features', 'links', 'Click-tracking short links', 'error', 'Needs an https APP_URL.', 'Set APP_URL in Vercel.'),
    process.env.LEGAL_CONTACT_EMAIL ? check('features', 'legal', 'Privacy, terms, and data deletion pages', 'ok', `Contact: ${process.env.LEGAL_CONTACT_EMAIL}.`)
      : check('features', 'legal', 'Privacy, terms, and data deletion pages', 'warn', 'No contact email is shown on the pages.', 'Set LEGAL_CONTACT_EMAIL in Vercel.')
  ];
}

async function accountChecks(workspaceId, clientNames) {
  const connections = await listConnections(workspaceId);
  const soon = Date.now() + 7 * 86400000;
  return connections.map((item) => {
    const name = `${clientNames[item.client_id] || item.client_id} · ${PLATFORM_LABELS[item.platform] || item.platform}`;
    const who = item.display_name || item.username || item.external_id;
    if (item.status === 'needs_reauth') return check('accounts', item.id, name, 'error', `${who}: ${item.last_error || 'needs to be reconnected.'}`, 'Reconnect it in Social Accounts.');
    const expires = item.refresh_expires_at || item.token_expires_at;
    if (expires && Date.parse(expires) < soon) return check('accounts', item.id, name, 'warn', `${who}: sign-in expires ${new Date(expires).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`, 'Reconnect it before then.');
    return check('accounts', item.id, name, 'ok', `${who}${expires ? `, sign-in good until ${new Date(expires).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}.`);
  });
}

async function recentProblems(workspaceId, clientNames) {
  const since = (days) => new Date(Date.now() - days * 86400000).toISOString();
  const [jobs, signIns, comments] = await Promise.all([
    databaseRequest(`publish_jobs?workspace_id=eq.${workspaceId}&status=in.(failed,unknown)&updated_at=gte.${since(14)}&select=id,post_id,client_id,platform,status,last_error,updated_at&order=updated_at.desc&limit=8`).catch(() => []),
    databaseRequest(`oauth_sessions?workspace_id=eq.${workspaceId}&status=eq.failed&created_at=gte.${since(7)}&select=provider,client_id,error,created_at&order=created_at.desc&limit=5`).catch(() => []),
    databaseRequest(`scheduled_comments?workspace_id=eq.${workspaceId}&status=eq.failed&created_at=gte.${since(14)}&select=platforms,last_error,created_at&order=created_at.desc&limit=5`).catch(() => [])
  ]);
  const postIds = [...new Set((jobs || []).map((job) => job.post_id))];
  const titles = postIds.length ? Object.fromEntries((await databaseRequest(`scheduled_posts?id=in.(${postIds.join(',')})&select=id,title`).catch(() => []) || []).map((post) => [post.id, post.title])) : {};
  const providerLabel = { meta: 'Facebook & Instagram', linkedin: 'LinkedIn', pinterest: 'Pinterest' };
  return [
    ...(jobs || []).map((job) => ({ kind: 'post', at: job.updated_at, title: `${PLATFORM_LABELS[job.platform] || job.platform}: “${titles[job.post_id] || 'Untitled post'}”`, detail: job.status === 'unknown' ? 'Connection dropped after sending; check whether it posted.' : job.last_error || 'Failed.', postId: job.post_id, client: clientNames[job.client_id] || job.client_id })),
    ...(signIns || []).map((session) => ({ kind: 'sign-in', at: session.created_at, title: `Connecting ${providerLabel[session.provider] || session.provider}`, detail: session.error || 'The sign-in failed.', client: clientNames[session.client_id] || session.client_id })),
    ...(comments || []).map((comment) => ({ kind: 'comment', at: comment.created_at, title: `Scheduled comment on ${(comment.platforms || []).map((platform) => PLATFORM_LABELS[platform] || platform).join(', ') || 'a post'}`, detail: comment.last_error || 'Failed.' }))
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 12);
}

async function systemStatus({ workspaceId, origin, clients = [] }) {
  const clientNames = Object.fromEntries(clients.map((client) => [client.id, client.name]));
  const tables = await missingTables();
  const config = getConfig();
  const checks = [
    check('core', 'database', 'Database', tables.length ? 'error' : 'ok', tables.length ? `Missing tables: ${tables.join(', ')}.` : 'Connected, with every table in place.', tables.length ? 'Run supabase/schema.sql again in the Supabase SQL editor. It’s safe to re-run.' : ''),
    check('core', 'secrets', 'Server keys', config.missing.length ? 'error' : 'ok', config.missing.length ? `Missing: ${config.missing.join(', ')}.` : 'Supabase keys and the encryption key are set.', config.missing.length ? 'Add them in Vercel, then redeploy.' : ''),
    ...siteChecks(origin),
    ...await schedulerChecks(),
    ...networkChecks(),
    ...featureChecks(tables),
    ...await accountChecks(workspaceId, clientNames).catch(() => [])
  ];
  const problems = await recentProblems(workspaceId, clientNames);
  const counts = checks.reduce((sum, item) => ({ ...sum, [item.status]: (sum[item.status] || 0) + 1 }), {});
  return { checkedAt: new Date().toISOString(), counts, checks, problems };
}

module.exports = { systemStatus };
