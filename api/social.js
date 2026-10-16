const crypto = require('node:crypto');

const PLATFORM_KEYS = new Set([
  'bluesky', 'facebook', 'gmb', 'instagram', 'linkedin', 'pinterest', 'reddit',
  'snapchat', 'telegram', 'threads', 'tiktok', 'twitter', 'whatsapp', 'youtube'
]);
const MESSAGE_PLATFORMS = new Set(['facebook', 'instagram', 'twitter', 'whatsapp']);
const MEDIA_REQUIRED_PLATFORMS = new Set(['instagram', 'pinterest', 'tiktok', 'youtube']);
const AYRSHARE_BASE = 'https://api.ayrshare.com/api';
const SOCIAL_ACTIONS = new Set(['connect', 'accounts', 'publish', 'approve', 'analytics', 'comments', 'post-comment', 'messages', 'reply']);

function send(res, status, payload) {
  res.status(status).json(payload);
}

function getConfig() {
  const encryptionKey = Buffer.from(process.env.SOCIAL_PROFILE_ENCRYPTION_KEY || '', 'base64');
  const missing = [
    'AYRSHARE_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY', 'SOCIAL_PROFILE_ENCRYPTION_KEY'
  ].filter((name) => !process.env[name]);
  if (process.env.SOCIAL_PROFILE_ENCRYPTION_KEY && encryptionKey.length !== 32) {
    missing.push('SOCIAL_PROFILE_ENCRYPTION_KEY (must be base64 for 32 bytes)');
  }
  return { encryptionKey, missing };
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
  if (!response.ok) throw new Error('Could not access social connection storage.');
  return response.status === 204 ? null : response.json();
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

function validateClientId(clientId) {
  if (typeof clientId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(clientId)) {
    throw Object.assign(new Error('Choose a valid client workspace.'), { status: 400 });
  }
}

async function getProfile(userId, clientId, encryptionKey) {
  const query = new URLSearchParams({
    select: 'client_id,ayrshare_ref_id,profile_key_ciphertext',
    user_id: `eq.${userId}`,
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

async function assertClientBelongsToUser(userId, clientId) {
  const query = new URLSearchParams({ select: 'state', user_id: `eq.${userId}`, limit: '1' });
  const rows = await databaseRequest(`workspace_state?${query}`);
  const clients = rows?.[0]?.state?.clients;
  if (!Array.isArray(clients) || !clients.some((client) => client.id === clientId)) {
    throw Object.assign(new Error('Client workspace not found for this signed-in user.'), { status: 404 });
  }
}

async function createProfile(userId, clientId, encryptionKey) {
  const title = `SignalDesk-${userId.slice(0, 8)}-${clientId.slice(0, 8)}`;
  const created = await ayrshareRequest('/profiles', { method: 'POST', body: { title } });
  if (!created.profileKey || !created.refId) throw new Error('Provider did not return a profile key.');
  await databaseRequest('social_profiles?on_conflict=user_id,client_id', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      user_id: userId,
      client_id: clientId,
      ayrshare_ref_id: created.refId,
      profile_key_ciphertext: encryptProfileKey(created.profileKey, encryptionKey),
      updated_at: new Date().toISOString()
    })
  });
  return { refId: created.refId, profileKey: created.profileKey };
}

async function getOrCreateProfile(userId, clientId, encryptionKey) {
  return await getProfile(userId, clientId, encryptionKey) || createProfile(userId, clientId, encryptionKey);
}

function allowedOrigin(req) {
  const origin = req.headers.origin;
  const allowlist = (process.env.APP_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!origin || !allowlist.includes(origin)) {
    throw Object.assign(new Error('This site origin is not configured for social account linking.'), { status: 403 });
  }
  return origin;
}

function publicAccounts(profile) {
  const active = new Set(profile.activeSocialAccounts || []);
  const details = new Map((profile.displayNames || []).map((item) => [item.platform, item]));
  return [...PLATFORM_KEYS].map((platform) => {
    const linked = active.has(platform);
    const detail = details.get(platform) || {};
    return {
      platform,
      linked,
      available: platform !== 'twitter' || Boolean(process.env.X_TWITTER_OAUTH1_API_KEY && process.env.X_TWITTER_OAUTH1_API_SECRET),
      username: detail.username || '',
      displayName: detail.displayName || detail.pageName || detail.channelTitle || '',
      profileUrl: detail.profileUrl || '',
      userImage: detail.userImage || ''
    };
  });
}

function requirePlatforms(platforms) {
  if (!Array.isArray(platforms) || !platforms.length || platforms.some((platform) => !PLATFORM_KEYS.has(platform))) {
    throw Object.assign(new Error('Choose at least one supported social platform.'), { status: 400 });
  }
}

function providerResponseError(error, res) {
  if (error.status) return send(res, error.status, error.payload || { error: error.message });
  console.error('Social integration request failed:', error.message);
  return send(res, 500, { error: 'Social integration request failed.' });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return send(res, 400, { error: 'Invalid JSON request.' }); }
  }
  if (!body || typeof body !== 'object') return send(res, 400, { error: 'Invalid request.' });

  const action = body.action;
  if (!SOCIAL_ACTIONS.has(action)) return send(res, 400, { error: 'Unknown social integration action.' });
  const { encryptionKey, missing } = getConfig();
  if (missing.length) return send(res, 503, { error: 'Social integrations are not configured.', missing });

  try {
    const user = await getUser(req);
    if (!user?.id) return send(res, 401, { error: 'Sign in to connect social accounts.' });
    const clientId = body.clientId;
    validateClientId(clientId);
    await assertClientBelongsToUser(user.id, clientId);
    const origin = action === 'connect' ? allowedOrigin(req) : null;
    const profile = action === 'accounts'
      ? await getProfile(user.id, clientId, encryptionKey)
      : await getOrCreateProfile(user.id, clientId, encryptionKey);

    if (action === 'accounts' && !profile) {
      return send(res, 200, { accounts: publicAccounts({}), refId: null });
    }

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

    if (action === 'accounts') {
      const data = await ayrshareRequest('/user', { profileKey: profile.profileKey });
      return send(res, 200, { accounts: publicAccounts(data), refId: profile.refId });
    }

    if (action === 'publish') {
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      const platforms = body.platforms;
      requirePlatforms(platforms);
      if (!text) return send(res, 400, { error: 'Write post copy before publishing.' });
      if (text.length > 10000) return send(res, 400, { error: 'Post copy must be 10,000 characters or fewer.' });
      const mediaUrls = body.mediaUrls || [];
      if (!Array.isArray(mediaUrls) || mediaUrls.some((url) => typeof url !== 'string' || !url.startsWith('https://'))) {
        return send(res, 400, { error: 'Media must use publicly accessible HTTPS URLs.' });
      }
      if (platforms.some((platform) => MEDIA_REQUIRED_PLATFORMS.has(platform)) && !mediaUrls.length) {
        return send(res, 400, { error: 'Instagram, Pinterest, TikTok, and YouTube require media. Upload support is not configured yet.' });
      }
      const postBody = { post: text, platforms, idempotencyKey: crypto.randomUUID() };
      if (mediaUrls.length) postBody.mediaUrls = mediaUrls;
      if (platforms.includes('youtube')) postBody.youTubeOptions = { title: text.slice(0, 100) };
      if (body.requiresApproval === true) postBody.requiresApproval = true;
      if (body.scheduleDate) {
        const scheduledAt = Date.parse(body.scheduleDate);
        if (!Number.isFinite(scheduledAt) || scheduledAt <= Date.now()) {
          return send(res, 400, { error: 'Choose a valid future schedule time.' });
        }
        postBody.scheduleDate = new Date(scheduledAt).toISOString();
      }
      const result = await ayrshareRequest('/post', { method: 'POST', profileKey: profile.profileKey, body: postBody });
      return send(res, 200, result);
    }

    if (action === 'approve') {
      if (typeof body.postId !== 'string' || !body.postId.trim()) return send(res, 400, { error: 'A provider post ID is required for approval.' });
      const result = await ayrshareRequest('/post', {
        method: 'PATCH', profileKey: profile.profileKey,
        body: { id: body.postId, approved: true }
      });
      return send(res, 200, result);
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
      const commentPlatforms = new Set(['bluesky', 'facebook', 'instagram', 'linkedin', 'reddit', 'tiktok', 'twitter', 'youtube']);
      if (typeof body.postId !== 'string' || !body.postId.trim() || typeof body.comment !== 'string' || !body.comment.trim() || !commentPlatforms.has(body.platform)) {
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
    return providerResponseError(error, res);
  }
};