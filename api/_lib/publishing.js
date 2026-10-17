const crypto = require('node:crypto');
const {
  httpError, databaseRequest, ayrshareRequest, ayrshareConfigured, getProfile, getWorkspaceState,
  encryptSecret, decryptSecret, buildPostBody, COMMENT_PLATFORMS
} = require('./core');
const { DIRECT_PLATFORMS, COMMENTABLE, PublishError, providerConfigured, adapterFor } = require('./platforms');

// SignalDesk's own publishing queue. A scheduled post has one job per network; the worker
// claims due jobs, publishes them directly (or through Ayrshare for other networks), and
// records the result. Jobs are retried only when it is safe to do so.

const MAX_ATTEMPTS = 6;
const RETRY_MINUTES = [1, 5, 15, 30, 60];
const REFRESH_WINDOW_MS = 7 * 86400000;
const PLATFORM_LABELS = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', pinterest: 'Pinterest' };
const CONNECTION_FIELDS = 'id,workspace_id,client_id,platform,external_id,display_name,username,profile_url,image_url,status,token_expires_at,refresh_expires_at,meta,last_error,expiry_notified_at,updated_at';

function label(platform) {
  return PLATFORM_LABELS[platform] || platform;
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
    const connection = DIRECT_PLATFORMS[platform] ? connections.find((item) => item.platform === platform) : null;
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
  return {
    text: typeof override.text === 'string' ? override.text : post.content?.text || '',
    media: Array.isArray(override.media) ? override.media : post.content?.media || []
  };
}

function commentableFor(provider, platform) {
  return provider === 'direct' ? COMMENTABLE.has(platform) : COMMENT_PLATFORMS.has(platform);
}

async function createScheduledPost({
  workspaceId, clientId, userId, title, platforms, text, mediaUrls = [], platformContent = {}, options = {},
  scheduledFor, held = false, source = 'composer', encryptionKey
}) {
  const destinations = await resolveDestinations(workspaceId, clientId, platforms, encryptionKey);
  const { followUpComments = [], autoRepost, ...stored } = options;
  const content = { text, media: mediaUrls, platformContent };
  const base = scheduledFor;
  const occurrences = [{ id: crypto.randomUUID(), at: base, parent: null }];
  if (autoRepost) {
    for (let index = 1; index <= autoRepost.repeat; index += 1) {
      occurrences.push({ id: crypto.randomUUID(), at: base + index * autoRepost.days * 86400000, parent: occurrences[0].id });
    }
  }
  const posts = occurrences.map((item, index) => ({
    id: item.id, workspace_id: workspaceId, client_id: clientId, created_by: userId, source,
    title: (title || '').slice(0, 200), scheduled_for: new Date(item.at).toISOString(),
    status: held ? 'pending_approval' : 'scheduled', content,
    // Reposts carry the same copy but not the comments.
    options: index === 0 ? { ...stored, followUpComments, reposts: autoRepost || null } : { ...stored, firstComment: undefined, repostOf: occurrences[0].id },
    parent_id: item.parent
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
    const content = contentFor(post, job.platform);
    const markSent = () => patchJob({ sent_at: nowIso() });
    const saveStage = async (patch) => { stage = { ...stage, ...patch }; await patchJob({ stage }); };
    let outcome;
    if (job.provider === 'ayrshare') {
      outcome = await publishViaAyrshare({ job, post, content, markSent, encryptionKey });
    } else {
      let connection = await loadConnection(job.connection_id, encryptionKey);
      if (!connection) throw new PublishError('auth', `The ${label(job.platform)} account was disconnected. Reconnect it, then retry.`);
      if (connection.status === 'needs_reauth') throw new PublishError('auth', connection.last_error || `Reconnect ${label(job.platform)} in Social Accounts, then retry.`);
      if (!providerConfigured(DIRECT_PLATFORMS[job.platform])) throw new PublishError('invalid', `${label(job.platform)} publishing isn't configured on the server.`);
      connection = await ensureFreshToken(connection, encryptionKey);
      outcome = await adapterFor(job.platform).publish({ connection, job, content, options: post.options || {}, stage, saveStage, markSent });
    }
    if (outcome.pending) {
      // Media is still processing; check again soon without using up an attempt.
      await patchJob({ status: 'queued', attempts: Math.max(0, job.attempts - 1), run_at: new Date(Date.now() + (outcome.retryInSeconds || 60) * 1000).toISOString(), ...unlock });
      return 'pending';
    }
    await patchJob({ status: 'published', external_id: outcome.externalId || null, external_url: outcome.url || null, published_at: nowIso(), last_error: null, error_kind: null, ...unlock });
    await record('published');
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
    return retry ? 'retrying' : 'failed';
  }
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
  const results = { claimed: jobs.length, published: 0, retrying: 0, failed: 0, pending: 0, canceled: 0, released: 0 };
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

const JOB_FIELDS = 'id,platform,provider,status,attempts,run_at,external_url,last_error,error_kind,published_at';

function publicPost(row) {
  return {
    id: row.id, clientId: row.client_id, title: row.title, status: row.status, source: row.source,
    scheduledFor: row.scheduled_for, createdBy: row.created_by, parentId: row.parent_id,
    approvedAt: row.approved_at, decisionNote: row.decision_note,
    text: row.content?.text || '', media: row.content?.media || [], platformContent: row.content?.platformContent || {},
    options: row.options || {},
    jobs: (row.publish_jobs || []).map((job) => ({
      id: job.id, platform: job.platform, provider: job.provider, status: job.status, attempts: job.attempts,
      runAt: job.run_at, url: job.external_url, error: job.last_error, errorKind: job.error_kind, publishedAt: job.published_at
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
  return [...(inRange || []), ...(waiting || [])].filter((row) => !seen.has(row.id) && seen.add(row.id)).map(publicPost);
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
    select: 'id,platform,external_id,external_url,published_at,connection_id,metrics,metrics_at,scheduled_posts(title,content)',
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
      id: `job:${job.id}`, providerPostId: job.id, platform: job.platform, text: content.text.slice(0, 500), url: job.external_url || '',
      media: content.media[0] || null, publishedAt: job.published_at, raw: metrics || {}, hasData: Boolean(metrics && Object.values(metrics).some((value) => value !== null))
    });
  }
  return { rows, errors };
}

module.exports = {
  PLATFORM_LABELS, listConnections, loadConnection, saveConnection, markNeedsReauth, resolveDestinations, createScheduledPost,
  processPublishQueue, runJob, maintainConnections, postJobComment, listPosts, getPost, approvePost, rejectPost, cancelPost,
  reschedulePost, retryJob, publicPost, directPostRows, contentFor
};
