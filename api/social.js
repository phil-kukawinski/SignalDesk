const crypto = require('node:crypto');
const { APIError } = require('@anthropic-ai/sdk');
const {
  PLATFORM_KEYS, MESSAGE_PLATFORMS, MEDIA_REQUIRED_PLATFORMS, COMMENT_PLATFORMS,
  httpError, send, getConfig, ayrshareConfigured, getUser, databaseRequest, ayrshareRequest,
  getMembership, getWorkspaceState, assertClientInWorkspace,
  getProfile, getOrCreateProfile, requirePlatforms, decryptSecret,
  validatePostOptions, processDueComments,
  readFeed, baselineFeed, runFeed, runAutopilot, WORKSPACE_TIMEZONES
} = require('./_lib/core');
const { DIRECT_PLATFORMS, PROVIDERS, providerConfigured, lookupInstagramAccount } = require('./_lib/platforms');
const {
  PLATFORM_LABELS, listConnections, loadConnection, saveConnection, createScheduledPost, listPosts, getPost, approvePost, rejectPost,
  cancelPost, reschedulePost, retryJob, overviewData, checkWorkerHealth, assertEditable, replacePost,
  nextQueueSlot, listNotes, addNote, listJobComments, replyToComment, MANUAL_PLATFORMS, addHistory, listHistory, markManualDone
} = require('./_lib/publishing');
const { draftCaptions, describeImage } = require('./_lib/captions');
const { pushConfigured } = require('./_lib/push');
const { reportTotals } = require('./_lib/reports');
const { notify, emailConfigured } = require('./_lib/notify');
const { buildTopPostsReport, weekRange, saveWeeklyReport } = require('./_lib/reports');
const { TREND_PLATFORMS, generateTrendReport } = require('./_lib/trends');
const { proofreadTexts } = require('./_lib/proofread');
const { systemStatus } = require('./_lib/health');
const { isPlatformAdmin, inviteOnly, setInviteOnly, listInvites, createInvite, revokeInvite, recordAppError, recentErrors } = require('./_lib/platform');
const { deletionPlan, deleteAccount } = require('./_lib/account');
const { brandFromSite } = require('./_lib/brandsite');
const { listNetworkPosts, syncClient } = require('./_lib/sync');
const { searchPhotos, usePhoto, stockConfigured } = require('./_lib/stock');
const { checkLink, fetchLinkPreview } = require('./_lib/core');

const CLIENT_ACTIONS = new Set([
  'connect', 'accounts', 'publish', 'update-post', 'analytics', 'comments', 'post-comment', 'messages', 'reply',
  'oauth-start', 'disconnect', 'ig-lookup'
]);
// Actions that go through Ayrshare and need its per-client profile.
const AYRSHARE_ACTIONS = new Set(['connect', 'analytics', 'comments', 'post-comment', 'messages', 'reply']);
const WORKSPACE_ACTIONS = new Set([
  'members', 'invite', 'update-member', 'remove-member', 'remove-invite',
  'autopilot', 'feed-preview', 'feed-save', 'feed-delete', 'autopilot-run',
  'notification-settings', 'top-posts', 'trends', 'trends-refresh', 'check-links', 'proofread', 'best-times',
  'posts', 'approve', 'reject', 'cancel-post', 'reschedule-post', 'retry-job', 'oauth-session', 'oauth-finish', 'overview',
  'post-notes', 'add-note', 'review-links', 'create-review-link', 'revoke-review-link', 'client-report', 'job-comments', 'reply-comment', 'next-slot',
  'post-history', 'manual-done', 'draft-captions', 'alt-text', 'save-bio', 'push-config', 'push-subscribe', 'push-unsubscribe', 'export',
  'system-status', 'stock-search', 'stock-use', 'link-preview',
  'platform-status', 'create-invite', 'revoke-invite', 'set-invite-only', 'brand-from-site', 'network-posts', 'sync-now'
]);
// Users may load accounts, submit and view posts, withdraw their own pending posts, and use
// trends and checks; everything else is reserved for admins.
const USER_ACTIONS = new Set([
  'accounts', 'publish', 'update-post', 'posts', 'overview', 'cancel-post', 'notification-settings', 'trends', 'trends-refresh', 'check-links', 'proofread',
  'post-notes', 'add-note', 'next-slot', 'post-history', 'manual-done', 'draft-captions', 'alt-text', 'push-config', 'push-subscribe', 'push-unsubscribe',
  'stock-search', 'stock-use', 'ig-lookup', 'link-preview', 'network-posts'
]);
const ACCOUNT_ACTIONS = new Set(['account-plan', 'delete-account']);
const PUSH_HOSTS = /^https:\/\/[\w.-]+(:\d+)?\//;
const AI_DAILY_LIMIT = 200;
// Beta limits per workspace, so one account can't run up costs or flood the networks.
const DAILY_POST_LIMIT = 150;
const TEAM_LIMIT = 25;
const REVIEW_LINK_DAYS = { min: 1, max: 90, default: 30 };
const OAUTH_SESSION_MINUTES = 15;
const TREND_CACHE_HOURS = 6;
const TREND_DAILY_LIMIT = 12;
const ROLES = new Set(['admin', 'user']);

function allowedOrigin(req) {
  const origin = req.headers.origin;
  const allowlist = (process.env.APP_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!origin || !allowlist.includes(origin)) {
    throw httpError(403, 'This site origin is not configured for social account linking.');
  }
  return origin;
}

function integrations() {
  return {
    meta: providerConfigured('meta'), linkedin: providerConfigured('linkedin'), linkedinPages: providerConfigured('linkedin_pages'), pinterest: providerConfigured('pinterest'),
    ayrshare: ayrshareConfigured(), stock: stockConfigured()
  };
}

// Direct connections win; Ayrshare covers the other networks when it is configured.
function publicAccounts({ connections = [], ayrshare = null }) {
  const active = new Set(ayrshare?.activeSocialAccounts || []);
  const details = new Map((ayrshare?.displayNames || []).map((item) => [item.platform, item]));
  const ayrshareReady = ayrshareConfigured();
  return [...PLATFORM_KEYS].map((platform) => {
    const directAvailable = Boolean(DIRECT_PLATFORMS[platform] && providerConfigured(DIRECT_PLATFORMS[platform]));
    const ayrshareAvailable = ayrshareReady && (platform !== 'twitter' || Boolean(process.env.X_TWITTER_OAUTH1_API_KEY && process.env.X_TWITTER_OAUTH1_API_SECRET));
    const direct = connections.find((item) => item.platform === platform);
    if (direct) {
      return {
        platform, linked: direct.status === 'active', provider: 'direct', status: direct.status, directAvailable, ayrshareAvailable,
        available: true, username: direct.username || '', displayName: direct.display_name || '', profileUrl: direct.profile_url || '',
        userImage: direct.image_url || '', error: direct.status === 'active' ? '' : direct.last_error || '',
        // Networks with refresh tokens renew on their own until the refresh token itself runs out.
        autoRenews: Boolean(direct.refresh_expires_at && Date.parse(direct.refresh_expires_at) > Date.now()),
        expiresAt: direct.refresh_expires_at && Date.parse(direct.refresh_expires_at) > Date.now() ? direct.refresh_expires_at : direct.token_expires_at,
        ...(platform === 'pinterest' ? { boards: direct.meta?.boards || [], boardId: direct.meta?.boardId || '' } : {}),
        ...(platform === 'linkedin' ? { kind: direct.meta?.kind || 'member', app: direct.meta?.app || 'profile' } : {})
      };
    }
    const linked = active.has(platform);
    const detail = details.get(platform) || {};
    return {
      platform, linked, provider: linked ? 'ayrshare' : null, status: linked ? 'active' : 'disconnected', directAvailable, ayrshareAvailable,
      available: directAvailable || ayrshareAvailable,
      username: detail.username || '',
      displayName: detail.displayName || detail.pageName || detail.channelTitle || '',
      profileUrl: detail.profileUrl || '',
      userImage: detail.userImage || ''
    };
  });
}

function validUuid(value) {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
}

async function clientName(workspaceId, clientId) {
  return ((await getWorkspaceState(workspaceId)).clients || []).find((item) => item.id === clientId)?.name || 'a client';
}

// Errors from the AI service carry an HTTP status too, but their raw text isn't meant for people.
function aiErrorMessage(error) {
  if (error.status === 429 || error.status === 529 || error.status >= 500) return [503, 'The AI service is busy right now. Try again in a minute.'];
  if (error.status === 401 || error.status === 403) return [503, 'The AI key on the server isn’t working. Check ANTHROPIC_API_KEY in Vercel.'];
  return [502, 'The AI couldn’t handle this request. Try different wording or another image.'];
}

function providerResponseError(error, res, action = '') {
  if (error instanceof APIError) {
    console.error('AI request failed:', error.status, error.message);
    const [status, message] = aiErrorMessage(error);
    return send(res, status, { error: message });
  }
  if (error.status) return send(res, error.status, error.payload || { error: error.message });
  // Network problems (PublishError) carry a plain-language message meant for the person, not a crash.
  if (error.kind) return send(res, { auth: 401, rate_limit: 429, temporary: 503 }[error.kind] || 400, { error: error.message });
  console.error('Social integration request failed:', error.message);
  recordAppError(`api/social${action ? `:${action}` : ''}`, error);
  return send(res, 500, { error: 'Something went wrong on our side. It’s been logged; try again in a moment.' });
}

function normalizeEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) throw httpError(400, 'Enter a valid email address.');
  return email;
}

async function adminCount(workspaceId) {
  const rows = await databaseRequest(`workspace_members?${new URLSearchParams({ select: 'user_id', workspace_id: `eq.${workspaceId}`, role: 'eq.admin' })}`);
  return rows?.length || 0;
}

function validateFeedInput(input) {
  if (!input || typeof input !== 'object') throw httpError(400, 'Feed settings are missing.');
  requirePlatforms(input.platforms);
  if (input.platforms.includes('youtube')) throw httpError(400, 'YouTube needs a video, so it cannot be used with Autopilot.');
  const days = [...new Set(input.days)];
  if (!days.length || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw httpError(400, 'Choose at least one posting day.');
  const times = [...new Set(input.times)];
  if (!times.length || times.length > 8 || times.some((time) => typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
    throw httpError(400, 'Add one to eight posting times.');
  }
  const template = typeof input.template === 'string' ? input.template.trim() : '';
  if (!template || template.length > 2000) throw httpError(400, 'Add a post template up to 2,000 characters.');
  if (!['review', 'auto'].includes(input.mode)) throw httpError(400, 'Choose whether Autopilot posts need approval.');
  const keywords = (value) => (typeof value === 'string' ? value.slice(0, 500) : '');
  return {
    client_id: input.clientId,
    platforms: input.platforms,
    days,
    times,
    template,
    mode: input.mode,
    include_image: input.includeImage !== false,
    include_keywords: keywords(input.includeKeywords),
    exclude_keywords: keywords(input.excludeKeywords),
    enabled: input.enabled !== false,
    updated_at: new Date().toISOString()
  };
}

async function workspaceTimeZone(workspaceId) {
  const state = await getWorkspaceState(workspaceId);
  return WORKSPACE_TIMEZONES[state.settings?.timezone] || 'America/New_York';
}

async function trendFocus(workspaceId, body) {
  const clients = (await getWorkspaceState(workspaceId)).clients || [];
  if (body.focus === 'custom') {
    const custom = typeof body.customFocus === 'string' ? body.customFocus.trim() : '';
    if (!custom || custom.length > 200) throw httpError(400, 'Describe the niche in up to 200 characters.');
    return { key: `custom:${custom.toLowerCase()}`, label: custom, clients };
  }
  if (body.focus && body.focus !== 'all') {
    const client = clients.find((item) => item.id === body.focus);
    if (!client) throw httpError(404, 'Client not found in this workspace.');
    return { key: `client:${client.id}`, label: `${client.name} and brands like it`, clients: [client] };
  }
  return { key: 'all', label: 'Trends relevant to all of the clients below', clients };
}

async function handleWorkspaceAction(action, body, { user, membership, encryptionKey, origin = '' }, res) {
  const workspaceId = membership.workspace_id;
  const scope = `workspace_id=eq.${workspaceId}`;

  if (action === 'members') {
    const [members, invites] = await Promise.all([
      databaseRequest(`workspace_members?${scope}&select=user_id,email,role,created_at&order=created_at.asc`),
      databaseRequest(`workspace_invites?${scope}&select=email,role,created_at&order=created_at.asc`)
    ]);
    return send(res, 200, { members: members || [], invites: invites || [], currentUserId: user.id });
  }

  if (action === 'invite') {
    const email = normalizeEmail(body.email);
    const [members, pending] = await Promise.all([databaseRequest(`workspace_members?${scope}&select=user_id`), databaseRequest(`workspace_invites?${scope}&select=email`)]);
    if ((members?.length || 0) + (pending?.length || 0) >= TEAM_LIMIT) return send(res, 409, { error: `Workspaces can have up to ${TEAM_LIMIT} people during the beta. Remove someone or cancel an invite first.` });
    if (!ROLES.has(body.role)) return send(res, 400, { error: 'Choose Admin or User.' });
    const existing = await databaseRequest(`workspace_members?${new URLSearchParams({ select: 'workspace_id', email: `eq.${email}`, limit: '1' })}`);
    if (existing?.length) {
      return send(res, 409, { error: existing[0].workspace_id === workspaceId ? 'That person is already a member.' : 'That email already belongs to another SignalDesk workspace.' });
    }
    await databaseRequest('workspace_invites?on_conflict=workspace_id,email', {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ workspace_id: workspaceId, email, role: body.role, invited_by: user.id })
    });
    return send(res, 200, { invited: email });
  }

  if (action === 'update-member' || action === 'remove-member') {
    if (typeof body.userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.userId)) return send(res, 400, { error: 'Choose a team member.' });
    const target = `${scope}&user_id=eq.${body.userId}`;
    const rows = await databaseRequest(`workspace_members?${target}&select=role`);
    if (!rows?.length) return send(res, 404, { error: 'Team member not found.' });
    const demotingAdmin = rows[0].role === 'admin' && (action === 'remove-member' || body.role !== 'admin');
    if (demotingAdmin && await adminCount(workspaceId) <= 1) return send(res, 400, { error: 'A workspace needs at least one admin.' });
    if (action === 'update-member') {
      if (!ROLES.has(body.role)) return send(res, 400, { error: 'Choose Admin or User.' });
      await databaseRequest(`workspace_members?${target}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ role: body.role }) });
    } else {
      await databaseRequest(`workspace_members?${target}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } });
    }
    return send(res, 200, { ok: true });
  }

  if (action === 'remove-invite') {
    const email = normalizeEmail(body.email);
    await databaseRequest(`workspace_invites?${scope}&email=eq.${encodeURIComponent(email)}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } });
    return send(res, 200, { ok: true });
  }

  if (action === 'autopilot') {
    const since = new Date(Date.now() - 62 * 86400000).toISOString();
    const [feeds, items, comments] = await Promise.all([
      databaseRequest(`autopilot_feeds?${scope}&select=*&order=created_at.asc`),
      databaseRequest(`autopilot_items?${scope}&status=in.(scheduled,in_review,failed,skipped)&created_at=gte.${since}&select=id,feed_id,title,link,image_url,status,scheduled_for,provider_post_id,post_id,platforms,error&order=scheduled_for.asc.nullslast&limit=500`),
      databaseRequest(`scheduled_comments?${scope}&status=in.(pending,failed)&select=id,provider_post_id,comment,run_at,status,attempts,last_error&order=run_at.asc&limit=200`)
    ]);
    return send(res, 200, { feeds: feeds || [], items: items || [], comments: comments || [] });
  }

  if (action === 'feed-preview') {
    if (typeof body.url !== 'string' || body.url.length > 2000) return send(res, 400, { error: 'Enter a feed URL.' });
    const feed = await readFeed(body.url.trim());
    return send(res, 200, { title: feed.title, items: feed.items.slice(0, 5) });
  }

  if (action === 'feed-save') {
    const input = body.feed || {};
    await assertClientInWorkspace(workspaceId, input.clientId);
    const fields = validateFeedInput(input);
    if (input.id) {
      if (typeof input.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.id)) return send(res, 400, { error: 'Choose a feed.' });
      const rows = await databaseRequest(`autopilot_feeds?${scope}&id=eq.${input.id}`, {
        method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify(fields)
      });
      if (!rows?.length) return send(res, 404, { error: 'Feed not found.' });
      return send(res, 200, { feed: rows[0] });
    }
    if (typeof input.url !== 'string' || input.url.length > 2000) return send(res, 400, { error: 'Enter a feed URL.' });
    const url = input.url.trim();
    const parsed = await readFeed(url);
    const [feed] = await databaseRequest('autopilot_feeds', {
      method: 'POST', headers: { prefer: 'return=representation' },
      body: JSON.stringify({ ...fields, workspace_id: workspaceId, url, feed_title: parsed.title || null, created_by: user.id })
    });
    // Existing articles are marked as seen so connecting a feed does not flood the calendar.
    const newestFirst = [...parsed.items].sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
    await baselineFeed(feed, body.queueLatest ? newestFirst.slice(1) : newestFirst);
    const run = body.queueLatest && feed.enabled ? await runFeed(feed, { encryptionKey, timeZone: await workspaceTimeZone(workspaceId) }) : null;
    return send(res, 200, { feed, run });
  }

  if (action === 'feed-delete') {
    if (typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id)) return send(res, 400, { error: 'Choose a feed.' });
    await databaseRequest(`autopilot_feeds?${scope}&id=eq.${body.id}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } });
    return send(res, 200, { ok: true });
  }

  if (action === 'check-links') {
    const urls = Array.isArray(body.urls) ? [...new Set(body.urls.filter((url) => typeof url === 'string' && url.length <= 2000))] : [];
    if (!urls.length || urls.length > 20) return send(res, 400, { error: 'Send between 1 and 20 links to check.' });
    return send(res, 200, { results: await Promise.all(urls.map(checkLink)) });
  }

  if (action === 'proofread') {
    const texts = Array.isArray(body.texts) ? body.texts.filter((item) => item && typeof item.key === 'string' && /^[\w:-]{1,40}$/.test(item.key) && typeof item.text === 'string' && item.text.trim()) : [];
    if (!texts.length || texts.length > 20) return send(res, 400, { error: 'Add post copy to proofread.' });
    if (texts.reduce((sum, item) => sum + item.text.length, 0) > 30000) return send(res, 400, { error: 'This post is too long to proofread at once.' });
    const brand = typeof body.brand === 'string' ? body.brand.slice(0, 2000) : '';
    const issues = await proofreadTexts(texts.map((item) => ({ key: item.key, label: typeof item.label === 'string' ? item.label.slice(0, 60) : item.key, text: item.text })), brand);
    return send(res, 200, { issues });
  }

  if (action === 'best-times') {
    const since = new Date(Date.now() - 84 * 86400000).toISOString().slice(0, 10);
    const filter = typeof body.clientId === 'string' && body.clientId ? `&client_id=eq.${encodeURIComponent(body.clientId)}` : '';
    const reports = await databaseRequest(`weekly_reports?${scope}${filter}&week_start=gte.${since}&select=client_id,week_start,data`) || [];
    const seen = new Set();
    const points = [];
    for (const report of reports) {
      for (const row of report.data?.rows || []) {
        if (!row.publishedAt || seen.has(row.id)) continue;
        seen.add(row.id);
        points.push({ t: row.publishedAt, rate: row.metrics?.engagementRate ?? null, engagements: row.metrics?.engagements ?? null, platform: row.platform, clientId: report.client_id });
      }
    }
    return send(res, 200, { points, weeks: new Set(reports.map((report) => report.week_start)).size });
  }

  if (action === 'notification-settings') {
    return send(res, 200, { emailConfigured: emailConfigured(), role: membership.role });
  }

  if (action === 'top-posts') {
    await assertClientInWorkspace(workspaceId, body.clientId);
    const client = ((await getWorkspaceState(workspaceId)).clients || []).find((item) => item.id === body.clientId);
    const profile = ayrshareConfigured() ? await getProfile(workspaceId, body.clientId, encryptionKey) : null;
    const connections = await listConnections(workspaceId, body.clientId);
    if (!profile && !connections.length) return send(res, 400, { error: `Connect social accounts for ${client.name} to see Top Posts.` });
    const reportInput = { profile, workspaceId, encryptionKey, clientId: client.id, clientName: client.name };
    if (body.range === 'last7' || !body.range) {
      const end = Date.now();
      return send(res, 200, { report: await buildTopPostsReport({ ...reportInput, start: end - 7 * 86400000, end }), range: 'last7' });
    }
    if (typeof body.range !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.range)) return send(res, 400, { error: 'Choose a valid week.' });
    const stored = await databaseRequest(`weekly_reports?${scope}&client_id=eq.${encodeURIComponent(client.id)}&week_start=eq.${body.range}&select=data`);
    if (stored?.length && body.refresh !== true) return send(res, 200, { report: stored[0].data, range: body.range, stored: true });
    const { start, end } = weekRange(body.range, await workspaceTimeZone(workspaceId));
    if (start > Date.now()) return send(res, 400, { error: 'That week has not started yet.' });
    const report = await buildTopPostsReport({ ...reportInput, start, end });
    if (end < Date.now()) await saveWeeklyReport(workspaceId, client.id, body.range, report);
    return send(res, 200, { report, range: body.range, stored: end < Date.now() });
  }

  if (action === 'trends') {
    const [latest, recent] = await Promise.all([
      databaseRequest(`trend_reports?${scope}${typeof body.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id) ? `&id=eq.${body.id}` : ''}&select=id,focus,platforms,data,model,created_at&order=created_at.desc&limit=1`),
      databaseRequest(`trend_reports?${scope}&select=id,focus,platforms,created_at&order=created_at.desc&limit=8`)
    ]);
    return send(res, 200, { report: latest?.[0] || null, recent: recent || [], platforms: TREND_PLATFORMS });
  }

  if (action === 'trends-refresh') {
    const platforms = Array.isArray(body.platforms) ? [...new Set(body.platforms)].filter((platform) => TREND_PLATFORMS[platform]) : [];
    if (!platforms.length) return send(res, 400, { error: 'Choose at least one network.' });
    const focus = await trendFocus(workspaceId, body);
    const focusLabel = `${focus.key}|${[...platforms].sort().join(',')}`;
    const recent = await databaseRequest(`trend_reports?${scope}&created_at=gte.${new Date(Date.now() - 86400000).toISOString()}&select=id,focus,created_at,platforms,data,model&order=created_at.desc`) || [];
    const cached = recent.find((report) => `${report.focus}|${[...report.platforms].sort().join(',')}` === focusLabel && Date.parse(report.created_at) > Date.now() - TREND_CACHE_HOURS * 3600000);
    if (cached && !(body.force === true && membership.role === 'admin')) return send(res, 200, { report: cached, cached: true });
    if (recent.length >= TREND_DAILY_LIMIT) return send(res, 429, { error: `This workspace has used its ${TREND_DAILY_LIMIT} trend refreshes for today. Try again tomorrow.` });
    const today = new Intl.DateTimeFormat('en-US', { timeZone: await workspaceTimeZone(workspaceId), weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());
    const watchTerms = [...new Set(focus.clients.flatMap((item) => String(item.brand?.watchTerms || '').split(',').map((term) => term.trim()).filter(Boolean)))].slice(0, 12);
    const result = await generateTrendReport({ clients: focus.clients, focus: focus.label, platforms, today, watchTerms });
    const [report] = await databaseRequest('trend_reports', {
      method: 'POST', headers: { prefer: 'return=representation' },
      body: JSON.stringify({ workspace_id: workspaceId, focus: focus.key, platforms, data: { ...result.report, focusLabel: focus.label, sources: result.sources }, model: result.model, created_by: user.id })
    });
    return send(res, 200, { report, cached: false });
  }

  if (action === 'posts') {
    const from = Date.parse(body.from), to = Date.parse(body.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 101 * 86400000) return send(res, 400, { error: 'Choose a date range of up to 100 days.' });
    return send(res, 200, { posts: await listPosts(workspaceId, { from, to }), now: new Date().toISOString() });
  }

  if (action === 'post-history') {
    await getPost(workspaceId, body.postId);
    return send(res, 200, { history: await listHistory(workspaceId, body.postId) });
  }

  if (action === 'manual-done') {
    return send(res, 200, await markManualDone(workspaceId, body.jobId, { url: body.url, userId: user.id, admin: membership.role === 'admin', actorName: membership.email }));
  }

  if (action === 'draft-captions' || action === 'alt-text' || action === 'brand-from-site') {
    // A generous daily cap per workspace keeps an accidental loop from running up the AI bill.
    const today = new Date().toISOString().slice(0, 10);
    const counter = `ai-usage:${workspaceId}:${today}`;
    const used = (await databaseRequest(`worker_runs?name=eq.${encodeURIComponent(counter)}&select=last_result`))?.[0]?.last_result?.count || 0;
    if (used >= AI_DAILY_LIMIT) return send(res, 429, { error: 'This workspace has reached today’s limit for AI writing help. Try again tomorrow.' });
    await databaseRequest('worker_runs?on_conflict=name', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ name: counter, last_run_at: new Date().toISOString(), last_result: { count: used + 1 } }) });
    if (action === 'brand-from-site') {
      const client = ((await getWorkspaceState(workspaceId)).clients || []).find((item) => item.id === body.clientId);
      return send(res, 200, { brand: await brandFromSite({ url: body.url, clientName: client?.name || '' }) });
    }
    if (action === 'alt-text') {
      const url = typeof body.url === 'string' ? body.url.trim() : '';
      if (!/^https:\/\/\S+$/.test(url) || url.length > 2000) return send(res, 400, { error: 'Alt text needs an uploaded image.' });
      const context = typeof body.context === 'string' ? body.context.slice(0, 1500) : '';
      return send(res, 200, { altText: await describeImage({ url, context }) });
    }
    await assertClientInWorkspace(workspaceId, body.clientId);
    const idea = typeof body.idea === 'string' ? body.idea.trim() : '';
    if (!idea || idea.length > 3000) return send(res, 400, { error: 'Describe the post in up to 3,000 characters.' });
    const platforms = Array.isArray(body.platforms) ? [...new Set(body.platforms)].filter((platform) => PLATFORM_KEYS.has(platform)).slice(0, 8) : [];
    if (!platforms.length) return send(res, 400, { error: 'Choose at least one network.' });
    const brandClient = ((await getWorkspaceState(workspaceId)).clients || []).find((item) => item.id === body.clientId);
    return send(res, 200, { variants: await draftCaptions({ idea, brandClient, platforms }) });
  }

  if (action === 'save-bio') {
    await assertClientInWorkspace(workspaceId, body.clientId);
    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
    if (!/^[a-z0-9-]{3,40}$/.test(slug)) return send(res, 400, { error: 'Use 3–40 lowercase letters, numbers, or dashes for the page address.' });
    const taken = await databaseRequest(`bio_pages?slug=eq.${slug}&select=workspace_id,client_id`);
    if (taken?.length && (taken[0].workspace_id !== workspaceId || taken[0].client_id !== body.clientId)) return send(res, 409, { error: 'That address is taken. Try another.' });
    await databaseRequest(`bio_pages?workspace_id=eq.${workspaceId}&client_id=eq.${encodeURIComponent(body.clientId)}&slug=neq.${slug}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } });
    await databaseRequest('bio_pages?on_conflict=slug', {
      method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ slug, workspace_id: workspaceId, client_id: body.clientId, enabled: body.enabled !== false, updated_at: new Date().toISOString() })
    });
    return send(res, 200, { slug, enabled: body.enabled !== false });
  }

  if (['platform-status', 'create-invite', 'revoke-invite', 'set-invite-only'].includes(action)) {
    if (!isPlatformAdmin(user.email)) return send(res, 403, { error: 'Only SignalDesk platform owners can manage invites.' });
    if (action === 'create-invite') return send(res, 200, await createInvite({ label: body.label, maxUses: body.maxUses, days: body.days, email: body.email, createdBy: user.email }));
    if (action === 'revoke-invite') return send(res, 200, await revokeInvite(body.code));
    if (action === 'set-invite-only') return send(res, 200, { inviteOnly: await setInviteOnly(body.inviteOnly !== false) });
    const [only, invites, errors] = await Promise.all([inviteOnly(), listInvites(), recentErrors(24)]);
    return send(res, 200, { inviteOnly: only, invites, errors });
  }

  if (action === 'system-status') {
    const state = await getWorkspaceState(workspaceId);
    return send(res, 200, await systemStatus({ workspaceId, origin, clients: state.clients || [] }));
  }

  if (action === 'network-posts') {
    const from = Date.parse(body.from), to = Date.parse(body.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 101 * 86400000) return send(res, 400, { error: 'Choose a date range of up to 100 days.' });
    const platform = typeof body.platform === 'string' && /^[a-z]{2,20}$/.test(body.platform) ? body.platform : '';
    const clientId = typeof body.clientId === 'string' && body.clientId ? body.clientId : '';
    const [posts, connections] = await Promise.all([listNetworkPosts(workspaceId, { from, to, clientId, platform }), databaseRequest(`social_connections?${scope}&select=client_id,platform,synced_at,sync_error`)]);
    return send(res, 200, { posts, accounts: (connections || []).map((row) => ({ clientId: row.client_id, platform: row.platform, syncedAt: row.synced_at, note: row.sync_error })) });
  }

  if (action === 'sync-now') {
    await assertClientInWorkspace(workspaceId, body.clientId);
    const recent = await databaseRequest(`social_connections?${scope}&client_id=eq.${encodeURIComponent(body.clientId)}&synced_at=gte.${new Date(Date.now() - 10 * 60000).toISOString()}&select=id`) || [];
    if (recent.length) return send(res, 429, { error: 'These accounts synced in the last 10 minutes. Try again shortly.' });
    return send(res, 200, { results: await syncClient(workspaceId, body.clientId, { encryptionKey }) });
  }

  if (action === 'link-preview') {
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    if (!/^https?:\/\/\S+$/.test(url) || url.length > 2000) return send(res, 400, { error: 'Enter a full web address.' });
    return send(res, 200, { preview: await fetchLinkPreview(url) });
  }

  if (action === 'stock-search') return send(res, 200, await searchPhotos({ query: body.query, page: body.page, orientation: body.orientation }));
  if (action === 'stock-use') return send(res, 200, { photo: await usePhoto(body.id) });

  if (action === 'push-config') {
    return send(res, 200, { publicKey: pushConfigured() ? process.env.VAPID_PUBLIC_KEY : null });
  }

  if (action === 'push-subscribe') {
    const subscription = body.subscription || {};
    if (typeof subscription.endpoint !== 'string' || !PUSH_HOSTS.test(subscription.endpoint) || subscription.endpoint.length > 1000
      || typeof subscription.keys?.p256dh !== 'string' || typeof subscription.keys?.auth !== 'string') return send(res, 400, { error: 'That browser subscription isn’t valid.' });
    await databaseRequest('push_subscriptions?on_conflict=endpoint', {
      method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ endpoint: subscription.endpoint, user_id: user.id, workspace_id: workspaceId, p256dh: subscription.keys.p256dh.slice(0, 200), auth: subscription.keys.auth.slice(0, 100) })
    });
    return send(res, 200, { subscribed: true });
  }

  if (action === 'push-unsubscribe') {
    if (typeof body.endpoint !== 'string') return send(res, 400, { error: 'Missing subscription.' });
    await databaseRequest(`push_subscriptions?user_id=eq.${user.id}&endpoint=eq.${encodeURIComponent(body.endpoint)}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } });
    return send(res, 200, { unsubscribed: true });
  }

  if (action === 'export') {
    const scope = `workspace_id=eq.${workspaceId}`;
    const [state, posts, notes, history, connections, links, feeds, bios] = await Promise.all([
      getWorkspaceState(workspaceId),
      databaseRequest(`scheduled_posts?${scope}&select=*,publish_jobs(id,platform,provider,status,run_at,published_at,external_url,last_error)&order=scheduled_for.asc&limit=5000`),
      databaseRequest(`post_notes?${scope}&select=post_id,author_name,author_kind,body,decision,created_at&limit=10000`),
      databaseRequest(`post_history?${scope}&select=post_id,action,actor_name,detail,created_at&limit=20000`),
      databaseRequest(`social_connections?${scope}&select=client_id,platform,display_name,username,profile_url,status,created_at`),
      databaseRequest(`review_links?${scope}&select=client_id,label,created_at,expires_at,revoked_at,last_used_at`),
      databaseRequest(`autopilot_feeds?${scope}&select=*`),
      databaseRequest(`bio_pages?${scope}&select=slug,client_id,enabled`)
    ]);
    // Sign-in tokens and link secrets are never exported.
    return send(res, 200, {
      exportedAt: new Date().toISOString(), format: 'signaldesk-export-1',
      workspace: state, posts: posts || [], notes: notes || [], history: history || [], connections: connections || [], reviewLinks: links || [], autopilotFeeds: feeds || [], bioPages: bios || []
    });
  }

  if (action === 'post-notes') {
    await getPost(workspaceId, body.postId);
    return send(res, 200, { notes: await listNotes(workspaceId, body.postId) });
  }

  if (action === 'add-note') {
    const post = await getPost(workspaceId, body.postId);
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    if (!text || text.length > 2000) return send(res, 400, { error: 'Write a note up to 2,000 characters.' });
    const note = await addNote({ workspaceId, postId: post.id, authorId: user.id, authorName: membership.email || user.email || 'Teammate', kind: 'team', body: text });
    if (post.created_by && post.created_by !== user.id) {
      await notify({ workspaceId, audience: 'users', userIds: [post.created_by], type: 'post_note', category: 'approvals', title: `New note on “${post.title || 'your post'}”`, body: `${membership.email || 'A teammate'}: ${text.slice(0, 160)}`, view: 'calendar', data: { postId: post.id } });
    }
    return send(res, 200, { note });
  }

  if (action === 'next-slot') {
    await assertClientInWorkspace(workspaceId, body.clientId);
    const state = await getWorkspaceState(workspaceId);
    const client = (state.clients || []).find((item) => item.id === body.clientId);
    return send(res, 200, { slot: new Date(await nextQueueSlot(workspaceId, client, WORKSPACE_TIMEZONES[state.settings?.timezone] || 'America/New_York')).toISOString() });
  }

  if (action === 'review-links') {
    await assertClientInWorkspace(workspaceId, body.clientId);
    const links = await databaseRequest(`review_links?workspace_id=eq.${workspaceId}&client_id=eq.${encodeURIComponent(body.clientId)}&revoked_at=is.null&select=id,label,created_at,expires_at,last_used_at&order=created_at.desc`) || [];
    return send(res, 200, { links });
  }

  if (action === 'create-review-link') {
    await assertClientInWorkspace(workspaceId, body.clientId);
    const days = Number.isInteger(body.days) ? Math.min(REVIEW_LINK_DAYS.max, Math.max(REVIEW_LINK_DAYS.min, body.days)) : REVIEW_LINK_DAYS.default;
    const label = typeof body.label === 'string' ? body.label.trim().slice(0, 80) : '';
    const token = crypto.randomBytes(32).toString('base64url');
    const [link] = await databaseRequest('review_links', {
      method: 'POST', headers: { prefer: 'return=representation' },
      body: JSON.stringify({ workspace_id: workspaceId, client_id: body.clientId, token_hash: crypto.createHash('sha256').update(token).digest('hex'), label: label || null, created_by: user.id, expires_at: new Date(Date.now() + days * 86400000).toISOString() })
    });
    // The secret is only ever shown here; SignalDesk keeps just its hash.
    return send(res, 200, { link: { id: link.id, label: link.label, expires_at: link.expires_at }, token });
  }

  if (action === 'revoke-review-link') {
    if (!validUuid(body.id)) return send(res, 400, { error: 'Choose a link.' });
    await databaseRequest(`review_links?workspace_id=eq.${workspaceId}&id=eq.${body.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ revoked_at: new Date().toISOString() }) });
    return send(res, 200, { revoked: true });
  }

  if (action === 'client-report') {
    await assertClientInWorkspace(workspaceId, body.clientId);
    const start = Date.parse(body.start), end = Date.parse(body.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 93 * 86400000) return send(res, 400, { error: 'Choose a period of up to 3 months.' });
    const client = ((await getWorkspaceState(workspaceId)).clients || []).find((item) => item.id === body.clientId);
    const profile = ayrshareConfigured() ? await getProfile(workspaceId, client.id, encryptionKey) : null;
    const report = await buildTopPostsReport({ profile, workspaceId, encryptionKey, clientId: client.id, clientName: client.name, start, end: Math.min(end, Date.now()) });
    const campaign = typeof body.campaign === 'string' ? body.campaign.trim() : '';
    if (campaign) {
      report.rows = report.rows.filter((row) => row.campaign === campaign);
      report.totals = reportTotals(report.rows);
      report.postCount = new Set(report.rows.map((row) => row.providerPostId)).size;
    }
    const posts = await databaseRequest(`scheduled_posts?workspace_id=eq.${workspaceId}&client_id=eq.${encodeURIComponent(client.id)}&scheduled_for=gte.${new Date(start).toISOString()}&scheduled_for=lt.${new Date(end).toISOString()}${campaign ? `&campaign=eq.${encodeURIComponent(campaign)}` : ''}&select=status`) || [];
    return send(res, 200, { report, campaign, scheduled: posts.filter((post) => ['scheduled', 'pending_approval'].includes(post.status)).length });
  }

  if (action === 'job-comments') {
    return send(res, 200, { comments: await listJobComments(workspaceId, body.jobId, encryptionKey) });
  }

  if (action === 'reply-comment') {
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > 2000) return send(res, 400, { error: 'Write a reply up to 2,000 characters.' });
    return send(res, 200, { reply: await replyToComment(workspaceId, body.jobId, body.commentId, text, encryptionKey) });
  }

  if (action === 'overview') {
    const [data] = await Promise.all([
      overviewData(workspaceId, await workspaceTimeZone(workspaceId)),
      checkWorkerHealth().catch((error) => console.error('Health check failed:', error.message))
    ]);
    return send(res, 200, data);
  }

  if (action === 'approve') {
    const { post, late } = await approvePost(workspaceId, body.postId, user.id);
    await addHistory(workspaceId, post.id, 'approved', { actorName: membership.email, detail: { late } });
    if (post.created_by && post.created_by !== user.id) {
      await notify({
        workspaceId, audience: 'users', userIds: [post.created_by], type: 'approval_decided', category: 'approvals',
        title: 'Your post was approved',
        body: `“${post.title || 'Your post'}” was approved by ${membership.email || 'an admin'}${late ? ' and is publishing now because its time had passed' : ' and will publish as scheduled'}.`,
        view: 'calendar', data: { postId: post.id }
      });
    }
    return send(res, 200, { approved: true, late });
  }

  if (action === 'reject') {
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
    const post = await rejectPost(workspaceId, body.postId, note);
    await addHistory(workspaceId, post.id, 'changes_requested', { actorName: membership.email, detail: { note } });
    if (post.created_by && post.created_by !== user.id) {
      await notify({
        workspaceId, audience: 'users', userIds: [post.created_by], type: 'approval_decided', category: 'approvals',
        title: 'Your post needs changes', body: `“${post.title || 'Your post'}” wasn’t approved${note ? `: ${note}` : '.'}`, view: 'composer', data: { postId: post.id }
      });
    }
    return send(res, 200, { rejected: true });
  }

  if (action === 'cancel-post') {
    const result = await cancelPost(workspaceId, body.postId, { userId: user.id, admin: membership.role === 'admin' });
    await addHistory(workspaceId, body.postId, 'canceled', { actorName: membership.email, detail: { keptPublished: result.keptPublished } });
    return send(res, 200, result);
  }

  if (action === 'reschedule-post') {
    const before = await getPost(workspaceId, body.postId);
    const result = await reschedulePost(workspaceId, body.postId, Date.parse(body.scheduleDate));
    await addHistory(workspaceId, body.postId, 'rescheduled', { actorName: membership.email, detail: { from: before.scheduled_for, to: result.scheduledFor } });
    return send(res, 200, result);
  }

  if (action === 'retry-job') {
    return send(res, 200, await retryJob(workspaceId, body.jobId, { confirmed: body.confirmed === true }));
  }

  if (action === 'oauth-session' || action === 'oauth-finish') {
    if (!validUuid(body.sessionId)) return send(res, 400, { error: 'Start connecting again.' });
    const rows = await databaseRequest(`oauth_sessions?id=eq.${body.sessionId}&workspace_id=eq.${workspaceId}&user_id=eq.${user.id}&select=*`);
    const session = rows?.[0];
    if (!session) return send(res, 404, { error: 'That sign-in was not found. Start connecting again.' });
    if (action === 'oauth-session') {
      return send(res, 200, { status: session.status, provider: session.provider, clientId: session.client_id, candidates: session.candidates, error: session.error });
    }
    if (session.status !== 'authorized' || !session.secret_ciphertext || Date.parse(session.expires_at) < Date.now()) {
      return send(res, 409, { error: 'This sign-in expired. Start connecting again.' });
    }
    const selections = Array.isArray(body.selections) ? body.selections.slice(0, 4) : [];
    const chosen = selections.map((selection) => ({ selection, candidate: session.candidates.find((item) => item.key === selection?.key) }));
    if (!chosen.length || chosen.some((item) => !item.candidate)) return send(res, 400, { error: 'Choose at least one account to connect.' });
    if (new Set(chosen.map((item) => item.candidate.platform)).size !== chosen.length) return send(res, 400, { error: 'Choose one account per network for each client.' });
    await assertClientInWorkspace(workspaceId, session.client_id);
    const secret = JSON.parse(decryptSecret(session.secret_ciphertext, encryptionKey));
    const adapter = PROVIDERS[session.provider];
    for (const { candidate, selection } of chosen) {
      const connection = adapter.connectionFor(candidate, secret, selection);
      await saveConnection({ workspaceId, clientId: session.client_id, userId: user.id, candidate, connection, encryptionKey });
    }
    await databaseRequest(`oauth_sessions?id=eq.${session.id}`, {
      method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ status: 'completed', secret_ciphertext: null })
    });
    return send(res, 200, { connected: chosen.map((item) => item.candidate.platform) });
  }

  if (action === 'autopilot-run') {
    const [feeds, comments] = await Promise.all([
      runAutopilot({ workspaceId, encryptionKey }),
      processDueComments({ workspaceId, encryptionKey })
    ]);
    return send(res, 200, { feeds, comments });
  }

  return send(res, 400, { error: 'Unknown workspace action.' });
}

// Checks a post from the Publishing Studio; used for new posts and edits.
function validatePublishInput(body) {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const manual = Array.isArray(body.manual) ? [...new Set(body.manual)] : [];
  if (manual.some((platform) => !MANUAL_PLATFORMS[platform]) || manual.length > 6) throw httpError(400, 'Choose valid networks for reminders.');
  const platforms = Array.isArray(body.platforms) && !body.platforms.length && manual.length ? [] : body.platforms;
  if (platforms.length || !manual.length) requirePlatforms(platforms);
  if (new Set(platforms).size !== platforms.length) throw httpError(400, 'Choose each network once.');
  if (manual.length && !text) throw httpError(400, 'Write the shared post copy for your reminders.');
  const mediaUrls = body.mediaUrls || [];
  const isMediaList = (urls) => Array.isArray(urls) && urls.length <= 10 && urls.every((url) => typeof url === 'string' && url.startsWith('https://') && url.length <= 2000);
  if (!isMediaList(mediaUrls)) throw httpError(400, 'Media must use publicly accessible HTTPS URLs.');
  const overrides = body.platformContent && typeof body.platformContent === 'object' ? body.platformContent : {};
  const options = validatePostOptions(body.options, platforms);
  const platformContent = {};
  for (const platform of platforms) {
    const override = overrides[platform] || {};
    const postText = typeof override.text === 'string' ? override.text.trim() : text;
    const postMedia = override.mediaUrls === undefined ? mediaUrls : override.mediaUrls;
    if (!postText) throw httpError(400, `Write post copy for ${platform} before publishing.`);
    if (postText.length > 10000) throw httpError(400, `Post copy for ${platform} must be 10,000 characters or fewer.`);
    if (!isMediaList(postMedia)) throw httpError(400, 'Media must use publicly accessible HTTPS URLs.');
    if (MEDIA_REQUIRED_PLATFORMS.has(platform) && !postMedia.length) {
      throw httpError(400, `${platform} requires media. Attach an image or video for it before publishing.`);
    }
    const custom = {};
    if (postText !== text) custom.text = postText;
    if (override.mediaUrls !== undefined) custom.media = postMedia;
    if (Object.keys(custom).length) platformContent[platform] = custom;
  }
  let scheduledFor = Date.now();
  if (body.scheduleDate) {
    scheduledFor = Date.parse(body.scheduleDate);
    if (!Number.isFinite(scheduledFor) || scheduledFor <= Date.now()) throw httpError(400, 'Choose a valid future schedule time.');
  }
  const title = (text || Object.values(platformContent).find((item) => item.text)?.text || '').split('\n')[0].slice(0, 120) || 'Untitled post';
  const allMedia = new Set([...mediaUrls, ...Object.values(platformContent).flatMap((item) => item.media || [])]);
  const mediaAlt = {};
  if (body.mediaAlt && typeof body.mediaAlt === 'object') {
    for (const [url, alt] of Object.entries(body.mediaAlt).slice(0, 20)) {
      if (allMedia.has(url) && typeof alt === 'string' && alt.trim()) mediaAlt[url] = alt.trim().slice(0, 1000);
    }
  }
  const campaign = typeof body.campaign === 'string' ? body.campaign.trim().replace(/\s+/g, ' ') : '';
  if (campaign.length > 60) throw httpError(400, 'Campaign names can be up to 60 characters.');
  return { text, platforms, manual, mediaUrls, mediaAlt, platformContent, options, scheduledFor, title, campaign: campaign || null, evergreen: body.evergreen === true };
}

async function publish(body, { user, membership, clientId, encryptionKey }, res) {
  const input = validatePublishInput(body);
  if (!body.postId) {
    const since = new Date(Date.now() - 86400000).toISOString();
    const recent = await databaseRequest(`scheduled_posts?workspace_id=eq.${membership.workspace_id}&created_at=gte.${since}&select=id&limit=${DAILY_POST_LIMIT}`) || [];
    if (recent.length >= DAILY_POST_LIMIT) return send(res, 429, { error: `This workspace has created ${DAILY_POST_LIMIT} posts in the last 24 hours, the beta limit. Try again later.` });
  }
  const state = await getWorkspaceState(membership.workspace_id);
  const timeZone = WORKSPACE_TIMEZONES[state.settings?.timezone] || 'America/New_York';
  if (body.queue === true) {
    const client = (state.clients || []).find((item) => item.id === clientId);
    input.scheduledFor = await nextQueueSlot(membership.workspace_id, client, timeZone);
  }
  const actorName = membership.email || user.email || 'Teammate';
  // Posts from members with the User role are always held until an admin approves them.
  const held = membership.role !== 'admin' || body.requiresApproval === true;
  let original = null;
  if (body.postId !== undefined) {
    original = await getPost(membership.workspace_id, body.postId);
    assertEditable(original, { userId: user.id, admin: membership.role === 'admin' });
  }
  const post = await createScheduledPost({ workspaceId: membership.workspace_id, clientId, userId: original?.created_by || user.id, ...input, held, encryptionKey, timeZone, actorName });
  if (original) await replacePost(membership.workspace_id, original, post.id, actorName);
  if (held) {
    await notify({
      workspaceId: membership.workspace_id, audience: 'admins', excludeUserId: user.id, type: 'approval_requested', category: 'approvals',
      title: `${original ? 'Edited post' : 'New post'} awaiting approval for ${await clientName(membership.workspace_id, clientId)}`,
      body: `${actorName} ${original ? 'updated' : 'submitted'} “${input.title}” for ${[...input.platforms.map((platform) => PLATFORM_LABELS[platform] || platform), ...input.manual.map((platform) => `${MANUAL_PLATFORMS[platform]} (reminder)`)].join(', ')}.`,
      view: 'approvals', data: { postId: post.id, clientId }
    });
  }
  return send(res, 200, { status: held ? 'pending_approval' : 'scheduled', post, requiresApproval: held, queuedComments: post.queuedComments, replaced: original?.id || null });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return send(res, 400, { error: 'Invalid JSON request.' }); }
  }
  if (!body || typeof body !== 'object') return send(res, 400, { error: 'Invalid request.' });

  const action = body.action;
  if (!CLIENT_ACTIONS.has(action) && !WORKSPACE_ACTIONS.has(action) && !ACCOUNT_ACTIONS.has(action)) return send(res, 400, { error: 'Unknown social integration action.' });
  const { encryptionKey, missing } = getConfig();
  if (missing.length) return send(res, 503, { error: 'Social integrations are not configured.', missing });

  try {
    const user = await getUser(req);
    if (!user?.id) return send(res, 401, { error: 'Sign in to connect social accounts.' });
    // Account actions work even before someone has a workspace (for example, without an invite code).
    if (action === 'account-plan') return send(res, 200, await deletionPlan(user.id));
    if (action === 'delete-account') {
      if (body.confirm !== 'DELETE') return send(res, 400, { error: 'Type DELETE to confirm.' });
      return send(res, 200, await deleteAccount(user));
    }
    const membership = await getMembership(user.id);
    if (!membership) return send(res, 403, { error: 'Reload SignalDesk to finish setting up your workspace.' });
    if (membership.role !== 'admin' && !USER_ACTIONS.has(action)) return send(res, 403, { error: 'Only workspace admins can do that.' });
    if (WORKSPACE_ACTIONS.has(action)) return await handleWorkspaceAction(action, body, { user, membership, encryptionKey, origin: typeof req.headers.origin === 'string' ? req.headers.origin.replace(/\/+$/, '') : '' }, res);

    const workspaceId = membership.workspace_id;
    const clientId = body.clientId;
    await assertClientInWorkspace(workspaceId, clientId);

    if (action === 'accounts') {
      const [connections, profile] = await Promise.all([
        listConnections(workspaceId, clientId),
        ayrshareConfigured() ? getProfile(workspaceId, clientId, encryptionKey) : null
      ]);
      let ayrshare = null;
      let warning = '';
      if (profile) {
        try { ayrshare = await ayrshareRequest('/user', { profileKey: profile.profileKey }); } catch (error) { warning = `Couldn't load Ayrshare accounts: ${error.message}`; }
      }
      return send(res, 200, { accounts: publicAccounts({ connections, ayrshare }), refId: profile?.refId || null, role: membership.role, integrations: integrations(), warning });
    }

    if (action === 'publish') return await publish({ ...body, postId: undefined }, { user, membership, clientId, encryptionKey }, res);
    if (action === 'update-post') {
      if (typeof body.postId !== 'string') return send(res, 400, { error: 'Choose a post to edit.' });
      return await publish(body, { user, membership, clientId, encryptionKey }, res);
    }

    if (action === 'oauth-start') {
      if (!PROVIDERS[body.provider]) return send(res, 400, { error: 'Choose Meta, LinkedIn, or Pinterest.' });
      if (!providerConfigured(body.provider) && !(body.provider === 'linkedin' && body.variant === 'pages')) return send(res, 503, { error: `${body.provider === 'meta' ? 'Meta' : body.provider === 'linkedin' ? 'LinkedIn' : 'Pinterest'} isn't set up on the server yet. Add its app ID and secret.` });
      const pages = body.provider === 'linkedin' && body.variant === 'pages';
      if (pages && !providerConfigured('linkedin_pages')) return send(res, 503, { error: 'Company Pages need a second LinkedIn app. Add LINKEDIN_PAGES_CLIENT_ID and LINKEDIN_PAGES_CLIENT_SECRET in Vercel.' });
      const state = (pages ? 'lp_' : '') + crypto.randomBytes(32).toString('base64url');
      const url = PROVIDERS[body.provider].authorizeUrl(state);
      const [session] = await databaseRequest('oauth_sessions', {
        method: 'POST', headers: { prefer: 'return=representation' },
        body: JSON.stringify({ state, workspace_id: workspaceId, user_id: user.id, client_id: clientId, provider: body.provider, expires_at: new Date(Date.now() + OAUTH_SESSION_MINUTES * 60000).toISOString() })
      });
      return send(res, 200, { sessionId: session.id, url });
    }

    if (action === 'ig-lookup') {
      const username = typeof body.username === 'string' ? body.username.trim().replace(/^@/, '').toLowerCase() : '';
      if (!/^[a-z0-9._]{1,30}$/.test(username)) return send(res, 400, { error: 'Enter an Instagram username.' });
      const connection = (await listConnections(workspaceId, clientId)).find((item) => item.platform === 'instagram' && item.status === 'active');
      if (!connection) return send(res, 200, { status: 'unavailable', reason: 'Connect this client’s Instagram account to look up usernames.' });
      const full = await loadConnection(connection.id, encryptionKey);
      try {
        return send(res, 200, await lookupInstagramAccount(full, username));
      } catch (error) {
        return send(res, 200, { status: 'unavailable', reason: error.kind === 'rate_limit' ? 'Instagram is limiting lookups right now. Try again in a few minutes.' : 'Instagram lookups aren’t working right now.' });
      }
    }

    if (action === 'disconnect') {
      if (!DIRECT_PLATFORMS[body.platform]) return send(res, 400, { error: 'Choose a directly connected network.' });
      const scope = `workspace_id=eq.${workspaceId}&client_id=eq.${encodeURIComponent(clientId)}`;
      const waiting = await databaseRequest(`publish_jobs?${scope}&platform=eq.${body.platform}&provider=eq.direct&status=in.(held,queued)&select=id`) || [];
      await databaseRequest(`social_connections?${scope}&platform=eq.${body.platform}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } });
      return send(res, 200, { disconnected: true, waitingPosts: waiting.length });
    }

    if (!AYRSHARE_ACTIONS.has(action)) return send(res, 400, { error: 'Unknown social integration action.' });
    if (!ayrshareConfigured()) return send(res, 503, { error: 'This needs Ayrshare, which isn’t configured on the server.' });
    const origin = action === 'connect' ? allowedOrigin(req) : null;
    const profile = await getOrCreateProfile(workspaceId, clientId, encryptionKey);

    if (action === 'connect') {
      const allowedSocial = [...PLATFORM_KEYS].filter((platform) => platform !== 'twitter' || process.env.X_TWITTER_OAUTH1_API_KEY);
      const sessionBody = { allowedSocial, origin };
      if (process.env.AYRSHARE_DOMAIN) sessionBody.domain = process.env.AYRSHARE_DOMAIN;
      const session = await ayrshareRequest('/profiles/link-sessions', {
        method: 'POST',
        profileKey: profile.profileKey,
        body: sessionBody
      });
      return send(res, 200, { url: session.url, expiresAt: session.expiresAt, title: session.title });
    }

    if (action === 'analytics') {
      const platforms = body.platforms;
      requirePlatforms(platforms);
      const result = await ayrshareRequest('/analytics/social', {
        method: 'POST', profileKey: profile.profileKey,
        body: { platforms, quarters: Math.min(4, Math.max(1, Number(body.quarters) || 1)) }
      });
      return send(res, 200, result);
    }

    if (action === 'comments') {
      if (typeof body.postId !== 'string' || !body.postId.trim()) return send(res, 400, { error: 'A post ID is required to load comments.' });
      const result = await ayrshareRequest(`/comments/${encodeURIComponent(body.postId)}`, { profileKey: profile.profileKey });
      return send(res, 200, result);
    }

    if (action === 'post-comment') {
      if (typeof body.postId !== 'string' || !body.postId.trim() || typeof body.comment !== 'string' || !body.comment.trim() || !COMMENT_PLATFORMS.has(body.platform)) {
        return send(res, 400, { error: 'Choose a supported platform, post, and comment.' });
      }
      const result = await ayrshareRequest('/comments', {
        method: 'POST', profileKey: profile.profileKey,
        body: { id: body.postId, comment: body.comment.trim(), platforms: [body.platform] }
      });
      return send(res, 200, result);
    }

    if (action === 'messages') {
      if (!MESSAGE_PLATFORMS.has(body.platform)) return send(res, 400, { error: 'Messages are currently available for Facebook, Instagram, X, and WhatsApp.' });
      const query = { status: body.status === 'archived' ? 'archived' : 'active', conversationsOnly: body.conversationsOnly ? 'true' : undefined, conversationId: body.conversationId, limit: '100', next: body.next };
      const result = await ayrshareRequest(`/messages/${body.platform}`, { profileKey: profile.profileKey, query });
      return send(res, 200, result);
    }

    if (action === 'reply') {
      if (!MESSAGE_PLATFORMS.has(body.platform) || typeof body.recipientId !== 'string' || !body.recipientId.trim() || typeof body.message !== 'string' || !body.message.trim()) {
        return send(res, 400, { error: 'Choose a supported platform, recipient, and message.' });
      }
      const result = await ayrshareRequest(`/messages/${body.platform}`, {
        method: 'POST', profileKey: profile.profileKey,
        body: { recipientId: body.recipientId, message: body.message.trim() }
      });
      return send(res, 200, result);
    }

    return send(res, 400, { error: 'Unknown social integration action.' });
  } catch (error) {
    return providerResponseError(error, res, body?.action);
  }
};
