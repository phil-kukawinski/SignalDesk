const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const net = require('node:net');

const PLATFORM_KEYS = new Set([
  'bluesky', 'facebook', 'gmb', 'instagram', 'linkedin', 'pinterest', 'reddit',
  'snapchat', 'telegram', 'threads', 'tiktok', 'twitter', 'whatsapp', 'youtube'
]);
const MESSAGE_PLATFORMS = new Set(['facebook', 'instagram', 'twitter', 'whatsapp']);
const MEDIA_REQUIRED_PLATFORMS = new Set(['instagram', 'pinterest', 'tiktok', 'youtube']);
const COMMENT_PLATFORMS = new Set(['bluesky', 'facebook', 'instagram', 'linkedin', 'reddit', 'tiktok', 'twitter', 'youtube']);
const VISIBILITY_OPTIONS = {
  linkedin: ['public', 'connections', 'loggedin'],
  youtube: ['public', 'unlisted', 'private'],
  tiktok: ['public', 'private', 'followers', 'friends']
};
const WORKSPACE_TIMEZONES = {
  'Eastern Time (US & Canada)': 'America/New_York',
  'Central Time (US & Canada)': 'America/Chicago',
  'Pacific Time (US & Canada)': 'America/Los_Angeles'
};
const AYRSHARE_BASE = 'https://api.ayrshare.com/api';
const COMMENT_RETRY_MINUTES = 30;
const COMMENT_MAX_ATTEMPTS = 12;

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function send(res, status, payload) {
  res.status(status).json(payload);
}

function getConfig() {
  const encryptionKey = Buffer.from(process.env.SOCIAL_PROFILE_ENCRYPTION_KEY || '', 'base64');
  // Ayrshare is optional: direct connections cover Facebook, Instagram, LinkedIn, and Pinterest.
  const missing = [
    'SUPABASE_URL', 'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY', 'SOCIAL_PROFILE_ENCRYPTION_KEY'
  ].filter((name) => !process.env[name]);
  if (process.env.SOCIAL_PROFILE_ENCRYPTION_KEY && encryptionKey.length !== 32) {
    missing.push('SOCIAL_PROFILE_ENCRYPTION_KEY (must be base64 for 32 bytes)');
  }
  return { encryptionKey, missing };
}

function ayrshareConfigured() {
  return Boolean(process.env.AYRSHARE_API_KEY);
}

function getBearerToken(req) {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  return match?.[1] || '';
}

async function getUser(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) return null;
  return response.json();
}

async function databaseRequest(path, options = {}) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      ...options.headers
    }
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    console.error('Database request failed:', response.status, detail.message || detail.code || '');
    throw httpError(response.status === 409 ? 409 : 500, 'Could not access workspace storage.');
  }
  return response.status === 204 || response.headers.get('content-length') === '0' ? null : response.json().catch(() => null);
}

function encryptProfileKey(profileKey, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(profileKey, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

function decryptProfileKey(ciphertext, key) {
  const packed = Buffer.from(ciphertext, 'base64');
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const encrypted = packed.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function getTwitterHeaders() {
  const apiKey = process.env.X_TWITTER_OAUTH1_API_KEY;
  const apiSecret = process.env.X_TWITTER_OAUTH1_API_SECRET;
  if (Boolean(apiKey) !== Boolean(apiSecret)) {
    throw new Error('Both X BYO API credentials must be configured together.');
  }
  return apiKey ? {
    'X-Twitter-OAuth1-Api-Key': apiKey,
    'X-Twitter-OAuth1-Api-Secret': apiSecret
  } : {};
}

async function ayrshareRequest(path, { method = 'GET', profileKey, body, query } = {}) {
  if (!ayrshareConfigured()) throw httpError(503, 'Ayrshare isn’t configured. Add AYRSHARE_API_KEY to use it for this network.');
  const url = new URL(`${AYRSHARE_BASE}${path}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
      ...getTwitterHeaders(),
      ...(profileKey ? { 'Profile-Key': profileKey } : {}),
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || 'The social provider rejected the request.');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

// --- Workspaces, members, and provider profiles ---

async function getMembership(userId) {
  const query = new URLSearchParams({ select: 'workspace_id,role,email', user_id: `eq.${userId}`, limit: '1' });
  const rows = await databaseRequest(`workspace_members?${query}`);
  return rows?.[0] || null;
}

async function getWorkspaceState(workspaceId) {
  const query = new URLSearchParams({ select: 'state', workspace_id: `eq.${workspaceId}`, limit: '1' });
  const rows = await databaseRequest(`workspace_state?${query}`);
  return rows?.[0]?.state || {};
}

function validateClientId(clientId) {
  if (typeof clientId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(clientId)) {
    throw httpError(400, 'Choose a valid client workspace.');
  }
}

async function assertClientInWorkspace(workspaceId, clientId) {
  validateClientId(clientId);
  const clients = (await getWorkspaceState(workspaceId)).clients;
  if (!Array.isArray(clients) || !clients.some((client) => client.id === clientId)) {
    throw httpError(404, 'Client not found in this workspace.');
  }
}

async function getProfile(workspaceId, clientId, encryptionKey) {
  const query = new URLSearchParams({
    select: 'client_id,ayrshare_ref_id,profile_key_ciphertext',
    workspace_id: `eq.${workspaceId}`,
    client_id: `eq.${clientId}`,
    limit: '1'
  });
  const rows = await databaseRequest(`social_profiles?${query}`);
  const row = rows?.[0];
  if (!row) return null;
  return {
    refId: row.ayrshare_ref_id,
    profileKey: decryptProfileKey(row.profile_key_ciphertext, encryptionKey)
  };
}

async function createProfile(workspaceId, clientId, encryptionKey) {
  const title = `SignalDesk-${workspaceId.slice(0, 8)}-${clientId.slice(0, 8)}`;
  const created = await ayrshareRequest('/profiles', { method: 'POST', body: { title } });
  if (!created.profileKey || !created.refId) throw new Error('Provider did not return a profile key.');
  await databaseRequest('social_profiles?on_conflict=workspace_id,client_id', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      workspace_id: workspaceId,
      client_id: clientId,
      ayrshare_ref_id: created.refId,
      profile_key_ciphertext: encryptProfileKey(created.profileKey, encryptionKey),
      updated_at: new Date().toISOString()
    })
  });
  return { refId: created.refId, profileKey: created.profileKey };
}

async function getOrCreateProfile(workspaceId, clientId, encryptionKey) {
  return await getProfile(workspaceId, clientId, encryptionKey) || createProfile(workspaceId, clientId, encryptionKey);
}

function requirePlatforms(platforms) {
  if (!Array.isArray(platforms) || !platforms.length || platforms.some((platform) => !PLATFORM_KEYS.has(platform))) {
    throw httpError(400, 'Choose at least one supported social platform.');
  }
}

// --- Post options: collaborators, tags, privacy, comments, reshares ---

const INSTAGRAM_USERNAME = /^[A-Za-z0-9._]{1,30}$/;

function cleanUsername(value) {
  return typeof value === 'string' ? value.trim().replace(/^@/, '') : '';
}

function validatePostOptions(options, platforms) {
  if (options === undefined || options === null) return {};
  if (typeof options !== 'object') throw httpError(400, 'Post options are invalid.');
  const clean = {};
  if (platforms.includes('instagram')) {
    const instagram = {};
    if (options.collaborators !== undefined) {
      const collaborators = Array.isArray(options.collaborators) ? options.collaborators.map(cleanUsername).filter(Boolean) : null;
      if (!collaborators || collaborators.length > 3 || collaborators.some((name) => !INSTAGRAM_USERNAME.test(name))) {
        throw httpError(400, 'Add up to three public Instagram usernames as collaborators.');
      }
      if (collaborators.length) instagram.collaborators = collaborators;
    }
    if (options.userTags !== undefined) {
      if (!Array.isArray(options.userTags) || options.userTags.length > 20) throw httpError(400, 'Tag up to 20 Instagram accounts.');
      const tags = options.userTags.map((tag) => {
        const username = cleanUsername(tag?.username);
        if (!INSTAGRAM_USERNAME.test(username)) throw httpError(400, 'Instagram tags must be public usernames.');
        if (tag.x === undefined && tag.y === undefined) return { username };
        const x = Number(tag.x), y = Number(tag.y);
        if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) throw httpError(400, 'Instagram tag positions must be between 0 and 1.');
        return { username, x, y };
      });
      if (tags.length) instagram.userTags = tags;
    }
    if (Object.keys(instagram).length) clean.instagramOptions = instagram;
  }
  const visibility = options.visibility && typeof options.visibility === 'object' ? options.visibility : {};
  for (const [platform, allowed] of Object.entries(VISIBILITY_OPTIONS)) {
    if (!platforms.includes(platform) || visibility[platform] === undefined || visibility[platform] === '') continue;
    if (!allowed.includes(visibility[platform])) throw httpError(400, `Choose a valid ${platform} privacy setting.`);
    clean[platform] = { visibility: visibility[platform] };
  }
  if (typeof options.firstComment === 'string' && options.firstComment.trim()) {
    if (options.firstComment.length > 2200) throw httpError(400, 'The first comment must be 2,200 characters or fewer.');
    clean.firstComment = { comment: options.firstComment.trim() };
  }
  if (options.followUpComments !== undefined) {
    if (!Array.isArray(options.followUpComments) || options.followUpComments.length > 5) throw httpError(400, 'Schedule up to five follow-up comments.');
    clean.followUpComments = options.followUpComments.map((item) => {
      const comment = typeof item?.comment === 'string' ? item.comment.trim() : '';
      const delayMinutes = Number(item?.delayMinutes);
      if (!comment || comment.length > 2200) throw httpError(400, 'Each follow-up comment needs 1 to 2,200 characters.');
      if (!Number.isInteger(delayMinutes) || delayMinutes < 15 || delayMinutes > 43200) throw httpError(400, 'Follow-up comments must be 15 minutes to 30 days after the post.');
      return { comment, delayMinutes };
    });
  }
  if (platforms.includes('pinterest') && options.pinterest && typeof options.pinterest === 'object') {
    const pin = {};
    const title = typeof options.pinterest.title === 'string' ? options.pinterest.title.trim() : '';
    const link = typeof options.pinterest.link === 'string' ? options.pinterest.link.trim() : '';
    if (title.length > 100) throw httpError(400, 'Pin titles can be up to 100 characters.');
    if (link && (link.length > 2000 || !/^https?:\/\/\S+$/i.test(link))) throw httpError(400, 'The Pin link must be a full web address.');
    if (options.pinterest.boardId !== undefined && options.pinterest.boardId !== '' && !/^[\w-]{1,64}$/.test(String(options.pinterest.boardId))) throw httpError(400, 'Choose a valid Pinterest board.');
    if (title) pin.title = title;
    if (link) pin.link = link;
    if (options.pinterest.boardId) pin.boardId = String(options.pinterest.boardId);
    if (Object.keys(pin).length) clean.pinterest = pin;
  }
  if (options.utm === true) clean.utm = true;
  if (options.autoRepost !== undefined && options.autoRepost !== null) {
    const repeat = Number(options.autoRepost.repeat);
    if (options.autoRepost.every === 'month') {
      if (!Number.isInteger(repeat) || repeat < 1 || repeat > 12) throw httpError(400, 'Monthly repeats can run 1 to 12 more times.');
      clean.autoRepost = { repeat, every: 'month' };
    } else {
      const days = Number(options.autoRepost.days);
      if (!Number.isInteger(repeat) || repeat < 1 || repeat > 26 || !Number.isInteger(days) || days < 2 || days > 365) {
        throw httpError(400, 'Repeats run 1 to 26 more times, 2 to 365 days apart.');
      }
      clean.autoRepost = { repeat, days };
    }
  }
  return clean;
}

function buildPostBody({ text, platforms, mediaUrls, scheduleDate, requiresApproval, options = {}, idempotencyKey = crypto.randomUUID() }) {
  const body = { post: text, platforms, idempotencyKey };
  if (mediaUrls?.length) body.mediaUrls = mediaUrls;
  if (platforms.includes('youtube')) body.youTubeOptions = { title: text.slice(0, 100), ...options.youtube };
  if (platforms.includes('linkedin') && options.linkedin) body.linkedInOptions = options.linkedin;
  if (platforms.includes('tiktok') && options.tiktok) body.tikTokOptions = options.tiktok;
  if (platforms.includes('instagram') && options.instagramOptions) body.instagramOptions = options.instagramOptions;
  if (options.firstComment) body.firstComment = options.firstComment;
  if (requiresApproval) body.requiresApproval = true;
  // Ayrshare ignores autoRepost when scheduleDate is present, so the schedule moves into autoRepost.startDate.
  if (options.autoRepost) body.autoRepost = { ...options.autoRepost, ...(scheduleDate ? { startDate: scheduleDate } : {}) };
  else if (scheduleDate) body.scheduleDate = scheduleDate;
  return body;
}

async function queueFollowUpComments({ workspaceId, clientId, userId, postId, platforms, comments, baseTime }) {
  const commentPlatforms = platforms.filter((platform) => COMMENT_PLATFORMS.has(platform));
  if (!postId || !comments?.length || !commentPlatforms.length) return 0;
  const base = Date.parse(baseTime) || Date.now();
  await databaseRequest('scheduled_comments', {
    method: 'POST',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify(comments.map((item) => ({
      workspace_id: workspaceId,
      client_id: clientId,
      provider_post_id: postId,
      platforms: commentPlatforms,
      comment: item.comment,
      run_at: new Date(base + item.delayMinutes * 60000).toISOString(),
      created_by: userId
    })))
  });
  return comments.length;
}

async function processDueComments({ workspaceId, encryptionKey, limit = 25 } = {}) {
  const query = new URLSearchParams({
    select: 'id,workspace_id,client_id,provider_post_id,job_id,platforms,comment,attempts,created_by',
    status: 'eq.pending',
    run_at: `lte.${new Date().toISOString()}`,
    order: 'run_at.asc',
    limit: String(limit)
  });
  if (workspaceId) query.set('workspace_id', `eq.${workspaceId}`);
  const due = await databaseRequest(`scheduled_comments?${query}`) || [];
  let posted = 0;
  for (const item of due) {
    let patch;
    if (item.job_id) {
      patch = await commentOnJob(item, encryptionKey);
      if (patch.status === 'posted') posted += 1;
      await databaseRequest(`scheduled_comments?id=eq.${item.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify(patch) });
      if (patch.status === 'failed' && item.created_by) await notifyCommentFailed(item, patch.last_error);
      continue;
    }
    try {
      const profile = await getProfile(item.workspace_id, item.client_id, encryptionKey);
      if (!profile) throw new Error('The client no longer has connected accounts.');
      await ayrshareRequest('/comments', {
        method: 'POST', profileKey: profile.profileKey,
        body: { id: item.provider_post_id, comment: item.comment, platforms: item.platforms }
      });
      patch = { status: 'posted', posted_at: new Date().toISOString(), last_error: null };
      posted += 1;
    } catch (error) {
      // The post may still be awaiting approval or processing, so retry for a while before giving up.
      const attempts = item.attempts + 1;
      patch = attempts >= COMMENT_MAX_ATTEMPTS
        ? { status: 'failed', attempts, last_error: error.message }
        : { attempts, last_error: error.message, run_at: new Date(Date.now() + COMMENT_RETRY_MINUTES * 60000).toISOString() };
    }
    await databaseRequest(`scheduled_comments?id=eq.${item.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify(patch) });
    if (patch.status === 'failed' && item.created_by) await notifyCommentFailed(item, patch.last_error);
  }
  return { due: due.length, posted };
}

// Comments tied to a SignalDesk publish job wait until that job is live.
async function commentOnJob(item, encryptionKey) {
  const job = (await databaseRequest(`publish_jobs?id=eq.${item.job_id}&select=*`))?.[0];
  if (!job || ['failed', 'unknown', 'canceled'].includes(job.status)) {
    return { status: 'failed', last_error: 'The post didn’t publish, so this comment was skipped.' };
  }
  if (job.status !== 'published') return { run_at: new Date(Date.now() + 5 * 60000).toISOString() };
  try {
    await require('./publishing').postJobComment(job, item.comment, encryptionKey);
    return { status: 'posted', posted_at: new Date().toISOString(), last_error: null };
  } catch (error) {
    const attempts = item.attempts + 1;
    return attempts >= COMMENT_MAX_ATTEMPTS
      ? { status: 'failed', attempts, last_error: error.message }
      : { attempts, last_error: error.message, run_at: new Date(Date.now() + COMMENT_RETRY_MINUTES * 60000).toISOString() };
  }
}

async function notifyCommentFailed(item, message) {
  await require('./notify').notify({
    workspaceId: item.workspace_id, audience: 'users', userIds: [item.created_by], type: 'comment_failed', category: 'publishing',
    title: 'A scheduled comment could not be posted', body: `“${item.comment.slice(0, 120)}” — ${message}`, view: 'calendar'
  });
}

// --- RSS Autopilot ---

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const value = ip.toLowerCase();
  if (value.startsWith('::ffff:')) return isPrivateAddress(value.slice(7));
  return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80');
}

// Only public web addresses may be fetched, so links and feeds can't be used to reach internal services.
async function assertPublicUrl(raw, label = 'Links') {
  let url;
  try { url = new URL(raw); } catch { throw httpError(400, `Enter a valid ${label === 'Links' ? 'link' : 'feed URL'}.`); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !['', '80', '443'].includes(url.port)) {
    throw httpError(400, `${label} must be public http or https addresses.`);
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true }).catch(() => []);
  if (!addresses.length) throw httpError(400, 'That address could not be found.');
  if (addresses.some(({ address }) => isPrivateAddress(address))) throw httpError(400, `${label} must point to a public website.`);
  return url;
}

function assertPublicFeedUrl(raw) {
  return assertPublicUrl(raw, 'Feed URLs');
}

const LINK_CHECK_HEADERS = { 'user-agent': 'Mozilla/5.0 (compatible; SignalDesk-LinkCheck/1.0)', accept: 'text/html,application/xhtml+xml,*/*;q=0.8' };
const BLOCKED_CHECK_CODES = new Set([401, 403, 429, 999]);

async function checkLink(raw) {
  let target = raw;
  try {
    for (let hop = 0; hop < 5; hop += 1) {
      const url = await assertPublicUrl(target);
      let response = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(6000), headers: LINK_CHECK_HEADERS });
      if ([400, 403, 405, 501].includes(response.status)) {
        // Some servers reject HEAD; retry with GET and discard the body.
        response = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(6000), headers: LINK_CHECK_HEADERS });
        response.body?.cancel().catch(() => {});
      }
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        target = new URL(location, url).href;
        continue;
      }
      if (response.status < 400) return { url: raw, status: 'ok', code: response.status, finalUrl: target };
      if (BLOCKED_CHECK_CODES.has(response.status)) return { url: raw, status: 'unknown', code: response.status, detail: 'The site blocked the automatic check. Open it to confirm.' };
      return { url: raw, status: 'broken', code: response.status, detail: response.status === 404 ? 'Page not found (404).' : `The page returned HTTP ${response.status}.` };
    }
    return { url: raw, status: 'broken', detail: 'Too many redirects.' };
  } catch (error) {
    if (error.name === 'TimeoutError') return { url: raw, status: 'unknown', detail: 'The site took too long to respond.' };
    return { url: raw, status: 'broken', detail: error.status === 400 ? error.message : 'The site could not be reached.' };
  }
}

async function fetchFeedXml(raw) {
  let target = raw;
  for (let hop = 0; hop < 4; hop += 1) {
    const url = await assertPublicFeedUrl(target);
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      headers: { accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5', 'user-agent': 'SignalDesk-Autopilot/1.0' }
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      target = new URL(response.headers.get('location'), url).href;
      continue;
    }
    if (!response.ok) throw httpError(400, `The feed returned HTTP ${response.status}.`);
    if (Number(response.headers.get('content-length')) > 3_000_000) throw httpError(400, 'The feed is too large to read.');
    const xml = await response.text();
    if (xml.length > 3_000_000) throw httpError(400, 'The feed is too large to read.');
    return xml;
  }
  throw httpError(400, 'The feed redirected too many times.');
}

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function xmlText(raw) {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(raw);
  return cdata ? cdata[1] : decodeEntities(raw);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function firstTag(block, names) {
  for (const name of names) {
    const match = new RegExp(`<${escapeRegex(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeRegex(name)}>`, 'i').exec(block);
    if (match && match[1].trim()) return xmlText(match[1].trim());
  }
  return '';
}

function tagAttributes(block, name) {
  return [...block.matchAll(new RegExp(`<${escapeRegex(name)}\\b([^>]*)>`, 'gi'))].map((match) => {
    const attributes = {};
    for (const [, key, , value] of match[1].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)) attributes[key.toLowerCase()] = decodeEntities(value);
    return attributes;
  });
}

function stripHtml(html) {
  return decodeEntities(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseFeed(xml) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  const head = xml.slice(0, xml.search(/<(item|entry)\b/i) >>> 0);
  const items = blocks.slice(0, 50).map((block) => {
    const atomLinks = tagAttributes(block, 'link').filter((link) => link.href);
    const link = (firstTag(block, ['link']) || atomLinks.find((item) => !item.rel || item.rel === 'alternate')?.href || atomLinks[0]?.href || '').trim();
    const html = firstTag(block, ['content:encoded', 'description', 'summary', 'content']);
    const image = [
      ...tagAttributes(block, 'media:content').filter((item) => !item.medium || item.medium === 'image').map((item) => item.url),
      ...tagAttributes(block, 'media:thumbnail').map((item) => item.url),
      ...tagAttributes(block, 'enclosure').filter((item) => (item.type || '').startsWith('image/')).map((item) => item.url),
      /<img[^>]+src=["']([^"']+)["']/i.exec(html)?.[1]
    ].find((url) => typeof url === 'string' && url.startsWith('https://')) || '';
    const published = Date.parse(firstTag(block, ['pubDate', 'published', 'updated', 'dc:date']));
    return {
      guid: (firstTag(block, ['guid', 'id']) || link).slice(0, 500),
      title: stripHtml(firstTag(block, ['title'])).slice(0, 300),
      link: /^https?:\/\//i.test(link) ? link : '',
      summary: stripHtml(html).slice(0, 500),
      image,
      publishedAt: Number.isFinite(published) ? new Date(published).toISOString() : null
    };
  }).filter((item) => item.guid && (item.title || item.link));
  return { title: stripHtml(firstTag(head, ['title'])).slice(0, 200), items };
}

async function readFeed(url) {
  const feed = parseFeed(await fetchFeedXml(url));
  if (!feed.items.length) throw httpError(400, 'No RSS or Atom items were found at that address.');
  return feed;
}

function renderTemplate(template, item, feedTitle) {
  const values = { title: item.title, link: item.link, summary: item.summary, feed: feedTitle || '' };
  return template.replace(/\{(title|link|summary|feed)\}/g, (match, key) => values[key]).replace(/\n{3,}/g, '\n\n').trim().slice(0, 10000);
}

function keywordList(value) {
  return (value || '').split(',').map((word) => word.trim().toLowerCase()).filter(Boolean);
}

function matchesKeywords(feed, item) {
  const haystack = `${item.title} ${item.summary}`.toLowerCase();
  const include = keywordList(feed.include_keywords), exclude = keywordList(feed.exclude_keywords);
  return (!include.length || include.some((word) => haystack.includes(word))) && !exclude.some((word) => haystack.includes(word));
}

function zonedParts(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric'
  }).formatToParts(date).map((part) => [part.type, Number(part.value)]));
  return parts;
}

function zonedToUtc(year, month, day, hour, minute, timeZone) {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wanted;
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = zonedParts(new Date(guess), timeZone);
    guess += wanted - Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  }
  return guess;
}

function upcomingSlots(feed, timeZone, taken, count) {
  const from = Date.now() + 10 * 60000;
  const today = zonedParts(new Date(from), timeZone);
  const times = [...feed.times].sort();
  const slots = [];
  for (let offset = 0; offset < 21 && slots.length < count; offset += 1) {
    const day = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    if (!feed.days.includes(day.getUTCDay())) continue;
    for (const time of times) {
      const [hour, minute] = time.split(':').map(Number);
      const at = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hour, minute, timeZone);
      if (at < from || taken.has(at)) continue;
      slots.push(at);
      if (slots.length >= count) break;
    }
  }
  return slots;
}

async function insertAutopilotItems(rows) {
  if (!rows.length) return;
  await databaseRequest('autopilot_items?on_conflict=feed_id,guid', {
    method: 'POST',
    headers: { prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(rows)
  });
}

async function baselineFeed(feed, items) {
  await insertAutopilotItems(items.map((item) => ({
    feed_id: feed.id, workspace_id: feed.workspace_id, guid: item.guid, title: item.title, link: item.link,
    image_url: item.image || null, published_at: item.publishedAt, status: 'baseline'
  })));
}

async function runFeed(feed, { encryptionKey, timeZone }) {
  const patchFeed = (patch) => databaseRequest(`autopilot_feeds?id=eq.${feed.id}`, {
    method: 'PATCH', headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ last_checked_at: new Date().toISOString(), ...patch })
  });
  try {
    const parsed = await readFeed(feed.url);
    const seenQuery = new URLSearchParams({ select: 'guid,status,scheduled_for', feed_id: `eq.${feed.id}`, limit: '2000' });
    const seen = await databaseRequest(`autopilot_items?${seenQuery}`) || [];
    const seenGuids = new Set(seen.map((row) => row.guid));
    const fresh = parsed.items.filter((item) => !seenGuids.has(item.guid))
      .sort((a, b) => (Date.parse(a.publishedAt) || 0) - (Date.parse(b.publishedAt) || 0));
    const filtered = fresh.filter((item) => !matchesKeywords(feed, item));
    await insertAutopilotItems(filtered.map((item) => ({
      feed_id: feed.id, workspace_id: feed.workspace_id, guid: item.guid, title: item.title, link: item.link,
      image_url: item.image || null, published_at: item.publishedAt, status: 'filtered'
    })));
    const queue = fresh.filter((item) => matchesKeywords(feed, item)).slice(0, 10);
    if (!queue.length) {
      await patchFeed({ last_error: null, feed_title: parsed.title || feed.feed_title });
      return { created: 0 };
    }
    const { createScheduledPost, resolveDestinations } = require('./publishing');
    // Fail the whole run early with a clear message if an account isn't connected.
    await resolveDestinations(feed.workspace_id, feed.client_id, feed.platforms, encryptionKey);
    const taken = new Set(seen.filter((row) => row.scheduled_for).map((row) => Date.parse(row.scheduled_for)));
    const slots = upcomingSlots(feed, timeZone, taken, queue.length);
    let created = 0;
    for (const [index, item] of queue.entries()) {
      const slot = slots[index];
      if (!slot) break; // Leave the rest unseen so the next run can place them in later slots.
      const media = feed.include_image && item.image ? [item.image] : [];
      const platforms = feed.platforms.filter((platform) => media.length || !MEDIA_REQUIRED_PLATFORMS.has(platform));
      const row = {
        feed_id: feed.id, workspace_id: feed.workspace_id, guid: item.guid, title: item.title, link: item.link,
        image_url: item.image || null, published_at: item.publishedAt, scheduled_for: new Date(slot).toISOString(), platforms
      };
      if (!platforms.length) {
        await insertAutopilotItems([{ ...row, scheduled_for: null, status: 'skipped', error: 'Every selected network needs an image and this item has none.' }]);
        continue;
      }
      try {
        const post = await createScheduledPost({
          workspaceId: feed.workspace_id, clientId: feed.client_id, userId: feed.created_by, source: 'autopilot',
          title: item.title || parsed.title || 'Autopilot post', platforms, text: renderTemplate(feed.template, item, parsed.title),
          mediaUrls: media, scheduledFor: slot, held: feed.mode === 'review', encryptionKey
        });
        await insertAutopilotItems([{ ...row, status: feed.mode === 'review' ? 'in_review' : 'scheduled', post_id: post.id }]);
        created += 1;
      } catch (error) {
        await insertAutopilotItems([{ ...row, status: 'failed', error: error.message }]);
      }
    }
    await patchFeed({ last_error: null, feed_title: parsed.title || feed.feed_title });
    if (created && feed.mode === 'review') {
      await require('./notify').notify({
        workspaceId: feed.workspace_id, audience: 'admins', type: 'autopilot_review', category: 'approvals',
        title: `${created} Autopilot post${created === 1 ? '' : 's'} need${created === 1 ? 's' : ''} approval`,
        body: `New articles from ${parsed.title || feed.feed_title || feed.url} are waiting in the approval queue.`,
        view: 'approvals', data: { feedId: feed.id }
      });
    }
    return { created };
  } catch (error) {
    await patchFeed({ last_error: error.message });
    if (!feed.last_error) {
      await require('./notify').notify({
        workspaceId: feed.workspace_id, audience: 'admins', type: 'autopilot_error', category: 'autopilot',
        title: `Autopilot couldn't read ${feed.feed_title || 'a feed'}`, body: error.message, view: 'calendar', data: { feedId: feed.id }
      });
    }
    return { created: 0, error: error.message };
  }
}

async function runAutopilot({ workspaceId, encryptionKey, staleMinutes = 0, limit = 20 } = {}) {
  const query = new URLSearchParams({ select: '*', enabled: 'eq.true', order: 'last_checked_at.asc.nullsfirst', limit: String(limit) });
  if (workspaceId) query.set('workspace_id', `eq.${workspaceId}`);
  if (staleMinutes) query.set('or', `(last_checked_at.is.null,last_checked_at.lt.${new Date(Date.now() - staleMinutes * 60000).toISOString()})`);
  const feeds = await databaseRequest(`autopilot_feeds?${query}`) || [];
  const timezones = new Map();
  const results = [];
  for (const feed of feeds) {
    if (!timezones.has(feed.workspace_id)) {
      const state = await getWorkspaceState(feed.workspace_id);
      timezones.set(feed.workspace_id, WORKSPACE_TIMEZONES[state.settings?.timezone] || 'America/New_York');
    }
    results.push({ feedId: feed.id, ...await runFeed(feed, { encryptionKey, timeZone: timezones.get(feed.workspace_id) }) });
  }
  return results;
}

module.exports = {
  PLATFORM_KEYS, MESSAGE_PLATFORMS, MEDIA_REQUIRED_PLATFORMS, COMMENT_PLATFORMS,
  httpError, send, getConfig, ayrshareConfigured, getBearerToken, getUser, databaseRequest, ayrshareRequest,
  encryptSecret: encryptProfileKey, decryptSecret: decryptProfileKey, assertPublicUrl,
  getMembership, getWorkspaceState, validateClientId, assertClientInWorkspace,
  getProfile, getOrCreateProfile, requirePlatforms,
  validatePostOptions, buildPostBody, queueFollowUpComments, processDueComments,
  readFeed, baselineFeed, runFeed, runAutopilot, WORKSPACE_TIMEZONES, zonedParts, zonedToUtc, checkLink
};
