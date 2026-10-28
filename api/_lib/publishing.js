const crypto = require('node:crypto');
const {
  httpError, databaseRequest, ayrshareRequest, ayrshareConfigured, getProfile, getWorkspaceState,
  encryptSecret, decryptSecret, buildPostBody, COMMENT_PLATFORMS
} = require('./core');
const { DIRECT_PLATFORMS, CONNECTION_PLATFORM, COMMENTABLE, PublishError, providerConfigured, adapterFor } = require('./platforms');

// SignalDesk's own publishing queue. A scheduled post has one job per network; the worker
// claims due jobs, publishes them directly (or through Ayrshare for other networks), and
// records the result. Jobs are retried only when it is safe to do so.

const MAX_ATTEMPTS = 6;
const RETRY_MINUTES = [1, 5, 15, 30, 60];
const REFRESH_WINDOW_MS = 7 * 86400000;
const PLATFORM_LABELS = { facebook: 'Facebook', instagram: 'Instagram', instagram_story: 'Instagram Story', linkedin: 'LinkedIn', pinterest: 'Pinterest', twitter: 'X', youtube: 'YouTube', tiktok: 'TikTok', threads: 'Threads' };
// Networks or formats you post to yourself. SignalDesk sends a reminder with the copy and media at the scheduled time.
const MANUAL_PLATFORMS = { linkedin_page: 'LinkedIn Page', instagram_story: 'Instagram Story', tiktok: 'TikTok', youtube_shorts: 'YouTube Shorts', x: 'X', threads: 'Threads', other: 'Other' };
const CONNECTION_FIELDS = 'id,workspace_id,client_id,platform,external_id,display_name,username,profile_url,image_url,status,token_expires_at,refresh_expires_at,meta,last_error,expiry_notified_at,updated_at';

function label(platform) {
  return PLATFORM_LABELS[platform] || MANUAL_PLATFORMS[platform] || platform;
}

function nowIso() {
  return new Date().toISOString();
}

// --- Connections ---

async function listConnections(workspaceId, clientId) {
  const query = new URLSearchParams({ select: CONNECTION_FIELDS, workspace_id: `eq.${workspaceId}` });
  if (clientId) query.set('client_id', `eq.${clientId}`);
  return await databaseRequest(`social_connections?${query}`) || [];
}

async function loadConnection(id, encryptionKey) {
  if (!id) return null;
  const rows = await databaseRequest(`social_connections?id=eq.${id}&select=${CONNECTION_FIELDS},token_ciphertext,refresh_token_ciphertext`);
  const row = rows?.[0];
  if (!row) return null;
  const { token_ciphertext: token, refresh_token_ciphertext: refresh, ...rest } = row;
  return { ...rest, token: decryptSecret(token, encryptionKey), refreshToken: refresh ? decryptSecret(refresh, encryptionKey) : null };
}

async function saveConnection({ workspaceId, clientId, userId, candidate, connection, encryptionKey }) {
  await databaseRequest('social_connections?on_conflict=workspace_id,client_id,platform', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      workspace_id: workspaceId,
      client_id: clientId,
      platform: candidate.platform,
      external_id: candidate.externalId,
      display_name: candidate.displayName || null,
      username: candidate.username || null,
      profile_url: candidate.profileUrl || null,
      image_url: candidate.imageUrl || null,
      token_ciphertext: encryptSecret(connection.token, encryptionKey),
      refresh_token_ciphertext: connection.refreshToken ? encryptSecret(connection.refreshToken, encryptionKey) : null,
      token_expires_at: connection.expiresAt,
      refresh_expires_at: connection.refreshExpiresAt,
      meta: connection.meta || {},
      status: 'active',
      last_error: null,
      expiry_notified_at: null,
      connected_by: userId,
      updated_at: nowIso()
    })
  });
}

async function markNeedsReauth(connectionId, message) {
  if (!connectionId) return;
  await databaseRequest(`social_connections?id=eq.${connectionId}`, {
    method: 'PATCH', headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'needs_reauth', last_error: message, updated_at: nowIso() })
  });
}

// Refreshes a token that is about to expire, when the network supports it.
async function ensureFreshToken(connection, encryptionKey) {
  const expires = Date.parse(connection.token_expires_at);
  if (!Number.isFinite(expires) || expires - Date.now() > 10 * 60000) return connection;
  const adapter = adapterFor(connection.platform);
  if (!connection.refreshToken || !adapter.refresh) {
    if (expires > Date.now()) return connection;
    throw new PublishError('auth', `The ${label(connection.platform)} sign-in expired. Reconnect the account.`);
  }
  const fresh = await adapter.refresh(connection);
  await databaseRequest(`social_connections?id=eq.${connection.id}`, {
    method: 'PATCH', headers: { prefer: 'return=minimal' },
    body: JSON.stringify({
      token_ciphertext: encryptSecret(fresh.token, encryptionKey),
      refresh_token_ciphertext: fresh.refreshToken ? encryptSecret(fresh.refreshToken, encryptionKey) : null,
      token_expires_at: fresh.expiresAt, refresh_expires_at: fresh.refreshExpiresAt || connection.refresh_expires_at,
      status: 'active', last_error: null, expiry_notified_at: null, updated_at: nowIso()
    })
  });
  return { ...connection, token: fresh.token, refreshToken: fresh.refreshToken, token_expires_at: fresh.expiresAt };
}

// Picks how each network is published: a direct connection first, then Ayrshare if configured.
async function resolveDestinations(workspaceId, clientId, platforms, encryptionKey) {
  const connections = await listConnections(workspaceId, clientId);
  let profile;
  const destinations = [];
  for (const platform of platforms) {
    const connectionPlatform = CONNECTION_PLATFORM[platform] || platform;
    const connection = DIRECT_PLATFORMS[platform] ? connections.find((item) => item.platform === connectionPlatform) : null;
    if (connection?.status === 'active') {
      destinations.push({ platform, provider: 'direct', connectionId: connection.id });
      continue;
    }
    if (connection?.status === 'needs_reauth') throw httpError(400, `Reconnect ${label(platform)} in Social Accounts before scheduling to it.`);
    if (ayrshareConfigured()) {
      if (profile === undefined) profile = await getProfile(workspaceId, clientId, encryptionKey);
      if (profile) {
        destinations.push({ platform, provider: 'ayrshare', connectionId: null });
        continue;
      }
    }
    throw httpError(400, `Connect ${label(platform)} for this client in Social Accounts first.`);
  }
  return destinations;
}

// --- Scheduling ---

function contentFor(post, platform) {
  const override = post.content?.platformContent?.[platform] || {};
  const media = Array.isArray(override.media) ? override.media : post.content?.media || [];
  const alts = post.content?.mediaAlt || {};
  return {
    text: typeof override.text === 'string' ? override.text : post.content?.text || '',
    media,
    // Image descriptions for screen readers, keyed by media URL.
    alt: Object.fromEntries(media.filter((url) => typeof alts[url] === 'string' && alts[url]).map((url) => [url, alts[url]]))
  };
}

// The time of each occurrence, keeping the same local time across daylight saving changes.
function occurrenceTimes(base, autoRepost, timeZone) {
  const times = [base];
  if (!autoRepost) return times;
  const { zonedParts, zonedToUtc } = require('./core');
  const start = zonedParts(new Date(base), timeZone);
  for (let index = 1; index <= autoRepost.repeat; index += 1) {
    let year, month, day;
    if (autoRepost.every === 'month') {
      const total = start.month - 1 + index;
      year = start.year + Math.floor(total / 12);
      month = (total % 12) + 1;
      day = Math.min(start.day, new Date(Date.UTC(year, month, 0)).getUTCDate());
    } else {
      const date = new Date(Date.UTC(start.year, start.month - 1, start.day + index * autoRepost.days));
      year = date.getUTCFullYear(); month = date.getUTCMonth() + 1; day = date.getUTCDate();
    }
    times.push(zonedToUtc(year, month, day, start.hour, start.minute, timeZone));
  }
  return times;
}

// --- History ---

async function addHistory(workspaceId, postId, action, { actorName = null, detail = {} } = {}) {
  const ids = Array.isArray(postId) ? postId : [postId];
  await databaseRequest('post_history', {
    method: 'POST', headers: { prefer: 'return=minimal' },
    body: JSON.stringify(ids.map((id) => ({ workspace_id: workspaceId, post_id: id, action, actor_name: actorName, detail })))
  }).catch((error) => console.error('Could not record history:', error.message));
}

async function listHistory(workspaceId, postId) {
  const rows = await databaseRequest(`post_history?workspace_id=eq.${workspaceId}&post_id=eq.${postId}&select=id,action,actor_name,detail,created_at&order=created_at.asc&limit=200`) || [];
  return rows.map((row) => ({ id: row.id, action: row.action, actor: row.actor_name, detail: row.detail, at: row.created_at }));
}

// Adds UTM tags to links so clicks show up in the client's web analytics. Links that
// already carry utm_source are left alone. Applied when publishing, so saved copy stays clean.
function tagLinks(text, { source, campaign }) {
  return String(text).replace(/https?:\/\/[^\s<>"')\]]+/g, (match) => {
    const trailing = /[.,!?;:]+$/.exec(match)?.[0] || '';
    const raw = trailing ? match.slice(0, -trailing.length) : match;
    let url;
    try { url = new URL(raw); } catch { return match; }
    if (url.searchParams.has('utm_source')) return match;
    url.searchParams.set('utm_source', source);
    url.searchParams.set('utm_medium', 'social');
    url.searchParams.set('utm_campaign', String(campaign).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'signaldesk');
    return url.href + trailing;
  });
}

function withTracking(post, platform, content, options) {
  if (!options.utm) return { content, options };
  const campaign = post.campaign || post.client_id;
  const pinterest = options.pinterest?.link ? { ...options.pinterest, link: tagLinks(options.pinterest.link, { source: platform, campaign }) } : options.pinterest;
  return { content: { ...content, text: tagLinks(content.text, { source: platform, campaign }) }, options: { ...options, ...(pinterest ? { pinterest } : {}) } };
}

// --- Click-tracking short links ---
// With the "count clicks" option on, links in a post are swapped for APP_URL/l/<code> when it
// publishes: one code per network and destination, so clicks show up per network. Instagram
// captions can't hold clickable links, so they're left alone there.
const SHORT_LINK_SKIP = new Set(['instagram']);
const LINK_PATTERN = /https?:\/\/[^\s<>"')\]]+/g;

function shortLinkBase() {
  const base = (process.env.APP_URL || '').replace(/\/+$/, '');
  return /^https:\/\//.test(base) ? base : '';
}

function newLinkCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(7), (byte) => alphabet[byte % alphabet.length]).join('');
}

async function shortLinkFor(job, url) {
  const existing = await databaseRequest(`short_links?job_id=eq.${job.id}&url=eq.${encodeURIComponent(url)}&select=code`);
  if (existing?.[0]) return existing[0].code;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = newLinkCode();
    try {
      await databaseRequest('short_links', {
        method: 'POST', headers: { prefer: 'return=minimal' },
        body: JSON.stringify({ code, workspace_id: job.workspace_id, client_id: job.client_id, post_id: job.post_id, job_id: job.id, platform: job.platform, url })
      });
      return code;
    } catch (error) {
      if (error.status !== 409) throw error;
      // A retry may have just created this job's link; otherwise the code collided.
      const again = await databaseRequest(`short_links?job_id=eq.${job.id}&url=eq.${encodeURIComponent(url)}&select=code`);
      if (again?.[0]) return again[0].code;
    }
  }
  throw new Error('Could not create a short link.');
}

async function shortenText(job, text) {
  const base = shortLinkBase();
  if (!base) return text;
  const matches = [...new Set(String(text).match(LINK_PATTERN) || [])];
  let result = String(text);
  for (const match of matches) {
    const trailing = /[.,!?;:]+$/.exec(match)?.[0] || '';
    const url = trailing ? match.slice(0, -trailing.length) : match;
    if (url.startsWith(`${base}/l/`)) continue;
    const code = await shortLinkFor(job, url);
    result = result.split(match).join(`${base}/l/${code}${trailing}`);
  }
  return result;
}

async function withShortLinks(job, content, options) {
  if (!options.shortLinks || SHORT_LINK_SKIP.has(job.platform) || !shortLinkBase()) return { content, options };
  try {
    const text = await shortenText(job, content.text);
    let pinterest = options.pinterest;
    if (pinterest?.link && /^https?:\/\//.test(pinterest.link)) pinterest = { ...pinterest, link: `${shortLinkBase()}/l/${await shortLinkFor(job, pinterest.link)}` };
    return { content: { ...content, text }, options: { ...options, ...(pinterest ? { pinterest } : {}) } };
  } catch (error) {
    // Counting clicks is never worth a missed post: publish with the original links instead.
    console.error('Short links unavailable, publishing original links:', error.message);
    return { content, options };
  }
}

// Clicks on short links over the chosen time frame (30 days unless Analytics asks otherwise).
async function linkClickSummary(workspaceId, clientId = null, rangeDays = 30) {
  const since = new Date(Date.now() - (rangeDays - 1) * 86400000).toISOString().slice(0, 10);
  const days = await allRows(`link_click_days?workspace_id=eq.${workspaceId}&day=gte.${since}&select=code,day,clicks&order=day.desc`);
  const byCode = {};
  let total = 0;
  for (const row of days) { byCode[row.code] = (byCode[row.code] || 0) + row.clicks; total += row.clicks; }
  const codes = Object.keys(byCode);
  const links = [];
  for (let index = 0; index < codes.length; index += 150) {
    links.push(...(await databaseRequest(`short_links?workspace_id=eq.${workspaceId}&code=in.(${codes.slice(index, index + 150).join(',')})${clientId ? `&client_id=eq.${encodeURIComponent(clientId)}` : ''}&select=code,url,platform,client_id,post_id`) || []));
  }
  if (clientId) total = links.reduce((sum, link) => sum + byCode[link.code], 0);
  const byPlatform = {};
  for (const link of links) byPlatform[link.platform] = (byPlatform[link.platform] || 0) + byCode[link.code];
  const top = links.sort((a, b) => byCode[b.code] - byCode[a.code]).slice(0, 10);
  const postIds = [...new Set(top.map((link) => link.post_id).filter(Boolean))];
  const titles = postIds.length ? Object.fromEntries((await databaseRequest(`scheduled_posts?id=in.(${postIds.join(',')})&select=id,title`) || []).map((post) => [post.id, post.title])) : {};
  return {
    total, byPlatform,
    top: top.map((link) => ({ code: link.code, url: link.url, platform: link.platform, clientId: link.client_id, postId: link.post_id, postTitle: titles[link.post_id] || '', clicks: byCode[link.code] }))
  };
}

function commentableFor(provider, platform) {
  if (provider === 'manual') return false;
  return provider === 'direct' ? COMMENTABLE.has(platform) : COMMENT_PLATFORMS.has(platform);
}

async function createScheduledPost({
  workspaceId, clientId, userId, title, platforms, text, mediaUrls = [], platformContent = {}, options = {},
  scheduledFor, held = false, source = 'composer', campaign = null, evergreen = false, encryptionKey,
  manual = [], mediaAlt = {}, timeZone = 'America/New_York', actorName = null
}) {
  const destinations = [
    ...(platforms.length ? await resolveDestinations(workspaceId, clientId, platforms, encryptionKey) : []),
    ...manual.map((platform) => ({ platform, provider: 'manual', connectionId: null }))
  ];
  if (!destinations.length) throw httpError(400, 'Choose at least one network or reminder.');
  const { followUpComments = [], autoRepost, ...stored } = options;
  const content = { text, media: mediaUrls, platformContent, ...(Object.keys(mediaAlt).length ? { mediaAlt } : {}) };
  const base = scheduledFor;
  const occurrences = occurrenceTimes(base, autoRepost, timeZone).map((at, index) => ({ id: crypto.randomUUID(), at, parent: null, index }));
  occurrences.slice(1).forEach((item) => { item.parent = occurrences[0].id; });
  const posts = occurrences.map((item, index) => ({
    id: item.id, workspace_id: workspaceId, client_id: clientId, created_by: userId, source,
    title: (title || '').slice(0, 200), scheduled_for: new Date(item.at).toISOString(),
    status: held ? 'pending_approval' : 'scheduled', content,
    // Reposts carry the same copy but not the comments.
    options: index === 0 ? { ...stored, followUpComments, reposts: autoRepost || null } : { ...stored, firstComment: undefined, repostOf: occurrences[0].id },
    parent_id: item.parent,
    campaign: campaign || null,
    evergreen: index === 0 && evergreen
  }));
  const jobs = occurrences.flatMap((item) => destinations.map((destination) => ({
    id: crypto.randomUUID(), post_id: item.id, workspace_id: workspaceId, client_id: clientId,
    platform: destination.platform, provider: destination.provider, connection_id: destination.connectionId,
    run_at: new Date(item.at).toISOString(), status: held ? 'held' : 'queued'
  })));
  const firstJobs = jobs.filter((job) => job.post_id === occurrences[0].id);
  const comments = [];
  for (const job of firstJobs) {
    if (!commentableFor(job.provider, job.platform)) continue;
    // Ayrshare posts the first comment itself; direct posts queue it right behind the post.
    if (stored.firstComment?.comment && job.provider === 'direct') comments.push({ job, comment: stored.firstComment.comment, delayMinutes: 0 });
    followUpComments.forEach((item) => comments.push({ job, comment: item.comment, delayMinutes: item.delayMinutes }));
  }
  await databaseRequest('scheduled_posts', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify(posts) });
  try {
    await databaseRequest('publish_jobs', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify(jobs) });
    if (comments.length) {
      await databaseRequest('scheduled_comments', {
        method: 'POST', headers: { prefer: 'return=minimal' },
        body: JSON.stringify(comments.map((item) => ({
          workspace_id: workspaceId, client_id: clientId, job_id: item.job.id, provider_post_id: null, platforms: [item.job.platform],
          comment: item.comment, run_at: new Date(base + item.delayMinutes * 60000).toISOString(), created_by: userId
        })))
      });
    }
  } catch (error) {
    await databaseRequest(`scheduled_posts?id=in.(${occurrences.map((item) => item.id).join(',')})`, { method: 'DELETE', headers: { prefer: 'return=minimal' } }).catch(() => {});
    throw error;
  }
  await addHistory(workspaceId, occurrences.map((item) => item.id), source === 'autopilot' ? 'created_by_autopilot' : 'created', {
    actorName, detail: { scheduledFor: posts[0].scheduled_for, networks: destinations.map((item) => item.platform), held }
  });
  return {
    id: occurrences[0].id,
    status: held ? 'pending_approval' : 'scheduled',
    scheduledFor: posts[0].scheduled_for,
    reposts: occurrences.length - 1,
    destinations: destinations.map(({ platform, provider }) => ({ platform, provider })),
    queuedComments: followUpComments.length
  };
}

// --- Worker ---

async function publishViaAyrshare({ job, post, content, markSent, encryptionKey }) {
  const profile = await getProfile(job.workspace_id, job.client_id, encryptionKey);
  if (!profile) throw new PublishError('auth', 'This client is no longer connected through Ayrshare.');
  const { followUpComments, reposts, repostOf, ...options } = post.options || {}; // eslint-disable-line no-unused-vars
  const body = buildPostBody({ text: content.text, platforms: [job.platform], mediaUrls: content.media, options, idempotencyKey: job.id });
  await markSent();
  let result;
  try {
    result = await ayrshareRequest('/post', { method: 'POST', profileKey: profile.profileKey, body });
  } catch (error) {
    const status = error.status || 0;
    const message = error.payload?.posts?.[0]?.errors?.[0]?.message || error.payload?.errors?.[0]?.message || error.message;
    // Ayrshare drops repeats of the same idempotency key, so network errors are safe to retry.
    throw new PublishError(!status || status >= 500 ? 'temporary' : status === 429 ? 'rate_limit' : status === 401 || status === 403 ? 'auth' : 'invalid', message);
  }
  const entry = (result.postIds || []).find((item) => item.platform === job.platform) || {};
  if (result.status === 'error' || entry.status === 'error') throw new PublishError('invalid', result.errors?.[0]?.message || entry.message || 'Ayrshare could not publish this post.');
  return { externalId: result.id, url: entry.postUrl || '' };
}

function classify(error) {
  if (error instanceof PublishError) return error.kind;
  if (error.status && error.status < 500) return 'invalid';
  return 'temporary';
}

async function runJob(job, encryptionKey) {
  const startedAt = nowIso();
  const guard = `publish_jobs?id=eq.${job.id}&lock_token=eq.${job.lock_token}`;
  const patchJob = (patch) => databaseRequest(guard, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ ...patch, updated_at: nowIso() }) });
  const unlock = { lock_token: null, locked_at: null };
  let stage = job.stage || {};
  const record = (outcome, error) => databaseRequest('publish_attempts', {
    method: 'POST', headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ job_id: job.id, workspace_id: job.workspace_id, started_at: startedAt, outcome, error: error?.message || null, error_kind: error ? classify(error) : null })
  }).catch((failure) => console.error('Could not record attempt:', failure.message));
  try {
    const post = (await databaseRequest(`scheduled_posts?id=eq.${job.post_id}&select=*`))?.[0];
    if (!post || post.status === 'canceled') {
      await patchJob({ status: 'canceled', ...unlock });
      return 'canceled';
    }
    const tracked = withTracking(post, job.platform, contentFor(post, job.platform), post.options || {});
    const { content, options: postOptions } = await withShortLinks(job, tracked.content, tracked.options);
    const markSent = () => patchJob({ sent_at: nowIso() });
    const saveStage = async (patch) => { stage = { ...stage, ...patch }; await patchJob({ stage }); };
    let outcome;
    if (job.provider === 'manual') {
      // Keep the copy with its tracked links so "Copy text" pastes those.
      await patchJob({ status: 'manual_due', stage: { ...stage, text: content.text }, ...unlock });
      await notifyManualDue(job, post, content);
      await record('reminded');
      return 'manual';
    }
    if (job.provider === 'ayrshare') {
      outcome = await publishViaAyrshare({ job, post: { ...post, options: postOptions }, content, markSent, encryptionKey });
    } else {
      let connection = await loadConnection(job.connection_id, encryptionKey);
      if (!connection) throw new PublishError('auth', `The ${label(job.platform)} account was disconnected. Reconnect it, then retry.`);
      if (connection.status === 'needs_reauth') throw new PublishError('auth', connection.last_error || `Reconnect ${label(job.platform)} in Social Accounts, then retry.`);
      if (!providerConfigured(DIRECT_PLATFORMS[job.platform])) throw new PublishError('invalid', `${label(job.platform)} publishing isn't configured on the server.`);
      connection = await ensureFreshToken(connection, encryptionKey);
      outcome = await adapterFor(job.platform).publish({ connection, job, content, options: postOptions, stage, saveStage, markSent });
    }
    if (outcome.pending) {
      // Media is still processing; check again soon without using up an attempt.
      await patchJob({ status: 'queued', attempts: Math.max(0, job.attempts - 1), run_at: new Date(Date.now() + (outcome.retryInSeconds || 60) * 1000).toISOString(), ...unlock });
      return 'pending';
    }
    await patchJob({ status: 'published', external_id: outcome.externalId || null, external_url: outcome.url || null, published_at: nowIso(), last_error: null, error_kind: null, ...unlock });
    await record('published');
    await addHistory(job.workspace_id, job.post_id, 'published', { detail: { network: job.platform, url: outcome.url || null } });
    return 'published';
  } catch (error) {
    const kind = classify(error);
    const retry = (kind === 'temporary' || kind === 'rate_limit') && job.attempts < MAX_ATTEMPTS;
    const delay = RETRY_MINUTES[Math.min(job.attempts - 1, RETRY_MINUTES.length - 1)] * (kind === 'rate_limit' ? 3 : 1);
    await patchJob(retry
      ? { status: 'queued', run_at: new Date(Date.now() + delay * 60000).toISOString(), last_error: error.message, error_kind: kind, sent_at: null, ...unlock }
      : { status: kind === 'unknown' ? 'unknown' : 'failed', last_error: error.message, error_kind: kind, ...(kind === 'unknown' ? {} : { sent_at: null }), ...unlock }
    ).catch((failure) => console.error('Could not update job:', failure.message));
    if (kind === 'auth' && job.connection_id) await markNeedsReauth(job.connection_id, error.message).catch(() => {});
    await record(retry ? 'retrying' : kind === 'unknown' ? 'unknown' : 'failed', error);
    if (!retry) await addHistory(job.workspace_id, job.post_id, kind === 'unknown' ? 'outcome_unknown' : 'failed', { detail: { network: job.platform, error: error.message } });
    return retry ? 'retrying' : 'failed';
  }
}

async function notifyManualDue(job, post, content) {
  const { notify } = require('./notify');
  const client = ((await getWorkspaceState(post.workspace_id)).clients || []).find((item) => item.id === post.client_id);
  const payload = {
    workspaceId: post.workspace_id, type: 'manual_due', category: 'publishing',
    title: `Time to post on ${label(job.platform)}${client ? ` for ${client.name}` : ''}`,
    body: `${content.text.slice(0, 280)}${content.media.length ? ` (${content.media.length} media file${content.media.length === 1 ? '' : 's'} attached in SignalDesk)` : ''}`,
    view: 'calendar', data: { postId: post.id, jobId: job.id }
  };
  await notify({ ...payload, audience: 'admins', excludeUserId: post.created_by });
  if (post.created_by) await notify({ ...payload, audience: 'users', userIds: [post.created_by] });
}

async function markManualDone(workspaceId, jobId, { url, userId, admin, actorName }) {
  if (typeof jobId !== 'string' || !/^[0-9a-f-]{36}$/i.test(jobId)) throw httpError(400, 'Choose a reminder.');
  const job = (await databaseRequest(`publish_jobs?workspace_id=eq.${workspaceId}&id=eq.${jobId}&select=id,post_id,provider,status,platform,scheduled_posts(created_by)`))?.[0];
  if (!job || job.provider !== 'manual') throw httpError(404, 'Reminder not found.');
  if (!admin && job.scheduled_posts?.created_by !== userId) throw httpError(403, 'Only admins or the post’s author can mark it posted.');
  if (!['manual_due', 'queued'].includes(job.status)) throw httpError(409, 'This reminder is already done or canceled.');
  const link = typeof url === 'string' && /^https:\/\/\S{3,1990}$/.test(url.trim()) ? url.trim() : null;
  await patchJobs(`id=eq.${job.id}`, { status: 'published', published_at: nowIso(), external_url: link });
  await addHistory(workspaceId, job.post_id, 'posted_manually', { actorName, detail: { network: job.platform, url: link } });
  return { done: true };
}

async function notifyFailedJobs() {
  const rows = await databaseRequest('publish_jobs?status=in.(failed,unknown)&notified_at=is.null&select=id,post_id,workspace_id,platform,status,last_error&limit=25') || [];
  if (!rows.length) return 0;
  const { notify } = require('./notify');
  const byPost = new Map();
  rows.forEach((row) => { if (!byPost.has(row.post_id)) byPost.set(row.post_id, []); byPost.get(row.post_id).push(row); });
  const posts = await databaseRequest(`scheduled_posts?id=in.(${[...byPost.keys()].join(',')})&select=id,title,client_id,created_by,workspace_id`) || [];
  for (const post of posts) {
    const client = ((await getWorkspaceState(post.workspace_id)).clients || []).find((item) => item.id === post.client_id);
    // Failures and unclear outcomes need different next steps, so they're reported separately.
    for (const unknown of [false, true]) {
      const jobs = byPost.get(post.id).filter((job) => (job.status === 'unknown') === unknown);
      if (!jobs.length) continue;
      const networks = jobs.map((job) => label(job.platform)).join(', ');
      const payload = {
        workspaceId: post.workspace_id, type: unknown ? 'publish_unknown' : 'publish_failed', category: 'publishing',
        title: unknown ? `Check ${networks}: did “${post.title || 'a post'}” go out?` : `“${post.title || 'A post'}” didn't publish to ${networks}`,
        body: `${client?.name ? `${client.name}: ` : ''}${jobs[0].last_error || 'The network rejected the post.'}`,
        view: 'calendar', data: { postId: post.id }
      };
      await notify({ ...payload, audience: 'admins', excludeUserId: post.created_by });
      if (post.created_by) await notify({ ...payload, audience: 'users', userIds: [post.created_by] });
    }
  }
  await databaseRequest(`publish_jobs?id=in.(${rows.map((row) => row.id).join(',')})`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ notified_at: nowIso() }) });
  return rows.length;
}

async function processPublishQueue({ encryptionKey, limit = 10, deadline = Date.now() + 240000 } = {}) {
  const token = crypto.randomUUID();
  const jobs = await databaseRequest('rpc/claim_publish_jobs', { method: 'POST', body: JSON.stringify({ p_limit: limit, p_token: token }) }) || [];
  const results = { claimed: jobs.length, published: 0, retrying: 0, failed: 0, pending: 0, canceled: 0, released: 0, manual: 0 };
  for (const job of jobs) {
    if (Date.now() > deadline) {
      // Out of time: hand the job back untouched for the next run.
      await databaseRequest(`publish_jobs?id=eq.${job.id}&lock_token=eq.${token}`, {
        method: 'PATCH', headers: { prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'queued', attempts: Math.max(0, job.attempts - 1), lock_token: null, locked_at: null })
      });
      results.released += 1;
      continue;
    }
    results[await runJob(job, encryptionKey)] += 1;
  }
  results.notified = await notifyFailedJobs().catch((error) => { console.error('Failure notifications failed:', error.message); return 0; });
  return results;
}

// Refreshes tokens before they expire and warns admins when a reconnect is needed.
async function maintainConnections({ encryptionKey, limit = 20 } = {}) {
  const soon = new Date(Date.now() + REFRESH_WINDOW_MS).toISOString();
  const rows = await databaseRequest(`social_connections?status=eq.active&token_expires_at=lt.${soon}&select=id&order=token_expires_at.asc&limit=${limit}`) || [];
  const { notify } = require('./notify');
  let refreshed = 0, warned = 0, expired = 0;
  for (const { id } of rows) {
    const connection = await loadConnection(id, encryptionKey);
    if (!connection) continue;
    const adapter = adapterFor(connection.platform);
    const expires = Date.parse(connection.token_expires_at);
    const refreshUsable = connection.refreshToken && adapter.refresh && (!connection.refresh_expires_at || Date.parse(connection.refresh_expires_at) > Date.now());
    if (refreshUsable) {
      try {
        await ensureFreshToken({ ...connection, token_expires_at: new Date(Math.min(expires, Date.now())).toISOString() }, encryptionKey);
        refreshed += 1;
        continue;
      } catch (error) {
        console.error('Token refresh failed:', connection.platform, error.message);
      }
    }
    const client = ((await getWorkspaceState(connection.workspace_id)).clients || []).find((item) => item.id === connection.client_id);
    const name = `${label(connection.platform)}${client ? ` for ${client.name}` : ''}`;
    if (expires <= Date.now()) {
      await markNeedsReauth(connection.id, `The ${label(connection.platform)} sign-in expired. Reconnect the account.`);
      await notify({ workspaceId: connection.workspace_id, audience: 'admins', type: 'connection_expired', category: 'publishing', title: `Reconnect ${name}`, body: 'The sign-in expired, so scheduled posts to this account will fail until it is reconnected.', view: 'social-accounts' });
      expired += 1;
    } else if (!connection.expiry_notified_at) {
      const date = new Date(expires).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
      await notify({ workspaceId: connection.workspace_id, audience: 'admins', type: 'connection_expiring', category: 'publishing', title: `Reconnect ${name} by ${date}`, body: `${label(connection.platform)} sign-ins last a limited time. Reconnect in Social Accounts to keep scheduled posts going out.`, view: 'social-accounts' });
      await databaseRequest(`social_connections?id=eq.${connection.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ expiry_notified_at: nowIso() }) });
      warned += 1;
    }
  }
  return { refreshed, warned, expired };
}

// --- Comments on published jobs ---

async function postJobComment(job, text, encryptionKey) {
  if (job.provider === 'ayrshare') {
    const profile = await getProfile(job.workspace_id, job.client_id, encryptionKey);
    if (!profile) throw new Error('The client is no longer connected through Ayrshare.');
    return ayrshareRequest('/comments', { method: 'POST', profileKey: profile.profileKey, body: { id: job.external_id, comment: text, platforms: [job.platform] } });
  }
  const adapter = adapterFor(job.platform);
  if (!adapter?.comment || !COMMENTABLE.has(job.platform)) throw new Error(`${label(job.platform)} doesn't support comments.`);
  let connection = await loadConnection(job.connection_id, encryptionKey);
  if (!connection || connection.status !== 'active') throw new Error(`Reconnect ${label(job.platform)} to post comments.`);
  connection = await ensureFreshToken(connection, encryptionKey);
  return adapter.comment({ connection, externalId: job.external_id, text });
}

// --- Post management ---

const JOB_FIELDS = 'id,platform,provider,status,attempts,run_at,external_url,last_error,error_kind,published_at,stage';

function publicPost(row, clicks = null) {
  return {
    id: row.id, clientId: row.client_id, title: row.title, status: row.status, source: row.source,
    scheduledFor: row.scheduled_for, createdBy: row.created_by, parentId: row.parent_id,
    approvedAt: row.approved_at, decisionNote: row.decision_note, createdAt: row.created_at,
    campaign: row.campaign || '', evergreen: Boolean(row.evergreen), clientStatus: row.client_status || null,
    text: row.content?.text || '', media: row.content?.media || [], platformContent: row.content?.platformContent || {}, mediaAlt: row.content?.mediaAlt || {},
    options: row.options || {},
    jobs: (row.publish_jobs || []).map((job) => ({
      id: job.id, platform: job.platform, provider: job.provider, status: job.status, attempts: job.attempts,
      runAt: job.run_at, url: job.external_url, error: job.last_error, errorKind: job.error_kind, publishedAt: job.published_at,
      copyText: job.provider === 'manual' && typeof job.stage?.text === 'string' ? job.stage.text : undefined,
      clicks: clicks?.[job.id]
    }))
  };
}

async function listPosts(workspaceId, { from, to }) {
  const select = `*,publish_jobs(${JOB_FIELDS})`;
  const range = new URLSearchParams({ select, workspace_id: `eq.${workspaceId}`, order: 'scheduled_for.asc', limit: '500' });
  range.append('scheduled_for', `gte.${new Date(from).toISOString()}`);
  range.append('scheduled_for', `lt.${new Date(to).toISOString()}`);
  const pending = new URLSearchParams({ select, workspace_id: `eq.${workspaceId}`, status: 'eq.pending_approval', order: 'scheduled_for.asc', limit: '200' });
  const [inRange, waiting] = await Promise.all([databaseRequest(`scheduled_posts?${range}`), databaseRequest(`scheduled_posts?${pending}`)]);
  const seen = new Set();
  const rows = [...(inRange || []), ...(waiting || [])].filter((row) => !seen.has(row.id) && seen.add(row.id));
  return attachClicks(rows);
}

// Click counts from short links, per job.
async function attachClicks(rows) {
  const jobIds = rows.flatMap((row) => (row.publish_jobs || []).filter((job) => job.status === 'published' || job.provider === 'manual').map((job) => job.id));
  const clicks = {};
  for (let index = 0; index < jobIds.length; index += 150) {
    const links = await databaseRequest(`short_links?job_id=in.(${jobIds.slice(index, index + 150).join(',')})&select=job_id,clicks`).catch(() => []) || [];
    for (const link of links) clicks[link.job_id] = (clicks[link.job_id] || 0) + link.clicks;
  }
  return rows.map((row) => publicPost(row, clicks));
}

async function getPost(workspaceId, postId) {
  if (typeof postId !== 'string' || !/^[0-9a-f-]{36}$/i.test(postId)) throw httpError(400, 'Choose a post.');
  const rows = await databaseRequest(`scheduled_posts?workspace_id=eq.${workspaceId}&id=eq.${postId}&select=*,publish_jobs(${JOB_FIELDS})`);
  if (!rows?.length) throw httpError(404, 'Post not found.');
  return rows[0];
}

async function familyIds(workspaceId, post) {
  const children = await databaseRequest(`scheduled_posts?workspace_id=eq.${workspaceId}&parent_id=eq.${post.id}&select=id`) || [];
  return [post.id, ...children.map((row) => row.id)];
}

async function patchJobs(filter, patch) {
  return databaseRequest(`publish_jobs?${filter}`, { method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify({ ...patch, updated_at: nowIso() }) });
}

async function approvePost(workspaceId, postId, userId) {
  const post = await getPost(workspaceId, postId);
  if (post.status !== 'pending_approval') throw httpError(409, 'This post isn’t waiting for approval.');
  const ids = await familyIds(workspaceId, post);
  await databaseRequest(`scheduled_posts?id=in.(${ids.join(',')})`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ approved_by: userId, approved_at: nowIso() }) });
  const late = Date.parse(post.scheduled_for) < Date.now();
  // A post approved after its time goes out on the next worker run.
  if (late) await patchJobs(`post_id=eq.${post.id}&status=eq.held`, { status: 'queued', run_at: nowIso() });
  await patchJobs(`post_id=in.(${ids.join(',')})&status=eq.held`, { status: 'queued' });
  if (post.source === 'autopilot') {
    await databaseRequest(`autopilot_items?post_id=eq.${post.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ status: 'scheduled' }) });
  }
  return { post, late };
}

async function rejectPost(workspaceId, postId, note) {
  const post = await getPost(workspaceId, postId);
  if (post.status !== 'pending_approval') throw httpError(409, 'This post isn’t waiting for approval.');
  const ids = await familyIds(workspaceId, post);
  await databaseRequest(`scheduled_posts?id=in.(${ids.join(',')})`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ status: 'canceled', decision_note: note || null, updated_at: nowIso() }) });
  await patchJobs(`post_id=in.(${ids.join(',')})&status=eq.held`, { status: 'canceled' });
  if (post.source === 'autopilot') {
    await databaseRequest(`autopilot_items?post_id=eq.${post.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ status: 'skipped', error: 'Rejected in approvals.' }) });
  }
  return post;
}

async function cancelPost(workspaceId, postId, { userId, admin }) {
  const post = await getPost(workspaceId, postId);
  if (!admin && !(post.created_by === userId && post.status === 'pending_approval')) throw httpError(403, 'Only admins can cancel scheduled posts.');
  if (post.publish_jobs.some((job) => job.status === 'publishing')) throw httpError(409, 'This post is publishing right now. Try again in a minute.');
  const ids = await familyIds(workspaceId, post);
  const published = post.publish_jobs.some((job) => job.status === 'published');
  if (!published) await databaseRequest(`scheduled_posts?id=eq.${post.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ status: 'canceled', updated_at: nowIso() }) });
  const others = ids.filter((id) => id !== post.id);
  if (others.length) await databaseRequest(`scheduled_posts?id=in.(${others.join(',')})&status=in.(pending_approval,scheduled)`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ status: 'canceled', updated_at: nowIso() }) });
  await patchJobs(`post_id=in.(${ids.join(',')})&status=in.(held,queued)`, { status: 'canceled' });
  return { canceled: true, keptPublished: published };
}

async function reschedulePost(workspaceId, postId, when) {
  const post = await getPost(workspaceId, postId);
  if (!['pending_approval', 'scheduled'].includes(post.status) || post.publish_jobs.some((job) => ['publishing', 'published'].includes(job.status))) {
    throw httpError(409, 'Only posts that haven’t started publishing can be moved.');
  }
  if (!Number.isFinite(when) || when <= Date.now()) throw httpError(400, 'Choose a future time.');
  const delta = when - Date.parse(post.scheduled_for);
  const ids = await familyIds(workspaceId, post);
  const rows = await databaseRequest(`scheduled_posts?id=in.(${ids.join(',')})&select=id,scheduled_for,status`) || [];
  for (const row of rows) {
    if (!['pending_approval', 'scheduled'].includes(row.status)) continue;
    const at = new Date(Date.parse(row.scheduled_for) + delta).toISOString();
    await databaseRequest(`scheduled_posts?id=eq.${row.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ scheduled_for: at, updated_at: nowIso() }) });
    const jobs = await patchJobs(`post_id=eq.${row.id}&status=in.(held,queued)`, { run_at: at }) || [];
    if (jobs.length) {
      const comments = await databaseRequest(`scheduled_comments?job_id=in.(${jobs.map((job) => job.id).join(',')})&status=eq.pending&select=id,run_at`) || [];
      for (const comment of comments) {
        await databaseRequest(`scheduled_comments?id=eq.${comment.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ run_at: new Date(Date.parse(comment.run_at) + delta).toISOString() }) });
      }
    }
  }
  return { scheduledFor: new Date(when).toISOString() };
}

async function retryJob(workspaceId, jobId, { confirmed = false } = {}) {
  if (typeof jobId !== 'string' || !/^[0-9a-f-]{36}$/i.test(jobId)) throw httpError(400, 'Choose a network to retry.');
  const rows = await databaseRequest(`publish_jobs?workspace_id=eq.${workspaceId}&id=eq.${jobId}&select=id,status,connection_id,provider`);
  const job = rows?.[0];
  if (!job) throw httpError(404, 'Not found.');
  if (!['failed', 'unknown'].includes(job.status)) throw httpError(409, 'Only failed posts can be retried.');
  if (job.status === 'unknown' && !confirmed) throw httpError(409, 'Check the account first: this post may already be live.');
  if (job.provider === 'direct') {
    const connection = (await databaseRequest(`social_connections?id=eq.${job.connection_id}&select=status`))?.[0];
    if (!connection || connection.status !== 'active') throw httpError(400, 'Reconnect this account in Social Accounts, then retry.');
  }
  await patchJobs(`id=eq.${job.id}`, { status: 'queued', run_at: nowIso(), attempts: 0, last_error: null, error_kind: null, notified_at: null, sent_at: null, stage: {} });
  return { queued: true };
}

// --- Metrics for Top Posts ---

const METRICS_CACHE_MS = 6 * 3600000;

async function directPostRows({ workspaceId, clientId, start, end, encryptionKey }) {
  const query = new URLSearchParams({
    select: 'id,platform,external_id,external_url,published_at,connection_id,metrics,metrics_at,scheduled_posts(title,content,campaign)',
    workspace_id: `eq.${workspaceId}`, client_id: `eq.${clientId}`, provider: 'eq.direct', status: 'eq.published', order: 'published_at.desc', limit: '60'
  });
  query.append('published_at', `gte.${new Date(start).toISOString()}`);
  query.append('published_at', `lte.${new Date(end).toISOString()}`);
  const jobs = await databaseRequest(`publish_jobs?${query}`) || [];
  const connections = new Map();
  const errors = [];
  const rows = [];
  for (const job of jobs) {
    let metrics = job.metrics;
    const stale = !job.metrics_at || Date.now() - Date.parse(job.metrics_at) > METRICS_CACHE_MS;
    const adapter = adapterFor(job.platform);
    if (stale && adapter?.metrics && job.external_id) {
      try {
        if (!connections.has(job.connection_id)) connections.set(job.connection_id, await loadConnection(job.connection_id, encryptionKey));
        const connection = connections.get(job.connection_id);
        if (connection?.status === 'active') {
          metrics = await adapter.metrics({ connection: await ensureFreshToken(connection, encryptionKey), job });
          await databaseRequest(`publish_jobs?id=eq.${job.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ metrics, metrics_at: nowIso() }) });
        }
      } catch (error) {
        errors.push({ postId: job.id, message: error.message });
      }
    }
    const content = contentFor({ content: job.scheduled_posts?.content || {} }, job.platform);
    rows.push({
      id: `job:${job.id}`, providerPostId: job.id, platform: job.platform, text: content.text.slice(0, 500), url: job.external_url || '', campaign: job.scheduled_posts?.campaign || '',
      media: content.media[0] || null, publishedAt: job.published_at, raw: metrics || {}, hasData: Boolean(metrics && Object.values(metrics).some((value) => value !== null))
    });
  }
  return { rows, errors };
}

// --- Worker health ---

const WORKER_STALE_MS = 15 * 60000;
const HEALTH_ALERT_EVERY_MS = 12 * 3600000;

async function recordWorkerRun(name, result = {}) {
  await databaseRequest('worker_runs?on_conflict=name', {
    method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ name, last_run_at: nowIso(), last_result: result })
  }).catch((error) => console.error('Could not record worker run:', error.message));
}

async function lastWorkerRun(name) {
  const rows = await databaseRequest(`worker_runs?name=eq.${name}&select=last_run_at`);
  return rows?.[0]?.last_run_at || null;
}

// Alerts admins when posts are past due because the every-minute publishing run has stopped.
async function checkWorkerHealth({ now = Date.now() } = {}) {
  const lastRun = await lastWorkerRun('publish');
  if (lastRun && now - Date.parse(lastRun) < WORKER_STALE_MS) return { healthy: true, lastRun };
  const overdue = await databaseRequest(`publish_jobs?status=eq.queued&run_at=lt.${new Date(now - WORKER_STALE_MS).toISOString()}&select=workspace_id&limit=500`) || [];
  if (!overdue.length) return { healthy: true, lastRun, idle: true };
  const lastAlert = await lastWorkerRun('publish-health-alert');
  if (lastAlert && now - Date.parse(lastAlert) < HEALTH_ALERT_EVERY_MS) return { healthy: false, lastRun, alerted: false };
  const { notify } = require('./notify');
  const counts = new Map();
  overdue.forEach((row) => counts.set(row.workspace_id, (counts.get(row.workspace_id) || 0) + 1));
  for (const [workspaceId, count] of counts) {
    await notify({
      workspaceId, audience: 'admins', type: 'worker_stalled', category: 'publishing',
      title: `${count} scheduled post${count === 1 ? ' is' : 's are'} past due`,
      body: lastRun
        ? `The publishing worker last ran ${new Date(lastRun).toUTCString()}. Check the scheduler in Supabase (cron jobs) so posts go out.`
        : 'The publishing worker has never run. Set up the scheduler (README, Publishing setup step 3) so posts go out.',
      view: 'overview'
    });
  }
  await recordWorkerRun('publish-health-alert', { overdue: overdue.length });
  return { healthy: false, lastRun, alerted: true, overdue: overdue.length };
}

// Keeps metrics for recent direct posts fresh so the Command Center isn't a week behind.
async function refreshRecentMetrics({ encryptionKey, limit = 10 } = {}) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const staleBefore = Date.now() - 12 * 3600000;
  const jobs = await databaseRequest(`publish_jobs?provider=eq.direct&status=eq.published&published_at=gte.${since}&select=id,platform,external_id,published_at,connection_id,metrics_at&order=metrics_at.asc.nullsfirst&limit=${limit * 3}`) || [];
  let refreshed = 0;
  const connections = new Map();
  for (const job of jobs.filter((item) => !item.metrics_at || Date.parse(item.metrics_at) < staleBefore).slice(0, limit)) {
    const adapter = adapterFor(job.platform);
    if (!adapter?.metrics || !job.external_id) continue;
    try {
      if (!connections.has(job.connection_id)) connections.set(job.connection_id, await loadConnection(job.connection_id, encryptionKey));
      const connection = connections.get(job.connection_id);
      if (connection?.status !== 'active') continue;
      const metrics = await adapter.metrics({ connection: await ensureFreshToken(connection, encryptionKey), job });
      await databaseRequest(`publish_jobs?id=eq.${job.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ metrics, metrics_at: nowIso() }) });
      refreshed += 1;
    } catch (error) {
      // Try again later rather than retrying the same post every run.
      await databaseRequest(`publish_jobs?id=eq.${job.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ metrics_at: nowIso() }) }).catch(() => {});
      console.error('Metrics refresh failed:', job.platform, error.message);
    }
  }
  return { refreshed };
}

// --- Command Center summary ---

// clientId narrows everything to one client (the Command Center's client picker).
// Time frames Analytics can show. Each is compared with the same length of time before it.
const OVERVIEW_RANGES = [7, 14, 30, 60, 90, 365];

// Reads every row of a query, a page at a time (the database returns at most 1,000 rows per request).
async function allRows(path, { pageSize = 1000, maxRows = 20000 } = {}) {
  const rows = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const page = await databaseRequest(`${path}&limit=${pageSize}&offset=${offset}`) || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function overviewData(workspaceId, timeZone, clientId = null, rangeDays = 30) {
  const { finishMetrics } = require('./reports');
  const { zonedParts } = require('./core');
  const now = Date.now();
  const range = OVERVIEW_RANGES.includes(rangeDays) ? rangeDays : 30;
  const rangeStart = now - range * 86400000;
  const windowStart = now - 2 * range * 86400000;
  const forClient = clientId ? `&client_id=eq.${encodeURIComponent(clientId)}` : '';
  const [reports, jobs, connections, lastRun] = await Promise.all([
    databaseRequest(`weekly_reports?workspace_id=eq.${workspaceId}${forClient}&week_start=gte.${new Date(windowStart - 7 * 86400000).toISOString().slice(0, 10)}&select=client_id,data`),
    allRows(`publish_jobs?workspace_id=eq.${workspaceId}${forClient}&status=eq.published&published_at=gte.${new Date(windowStart).toISOString()}&select=id,client_id,platform,published_at,metrics&order=published_at.desc`),
    listConnections(workspaceId, clientId),
    lastWorkerRun('publish'),
  ]);
  const clicks = await linkClickSummary(workspaceId, clientId, range).catch((error) => { console.error('Link clicks unavailable:', error.message); return null; });
  // Posts from every source (read from the networks by the account sync); SignalDesk's own posts are linked by job.
  const networkPosts = await allRows(`network_posts?workspace_id=eq.${workspaceId}${forClient}&published_at=gte.${new Date(windowStart).toISOString()}&select=id,client_id,platform,published_at,job_id,metrics&order=published_at.desc`).catch(() => []) || [];
  const { audienceSummary } = require('./sync');
  const audience = await audienceSummary(workspaceId, clientId, range).catch(() => []);
  const rows = new Map();
  for (const report of reports || []) {
    for (const row of report.data?.rows || []) if (row.publishedAt && row.metrics) rows.set(row.id, { clientId: report.client_id, platform: row.platform, at: Date.parse(row.publishedAt), engagements: row.metrics.engagements, audience: row.metrics.reach || row.metrics.views || null });
  }
  for (const job of jobs || []) {
    const id = `job:${job.id}`;
    if (!rows.has(id) && job.metrics) {
      const metrics = finishMetrics(job.metrics);
      rows.set(id, { clientId: job.client_id, platform: job.platform, at: Date.parse(job.published_at), engagements: metrics.engagements, audience: metrics.reach || metrics.views || null });
    }
  }
  for (const post of networkPosts) {
    const metrics = post.metrics || {};
    if (typeof metrics.engagements !== 'number') continue;
    rows.set(post.job_id ? `job:${post.job_id}` : `net:${post.id}`, { clientId: post.client_id, platform: post.platform, at: Date.parse(post.published_at), engagements: metrics.engagements, audience: metrics.reach || metrics.views || null });
  }
  const recentNetwork = networkPosts.filter((post) => Date.parse(post.published_at) >= rangeStart);
  const published = { total: recentNetwork.length, viaSignalDesk: recentNetwork.filter((post) => post.job_id).length, clients: new Set(recentNetwork.map((post) => post.client_id)).size, synced: networkPosts.length > 0 };
  const dayKey = (time) => { const parts = zonedParts(new Date(time), timeZone); return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`; };
  // Daily points up to 90 days; a year is shown week by week (each point is the week starting that day).
  const step = range > 90 ? 7 : 1;
  const points = Math.ceil(range / step);
  const days = Array.from({ length: points }, (_, index) => dayKey(now - ((points - 1 - index) * step + step - 1) * 86400000));
  const daily = Object.fromEntries(days.map((day) => [day, 0]));
  const bucketFor = (time) => days[Math.min(points - 1, Math.max(0, points - 1 - Math.floor((now - time) / (step * 86400000))))];
  const byPlatform = {};
  // Per client, for goals: engagement rate counts only posts that report an audience.
  const byClient = {};
  let total = 0, previous = 0, measured = 0, reach = 0, rated = 0;
  const previousDaily = Array(points).fill(0);
  for (const row of rows.values()) {
    if (typeof row.engagements !== 'number') continue;
    if (row.at >= rangeStart) {
      total += row.engagements;
      measured += 1;
      byPlatform[row.platform] = (byPlatform[row.platform] || 0) + row.engagements;
      const entry = byClient[row.clientId] ||= { engagements: 0, audience: 0, posts: 0 };
      entry.posts += 1;
      if (row.audience) { entry.engagements += row.engagements; entry.audience += row.audience; reach += row.audience; rated += row.engagements; }
      const key = step === 1 ? dayKey(row.at) : bucketFor(row.at);
      if (key in daily) daily[key] += row.engagements;
    } else if (row.at >= windowStart) {
      previous += row.engagements;
      // The same point one time frame earlier, so the chart can show both.
      const index = points - 1 - Math.floor((rangeStart - row.at) / (step * 86400000));
      if (index >= 0 && index < points) previousDaily[index] += row.engagements;
    }
  }
  return {
    clientId, clicks, audience, published, range, step,
    engagement: { total, previous, measured, reach, rate: reach ? Math.round(rated / reach * 10000) / 100 : null, daily: days.map((day, index) => ({ day, engagements: daily[day], previous: previousDaily[index] })), byPlatform },
    clients: Object.fromEntries(Object.entries(byClient).map(([id, entry]) => [id, { posts: entry.posts, engagementRate: entry.audience ? Math.round(entry.engagements / entry.audience * 10000) / 100 : null }])),
    connections: {
      active: connections.filter((item) => item.status === 'active').length,
      reauth: connections.filter((item) => item.status === 'needs_reauth').map((item) => ({ platform: item.platform, clientId: item.client_id })),
      platforms: [...new Set(connections.filter((item) => item.status === 'active').map((item) => item.platform))],
      clients: new Set(connections.map((item) => item.client_id)).size
    },
    worker: { lastRun, stale: !lastRun || now - Date.parse(lastRun) > WORKER_STALE_MS }
  };
}

// Copies posts a number of days later (for example, a whole week to the next week), keeping each
// post's local time of day. Posts that were waiting for approval stay that way; the rest are scheduled.
async function copyPosts(workspaceId, { postIds, offsetDays, userId, timeZone = 'America/New_York', encryptionKey, actorName = null }) {
  const { zonedParts, zonedToUtc } = require('./core');
  const created = [], skipped = [];
  for (const id of postIds) {
    const original = await getPost(workspaceId, id).catch(() => null);
    if (!original || original.status === 'canceled') { skipped.push({ id, reason: 'not found or canceled' }); continue; }
    const jobs = (original.publish_jobs || []).filter((job) => job.status !== 'canceled');
    const platforms = [...new Set(jobs.filter((job) => job.provider !== 'manual').map((job) => job.platform))];
    const manual = [...new Set(jobs.filter((job) => job.provider === 'manual').map((job) => job.platform))];
    const parts = zonedParts(new Date(original.scheduled_for), timeZone);
    const day = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offsetDays));
    const at = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), parts.hour, parts.minute, timeZone);
    if (at < Date.now() + 5 * 60000) { skipped.push({ id, reason: 'the new time has already passed' }); continue; }
    const { reposts, repostOf, ...options } = original.options || {};
    const content = original.content || {};
    try {
      const post = await createScheduledPost({
        workspaceId, clientId: original.client_id, userId, title: original.title, platforms, manual, text: content.text || '', mediaUrls: content.media || [],
        platformContent: content.platformContent || {}, mediaAlt: content.mediaAlt || {}, options, scheduledFor: at, held: original.status === 'pending_approval',
        campaign: original.campaign || null, encryptionKey, timeZone, actorName
      });
      created.push({ id: post.id, from: id, scheduledFor: new Date(at).toISOString() });
    } catch (error) {
      skipped.push({ id, reason: error.message });
    }
  }
  return { created, skipped };
}

// --- Posting queues and evergreen posts ---

// A client's queue: posting days (0 = Sunday) and times, plus how long evergreen posts rest.
function queueConfig(client) {
  const queue = client?.queue;
  if (!queue || typeof queue !== 'object') return null;
  const days = [...new Set(Array.isArray(queue.days) ? queue.days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : [])];
  const times = [...new Set(Array.isArray(queue.times) ? queue.times.filter((time) => typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) : [])].sort();
  const recycleDays = Math.min(365, Math.max(7, parseInt(queue.recycleDays, 10) || 30));
  return days.length && times.length ? { days, times, recycleDays } : { days: [], times: [], recycleDays };
}

function nextSlot(queue, timeZone, taken, fromMs) {
  const { zonedParts, zonedToUtc } = require('./core');
  const start = zonedParts(new Date(fromMs), timeZone);
  for (let offset = 0; offset < 90; offset += 1) {
    const day = new Date(Date.UTC(start.year, start.month - 1, start.day + offset));
    if (!queue.days.includes(day.getUTCDay())) continue;
    for (const time of queue.times) {
      const [hour, minute] = time.split(':').map(Number);
      const at = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hour, minute, timeZone);
      if (at >= fromMs && !taken.has(at)) return at;
    }
  }
  return null;
}

async function takenSlots(workspaceId, clientId, fromMs) {
  const rows = await databaseRequest(`scheduled_posts?workspace_id=eq.${workspaceId}&client_id=eq.${encodeURIComponent(clientId)}&status=in.(pending_approval,scheduled,publishing)&scheduled_for=gte.${new Date(fromMs).toISOString()}&select=scheduled_for&limit=1000`) || [];
  return new Set(rows.map((row) => Date.parse(row.scheduled_for)));
}

// The next open queue slot for a client, at least 10 minutes from now.
async function nextQueueSlot(workspaceId, client, timeZone, fromMs = Date.now() + 10 * 60000) {
  const queue = queueConfig(client);
  if (!queue?.days.length) throw httpError(400, `Set up a posting queue for ${client?.name || 'this client'} in its brand kit first.`);
  const slot = nextSlot(queue, timeZone, await takenSlots(workspaceId, client.id, fromMs), fromMs);
  if (!slot) throw httpError(400, 'The queue has no open slots in the next 90 days.');
  return slot;
}

// Puts published evergreen posts back in their client's queue after a rest period.
async function recycleEvergreen({ encryptionKey, limit = 10 } = {}) {
  const rows = await databaseRequest(`scheduled_posts?evergreen=eq.true&status=eq.published&recycled_at=is.null&select=*,publish_jobs(platform,status)&limit=${limit}`) || [];
  let recycled = 0;
  for (const post of rows) {
    await databaseRequest(`scheduled_posts?id=eq.${post.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ recycled_at: nowIso() }) });
    try {
      const state = await getWorkspaceState(post.workspace_id);
      const client = (state.clients || []).find((item) => item.id === post.client_id);
      if (!client) continue;
      const { WORKSPACE_TIMEZONES } = require('./core');
      const timeZone = WORKSPACE_TIMEZONES[state.settings?.timezone] || 'America/New_York';
      const queue = queueConfig(client) || { days: [], times: [], recycleDays: 30 };
      const from = Math.max(Date.now() + 10 * 60000, Date.parse(post.scheduled_for) + queue.recycleDays * 86400000);
      let at = queue.days.length ? nextSlot(queue, timeZone, await takenSlots(post.workspace_id, post.client_id, from), from) : null;
      if (!at) at = from;
      const { followUpComments, reposts, repostOf, ...options } = post.options || {}; // eslint-disable-line no-unused-vars
      const platforms = [...new Set(post.publish_jobs.filter((job) => job.status === 'published').map((job) => job.platform))];
      if (!platforms.length) continue;
      await createScheduledPost({
        workspaceId: post.workspace_id, clientId: post.client_id, userId: post.created_by, title: post.title, platforms,
        text: post.content?.text || '', mediaUrls: post.content?.media || [], platformContent: post.content?.platformContent || {},
        options, scheduledFor: at, source: post.source, campaign: post.campaign, evergreen: true, encryptionKey
      });
      recycled += 1;
    } catch (error) {
      console.error('Evergreen recycle failed:', post.id, error.message);
    }
  }
  return { recycled };
}

// --- Comments on published posts ---

async function publishedDirectJob(workspaceId, jobId, encryptionKey) {
  if (typeof jobId !== 'string' || !/^[0-9a-f-]{36}$/i.test(jobId)) throw httpError(400, 'Choose a published post.');
  const job = (await databaseRequest(`publish_jobs?workspace_id=eq.${workspaceId}&id=eq.${jobId}&select=*`))?.[0];
  if (!job) throw httpError(404, 'Post not found.');
  if (job.status !== 'published' || job.provider !== 'direct' || !COMMENTABLE.has(job.platform)) throw httpError(400, 'Comments are available for posts SignalDesk published directly to Facebook, Instagram, or LinkedIn.');
  let connection = await loadConnection(job.connection_id, encryptionKey);
  if (!connection || connection.status !== 'active') throw httpError(400, `Reconnect ${label(job.platform)} to see its comments.`);
  connection = await ensureFreshToken(connection, encryptionKey);
  return { job, connection, adapter: adapterFor(job.platform) };
}

async function listJobComments(workspaceId, jobId, encryptionKey) {
  const { job, connection, adapter } = await publishedDirectJob(workspaceId, jobId, encryptionKey);
  try {
    return await adapter.listComments({ connection, job });
  } catch (error) {
    throw httpError(error.kind === 'auth' ? 400 : 502, error.message);
  }
}

async function replyToComment(workspaceId, jobId, commentId, text, encryptionKey) {
  if (typeof commentId !== 'string' || !commentId || commentId.length > 300) throw httpError(400, 'Choose a comment to reply to.');
  const { job, connection, adapter } = await publishedDirectJob(workspaceId, jobId, encryptionKey);
  try {
    return await adapter.reply({ connection, job, commentId, text });
  } catch (error) {
    throw httpError(error.kind === 'auth' ? 400 : 502, error.message);
  }
}

// --- Notes and client comments on a post ---

async function listNotes(workspaceId, postId, { clientOnly = false } = {}) {
  const query = new URLSearchParams({ select: 'id,post_id,author_name,author_kind,body,decision,created_at', workspace_id: `eq.${workspaceId}`, order: 'created_at.asc', limit: '200' });
  query.set('post_id', Array.isArray(postId) ? `in.(${postId.join(',')})` : `eq.${postId}`);
  if (clientOnly) query.set('author_kind', 'eq.client');
  return (await databaseRequest(`post_notes?${query}`) || []).map((note) => ({
    id: note.id, postId: note.post_id, author: note.author_name, kind: note.author_kind, body: note.body, decision: note.decision, at: note.created_at
  }));
}

async function addNote({ workspaceId, postId, authorId = null, authorName, kind, body, decision = null }) {
  const [note] = await databaseRequest('post_notes', {
    method: 'POST', headers: { prefer: 'return=representation' },
    body: JSON.stringify({ workspace_id: workspaceId, post_id: postId, author_id: authorId, author_name: authorName.slice(0, 80), author_kind: kind, body: body.slice(0, 2000), decision })
  });
  return note;
}

// --- Editing a scheduled post ---

const EDIT_LEAD_MS = 2 * 60000;

function assertEditable(post, { userId, admin }) {
  if (!admin && !(post.created_by === userId && post.status === 'pending_approval')) throw httpError(403, 'Only admins can edit scheduled posts.');
  if (post.parent_id) throw httpError(409, 'This is a repost. Edit the original post and its reposts follow.');
  if (!['pending_approval', 'scheduled'].includes(post.status) || post.publish_jobs.some((job) => ['publishing', 'published'].includes(job.status))) {
    throw httpError(409, 'Posts that have started publishing can’t be edited.');
  }
  if (post.status === 'scheduled' && Date.parse(post.scheduled_for) < Date.now() + EDIT_LEAD_MS) {
    throw httpError(409, 'This post is about to publish, so it can’t be edited now.');
  }
}

// Swaps an edited post in for the original. The new post is created first; the original is
// removed only if none of its networks started publishing in the meantime.
async function replacePost(workspaceId, original, replacementId, editorName = null) {
  const ids = await familyIds(workspaceId, original);
  const started = await databaseRequest(`publish_jobs?post_id=in.(${ids.join(',')})&status=in.(publishing,published)&select=id`) || [];
  if (started.length) {
    await databaseRequest(`scheduled_posts?id=eq.${replacementId}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } });
    throw httpError(409, 'The original started publishing while you were editing, so your changes weren’t saved.');
  }
  // The conversation and history stay with the post; the client's decision doesn't, since the content changed.
  await databaseRequest(`post_notes?post_id=in.(${ids.join(',')})`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ post_id: replacementId }) });
  // Drop the new post's own "created" entry first; the original's history carries over instead.
  await databaseRequest(`post_history?post_id=eq.${replacementId}&action=eq.created`, { method: 'DELETE', headers: { prefer: 'return=minimal' } });
  await databaseRequest(`post_history?post_id=eq.${original.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ post_id: replacementId }) });
  await addHistory(workspaceId, replacementId, 'edited', {
    actorName: editorName,
    detail: {
      previous: {
        title: original.title, text: original.content?.text || '', media: original.content?.media || [], platformContent: original.content?.platformContent || {},
        mediaAlt: original.content?.mediaAlt || {}, networks: original.publish_jobs.filter((job) => job.status !== 'canceled').map((job) => job.platform),
        scheduledFor: original.scheduled_for, campaign: original.campaign || '', options: original.options || {}
      }
    }
  });
  if (original.source === 'autopilot') {
    await databaseRequest(`autopilot_items?post_id=eq.${original.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ post_id: replacementId }) });
    await databaseRequest(`scheduled_posts?id=eq.${replacementId}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ source: 'autopilot' }) });
  }
  await databaseRequest(`scheduled_posts?id=in.(${ids.join(',')})`, { method: 'DELETE', headers: { prefer: 'return=minimal' } });
}

module.exports = {
  ensureFreshToken, PLATFORM_LABELS, listConnections, loadConnection, saveConnection, markNeedsReauth, resolveDestinations, createScheduledPost,
  processPublishQueue, runJob, maintainConnections, postJobComment, listPosts, getPost, approvePost, rejectPost, cancelPost,
  reschedulePost, retryJob, publicPost, directPostRows, contentFor, recordWorkerRun, lastWorkerRun, checkWorkerHealth,
  refreshRecentMetrics, overviewData, linkClickSummary, shortLinkBase, assertEditable, replacePost, queueConfig, nextQueueSlot, recycleEvergreen, listNotes, addNote, listJobComments, replyToComment, tagLinks, MANUAL_PLATFORMS, addHistory, listHistory, markManualDone, OVERVIEW_RANGES, allRows, copyPosts };
