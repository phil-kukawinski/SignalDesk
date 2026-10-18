const crypto = require('node:crypto');
const { assertPublicUrl } = require('./core');

// Direct connections to the official Facebook/Instagram (Meta), LinkedIn, and Pinterest APIs.
// Each adapter signs in, lists the accounts a person can publish to, publishes, and
// comments. Errors are thrown as PublishError so the queue knows whether to retry.

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0';
const LINKEDIN_VERSION = process.env.LINKEDIN_API_VERSION || '202607';
const REQUEST_TIMEOUT_MS = 25000;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const VIDEO_PATTERN = /\.(mp4|mov|m4v|webm)(?:[?#]|$)/i;

const DIRECT_PLATFORMS = { facebook: 'meta', instagram: 'meta', linkedin: 'linkedin', pinterest: 'pinterest' };

class PublishError extends Error {
  // kind: auth (reconnect needed), rate_limit and temporary (retry), invalid (fix the post), unknown (may have posted)
  constructor(kind, message, extra = {}) {
    super(message);
    this.kind = kind;
    Object.assign(this, extra);
  }
}

function redirectUri() {
  const base = (process.env.APP_URL || '').replace(/\/+$/, '');
  if (!base.startsWith('https://') && !base.startsWith('http://localhost')) throw new PublishError('invalid', 'Set APP_URL to your SignalDesk address before connecting accounts.');
  return `${base}/api/oauth`;
}

function providerConfigured(provider) {
  if (provider === 'meta') return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
  if (provider === 'linkedin') return Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
  if (provider === 'pinterest') return Boolean(process.env.PINTEREST_APP_ID && process.env.PINTEREST_APP_SECRET);
  return false;
}

// An image description for networks that accept one, when the post has it.
function altParam(content, url, name) {
  const text = content.alt?.[url];
  return text ? { [name]: text.slice(0, 1000) } : {};
}

function mediaKind(url) {
  return VIDEO_PATTERN.test(url) ? 'video' : 'image';
}

function firstLink(text) {
  return (String(text || '').match(/https?:\/\/[^\s<>"')\]]+/) || [])[0] || '';
}

function firstLine(text, max) {
  const line = String(text || '').split('\n').map((item) => item.replace(/https?:\/\/\S+/g, '').trim()).find(Boolean) || '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

async function request(url, options = {}, { sending = false } = {}) {
  let response;
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    // A timeout on the request that creates the post may mean it went through anyway.
    const timedOut = error.name === 'TimeoutError';
    throw new PublishError(sending && timedOut ? 'unknown' : 'temporary', timedOut ? 'The network took too long to respond.' : 'Could not reach the network.');
  }
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text.slice(0, 300) }; }
  return { response, body };
}

function httpKind(status) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'temporary';
  return 'invalid';
}

// --- Meta: Facebook Pages and Instagram professional accounts ---

const META_SCOPES = [
  'pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'pages_manage_engagement', 'read_insights',
  'instagram_basic', 'instagram_content_publish', 'instagram_manage_comments', 'instagram_manage_insights', 'business_management'
];

function appSecretProof(token) {
  return crypto.createHmac('sha256', process.env.META_APP_SECRET).update(token).digest('hex');
}

function metaError(body, status) {
  const error = body.error || {};
  const code = Number(error.code);
  const message = error.error_user_msg || error.message || `Meta returned HTTP ${status}.`;
  if (code === 190 || code === 102 || code === 10 || (code >= 200 && code < 300)) return new PublishError('auth', message);
  if ([4, 17, 32, 613].includes(code) || (code >= 80000 && code < 80100) || error.error_subcode === 2207042) return new PublishError('rate_limit', message);
  if (error.is_transient || code === 1 || code === 2 || status >= 500) return new PublishError('temporary', message);
  return new PublishError('invalid', message);
}

async function graph(path, { method = 'GET', token, params = {}, sending = false } = {}) {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${path.replace(/^\//, '')}`);
  const auth = token ? { access_token: token, appsecret_proof: appSecretProof(token) } : {};
  let options;
  if (method === 'GET') {
    Object.entries({ ...params, ...auth }).forEach(([key, value]) => url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : value));
    options = { method };
  } else {
    options = { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...params, ...auth }) };
  }
  const { response, body } = await request(url, options, { sending });
  if (!response.ok || body.error) throw metaError(body, response.status);
  return body;
}

const meta = {
  authorizeUrl(state) {
    const url = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`);
    url.searchParams.set('client_id', process.env.META_APP_ID);
    url.searchParams.set('redirect_uri', redirectUri());
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    // Apps set up with Facebook Login for Business use a configuration ID instead of scopes.
    if (process.env.META_LOGIN_CONFIG_ID) url.searchParams.set('config_id', process.env.META_LOGIN_CONFIG_ID);
    else url.searchParams.set('scope', META_SCOPES.join(','));
    return url.href;
  },

  async exchange(code) {
    const short = await graph('oauth/access_token', { params: { client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, redirect_uri: redirectUri(), code } });
    const long = await graph('oauth/access_token', { params: { grant_type: 'fb_exchange_token', client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, fb_exchange_token: short.access_token } });
    // The app-scoped user ID lets Meta's data deletion callback find this person's connections.
    const me = await graph('me', { token: long.access_token, params: { fields: 'id' } });
    const pages = await graph('me/accounts', {
      token: long.access_token,
      params: { fields: 'id,name,access_token,link,picture{url},instagram_business_account{id,username,name,profile_picture_url}', limit: '100' }
    });
    const tokens = {};
    const candidates = [];
    for (const page of pages.data || []) {
      if (!page.access_token) continue;
      tokens[page.id] = page.access_token;
      candidates.push({
        key: `facebook:${page.id}`, platform: 'facebook', externalId: page.id, displayName: page.name, metaUserId: me.id,
        profileUrl: page.link || `https://www.facebook.com/${page.id}`, imageUrl: page.picture?.data?.url || '', tokenRef: page.id
      });
      const ig = page.instagram_business_account;
      if (ig?.id) {
        candidates.push({
          key: `instagram:${ig.id}`, platform: 'instagram', externalId: ig.id, displayName: ig.name || ig.username, username: ig.username || '', metaUserId: me.id,
          profileUrl: ig.username ? `https://www.instagram.com/${ig.username}/` : '', imageUrl: ig.profile_picture_url || '', tokenRef: page.id,
          note: `Linked to the ${page.name} Page`
        });
      }
    }
    // Page tokens made from a long-lived user token don't expire unless access is revoked.
    return { candidates, secret: { tokens } };
  },

  connectionFor(candidate, secret) {
    const token = secret.tokens?.[candidate.tokenRef];
    if (!token) throw new PublishError('auth', 'That account is no longer available. Sign in again.');
    const meta = candidate.metaUserId ? { metaUserId: candidate.metaUserId } : {};
    if (candidate.platform === 'instagram') meta.pageId = candidate.tokenRef;
    return { token, refreshToken: null, expiresAt: null, refreshExpiresAt: null, meta };
  },

  async publish(ctx) {
    return ctx.job.platform === 'instagram' ? publishInstagram(ctx) : publishFacebook(ctx);
  },

  async comment({ connection, externalId, text }) {
    const result = await graph(`${externalId}/comments`, { method: 'POST', token: connection.token, params: { message: text } });
    return { id: result.id };
  },

  async listComments({ connection, job }) {
    if (job.platform === 'instagram') {
      const result = await graph(`${job.external_id}/comments`, { token: connection.token, params: { fields: 'id,text,username,timestamp,replies{id,text,username,timestamp}', limit: '50' } });
      const shape = (item) => ({ id: item.id, author: item.username ? `@${item.username}` : 'Instagram user', text: item.text || '', at: item.timestamp || null });
      return (result.data || []).map((item) => ({ ...shape(item), replies: (item.replies?.data || []).map(shape) }));
    }
    const result = await graph(`${job.external_id}/comments`, { token: connection.token, params: { fields: 'id,message,from{name},created_time,comments.limit(20){id,message,from{name},created_time}', limit: '50', order: 'reverse_chronological' } });
    const shape = (item) => ({ id: item.id, author: item.from?.name || 'Facebook user', text: item.message || '', at: item.created_time || null });
    return (result.data || []).map((item) => ({ ...shape(item), replies: (item.comments?.data || []).map(shape) }));
  },

  async reply({ connection, job, commentId, text }) {
    const path = job.platform === 'instagram' ? `${commentId}/replies` : `${commentId}/comments`;
    const result = await graph(path, { method: 'POST', token: connection.token, params: { message: text } });
    return { id: result.id };
  },

  async metrics({ connection, job }) {
    if (job.platform === 'instagram') {
      const insights = await graph(`${job.external_id}/insights`, { token: connection.token, params: { metric: 'views,reach,likes,comments,shares,saved,total_interactions' } });
      const value = (name) => insights.data?.find((item) => item.name === name)?.values?.[0]?.value ?? null;
      return { views: value('views'), reach: value('reach'), likes: value('likes'), comments: value('comments'), shares: value('shares'), saves: value('saved'), engagements: value('total_interactions') };
    }
    const post = await graph(job.external_id, { token: connection.token, params: { fields: 'reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares' } });
    const metrics = { likes: post.reactions?.summary?.total_count ?? null, comments: post.comments?.summary?.total_count ?? null, shares: post.shares?.count ?? 0 };
    // Page insight metrics change often, so reach is a best-effort extra.
    try {
      const insights = await graph(`${job.external_id}/insights`, { token: connection.token, params: { metric: 'post_impressions_unique' } });
      metrics.reach = insights.data?.[0]?.values?.[0]?.value ?? null;
    } catch { /* keep the counts we have */ }
    return metrics;
  }
};

async function publishFacebook({ connection, job, content, stage, saveStage, markSent }) {
  const page = connection.external_id;
  const images = content.media.filter((url) => mediaKind(url) === 'image');
  const videos = content.media.filter((url) => mediaKind(url) === 'video');
  if (videos.length && (videos.length > 1 || images.length)) throw new PublishError('invalid', 'Facebook posts can include one video or several images, not both.');
  if (videos.length) {
    await markSent();
    const result = await graph(`${page}/videos`, { method: 'POST', token: connection.token, params: { file_url: videos[0], description: content.text }, sending: true });
    return { externalId: result.id, url: `https://www.facebook.com/${page}/videos/${result.id}` };
  }
  if (images.length === 1) {
    await markSent();
    const result = await graph(`${page}/photos`, { method: 'POST', token: connection.token, params: { url: images[0], message: content.text, ...altParam(content, images[0], 'alt_text_custom') }, sending: true });
    const id = result.post_id || result.id;
    return { externalId: id, url: `https://www.facebook.com/${id}` };
  }
  let photoIds = stage.photoIds || [];
  if (images.length > 1 && photoIds.length !== images.length) {
    // Unpublished photos are uploaded first, then attached to a single post.
    photoIds = [];
    for (const url of images) photoIds.push((await graph(`${page}/photos`, { method: 'POST', token: connection.token, params: { url, published: false, ...altParam(content, url, 'alt_text_custom') } })).id);
    await saveStage({ photoIds });
  }
  await markSent();
  const params = { message: content.text };
  if (photoIds.length) params.attached_media = photoIds.map((id) => ({ media_fbid: id }));
  const result = await graph(`${page}/feed`, { method: 'POST', token: connection.token, params, sending: true });
  return { externalId: result.id, url: `https://www.facebook.com/${result.id}` };
}

const IG_PROCESSING_LIMIT_MS = 30 * 60000;

async function publishInstagram({ connection, job, content, options, stage, saveStage, markSent }) {
  const account = connection.external_id;
  const media = content.media.slice(0, 10);
  if (!media.length) throw new PublishError('invalid', 'Instagram posts need an image or video.');
  if (content.text.length > 2200) throw new PublishError('invalid', 'Instagram captions can be up to 2,200 characters.');
  const instagram = options.instagramOptions || {};
  let containers = stage.containers;
  if (!containers) {
    const create = (params) => graph(`${account}/media`, { method: 'POST', token: connection.token, params }).then((result) => result.id);
    const tags = (withPosition) => (instagram.userTags || []).map((tag) => (withPosition ? { username: tag.username, x: tag.x ?? 0.5, y: tag.y ?? 0.9 } : { username: tag.username }));
    const collaborators = instagram.collaborators?.length ? { collaborators: instagram.collaborators } : {};
    if (media.length === 1) {
      const video = mediaKind(media[0]) === 'video';
      const params = video
        ? { media_type: 'REELS', video_url: media[0], caption: content.text, share_to_feed: true, ...collaborators }
        : { image_url: media[0], caption: content.text, ...collaborators, ...altParam(content, media[0], 'alt_text') };
      if (instagram.userTags?.length) params.user_tags = tags(!video);
      const id = await create(params);
      containers = { parent: id, children: [] };
    } else {
      const children = [];
      for (const [index, url] of media.entries()) {
        const video = mediaKind(url) === 'video';
        const params = video ? { media_type: 'VIDEO', video_url: url, is_carousel_item: true } : { image_url: url, is_carousel_item: true, ...altParam(content, url, 'alt_text') };
        if (index === 0 && !video && instagram.userTags?.length) params.user_tags = tags(true);
        children.push(await create(params));
      }
      const parent = await create({ media_type: 'CAROUSEL', children: children.join(','), caption: content.text, ...collaborators });
      containers = { parent, children };
    }
    stage = { ...stage, containers, processingSince: new Date().toISOString() };
    await saveStage(stage);
  }
  // Videos take a while to process; come back on a later run instead of waiting here.
  for (const id of [...containers.children, containers.parent]) {
    const status = await graph(id, { token: connection.token, params: { fields: 'status_code,status' } });
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
      await saveStage({ ...stage, containers: null });
      throw new PublishError('invalid', `Instagram couldn't process the media${status.status ? `: ${status.status}` : '.'}`);
    }
    if (status.status_code && status.status_code !== 'FINISHED' && status.status_code !== 'PUBLISHED') {
      if (Date.now() - Date.parse(stage.processingSince) > IG_PROCESSING_LIMIT_MS) throw new PublishError('invalid', 'Instagram was still processing the media after 30 minutes.');
      return { pending: true, retryInSeconds: 60 };
    }
  }
  await markSent();
  const published = await graph(`${account}/media_publish`, { method: 'POST', token: connection.token, params: { creation_id: containers.parent }, sending: true });
  let url = '';
  try { url = (await graph(published.id, { token: connection.token, params: { fields: 'permalink' } })).permalink || ''; } catch { /* the post is live either way */ }
  return { externalId: published.id, url };
}

// --- LinkedIn: personal profiles and Pages ---

function linkedInHeaders(token, extra = {}) {
  return { authorization: `Bearer ${token}`, 'linkedin-version': LINKEDIN_VERSION, 'x-restli-protocol-version': '2.0.0', ...extra };
}

async function linkedIn(path, { method = 'GET', token, body, sending = false } = {}) {
  const url = path.startsWith('https://') ? path : `https://api.linkedin.com/rest/${path.replace(/^\//, '')}`;
  const { response, body: payload } = await request(url, {
    method,
    headers: linkedInHeaders(token, body ? { 'content-type': 'application/json' } : {}),
    ...(body ? { body: JSON.stringify(body) } : {})
  }, { sending });
  if (!response.ok) throw new PublishError(httpKind(response.status), payload.message || `LinkedIn returned HTTP ${response.status}.`);
  return { payload, headers: response.headers };
}

function linkedInScopes() {
  if (process.env.LINKEDIN_SCOPES) return process.env.LINKEDIN_SCOPES;
  const base = ['openid', 'profile', 'w_member_social'];
  // Posting as a company Page needs LinkedIn's Community Management API product.
  if (process.env.LINKEDIN_ORGANIZATIONS === 'true') base.push('r_organization_admin', 'w_organization_social', 'r_organization_social');
  return base.join(' ');
}

// LinkedIn's "little text" format treats these characters as markup, so they must be escaped.
function linkedInCommentary(text) {
  const tags = [];
  const withTokens = String(text).replace(/(^|\s)#([\p{L}\p{N}_]+)/gu, (match, space, tag) => {
    tags.push(tag);
    return `${space}\u0000${tags.length - 1}\u0000`;
  });
  const escaped = withTokens.replace(/[\\|{}@[\]()<>#*_~]/g, (char) => `\\${char}`);
  return escaped.replace(/\u0000(\d+)\u0000/g, (match, index) => `{hashtag|\\#|${tags[Number(index)]}}`);
}

async function tokenRequest(url, params, headers = {}) {
  const { response, body } = await request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(params).toString()
  });
  if (!response.ok || !body.access_token) {
    throw new PublishError(response.status >= 500 ? 'temporary' : 'auth', body.error_description || body.message || body.error || 'Sign-in was not accepted.');
  }
  return body;
}

function expiresAt(seconds) {
  return Number(seconds) > 0 ? new Date(Date.now() + Number(seconds) * 1000).toISOString() : null;
}

// Downloads media for networks that need the file itself, following redirects only to public hosts.
async function downloadMedia(url) {
  let target = url;
  let response;
  for (let hop = 0; hop < 4; hop += 1) {
    let checked;
    try { checked = await assertPublicUrl(target, 'Media links'); } catch (error) { throw new PublishError('invalid', error.message); }
    try {
      response = await fetch(checked, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), redirect: 'manual' });
    } catch {
      throw new PublishError('temporary', 'Could not download the media to upload it.');
    }
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) { target = new URL(location, checked).href; continue; }
    break;
  }
  if (!response.ok) throw new PublishError('invalid', `The media link returned HTTP ${response.status}.`);
  if (Number(response.headers.get('content-length')) > MAX_UPLOAD_BYTES) throw new PublishError('invalid', 'Media must be 20 MB or smaller.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_UPLOAD_BYTES) throw new PublishError('invalid', 'Media must be 20 MB or smaller.');
  return { bytes, type: response.headers.get('content-type') || 'application/octet-stream' };
}

const LINKEDIN_VISIBILITY = { public: 'PUBLIC', connections: 'CONNECTIONS', loggedin: 'LOGGED_IN' };

const linkedin = {
  authorizeUrl(state) {
    const url = new URL('https://www.linkedin.com/oauth/v2/authorization');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', process.env.LINKEDIN_CLIENT_ID);
    url.searchParams.set('redirect_uri', redirectUri());
    url.searchParams.set('state', state);
    url.searchParams.set('scope', linkedInScopes());
    return url.href;
  },

  async exchange(code) {
    const token = await tokenRequest('https://www.linkedin.com/oauth/v2/accessToken', {
      grant_type: 'authorization_code', code, redirect_uri: redirectUri(),
      client_id: process.env.LINKEDIN_CLIENT_ID, client_secret: process.env.LINKEDIN_CLIENT_SECRET
    });
    const { response, body: me } = await request('https://api.linkedin.com/v2/userinfo', { headers: { authorization: `Bearer ${token.access_token}` } });
    if (!response.ok || !me.sub) throw new PublishError('auth', 'LinkedIn did not share your profile. Make sure the app has "Sign In with LinkedIn using OpenID Connect".');
    const candidates = [{
      key: `linkedin:urn:li:person:${me.sub}`, platform: 'linkedin', externalId: `urn:li:person:${me.sub}`,
      displayName: me.name || 'Your LinkedIn profile', imageUrl: me.picture || '', profileUrl: '', kind: 'member', note: 'Your personal profile'
    }];
    const granted = String(token.scope || '').split(/[\s,]+/);
    if (granted.includes('w_organization_social')) {
      try {
        const { payload } = await linkedIn('organizationAcls?q=roleAssignee&state=APPROVED&count=50', { token: token.access_token });
        const orgs = (payload.elements || []).filter((item) => ['ADMINISTRATOR', 'CONTENT_ADMINISTRATOR', 'DIRECT_SPONSORED_CONTENT_POSTER'].includes(item.role) || !item.role);
        for (const urn of [...new Set(orgs.map((item) => item.organization).filter(Boolean))].slice(0, 20)) {
          const id = urn.split(':').pop();
          let org = {};
          try { org = (await linkedIn(`organizations/${id}`, { token: token.access_token })).payload; } catch { /* fall back to the ID */ }
          candidates.push({
            key: `linkedin:${urn}`, platform: 'linkedin', externalId: urn, displayName: org.localizedName || `Organization ${id}`,
            profileUrl: `https://www.linkedin.com/company/${org.vanityName || id}/`, imageUrl: '', kind: 'organization', note: 'Company Page'
          });
        }
      } catch (error) {
        console.error('LinkedIn organization lookup failed:', error.message);
      }
    }
    return {
      candidates,
      secret: { token: token.access_token, refreshToken: token.refresh_token || null, expiresAt: expiresAt(token.expires_in), refreshExpiresAt: expiresAt(token.refresh_token_expires_in) }
    };
  },

  connectionFor(candidate, secret) {
    return { token: secret.token, refreshToken: secret.refreshToken, expiresAt: secret.expiresAt, refreshExpiresAt: secret.refreshExpiresAt, meta: { kind: candidate.kind } };
  },

  async refresh(connection) {
    const token = await tokenRequest('https://www.linkedin.com/oauth/v2/accessToken', {
      grant_type: 'refresh_token', refresh_token: connection.refreshToken,
      client_id: process.env.LINKEDIN_CLIENT_ID, client_secret: process.env.LINKEDIN_CLIENT_SECRET
    });
    return { token: token.access_token, refreshToken: token.refresh_token || connection.refreshToken, expiresAt: expiresAt(token.expires_in), refreshExpiresAt: expiresAt(token.refresh_token_expires_in) || connection.refresh_expires_at };
  },

  async publish({ connection, content, options, stage, saveStage, markSent }) {
    const author = connection.external_id;
    const organization = author.startsWith('urn:li:organization:');
    const images = content.media.filter((url) => mediaKind(url) === 'image');
    if (content.media.some((url) => mediaKind(url) === 'video')) throw new PublishError('invalid', 'Video posts to LinkedIn aren’t supported by direct publishing yet. Use an image or post the video on LinkedIn.');
    if (images.length > 20) throw new PublishError('invalid', 'LinkedIn posts can include up to 20 images.');
    if (content.text.length > 3000) throw new PublishError('invalid', 'LinkedIn posts can be up to 3,000 characters.');
    const visibility = LINKEDIN_VISIBILITY[options.linkedin?.visibility] || 'PUBLIC';
    if (organization && visibility === 'CONNECTIONS') throw new PublishError('invalid', 'Company Pages can’t post to connections only. Choose Public.');
    let imageUrns = stage.imageUrns || [];
    if (images.length && imageUrns.length !== images.length) {
      imageUrns = [];
      for (const url of images) {
        const file = await downloadMedia(url);
        const { payload } = await linkedIn('images?action=initializeUpload', { method: 'POST', token: connection.token, body: { initializeUploadRequest: { owner: author } } });
        const upload = await request(payload.value.uploadUrl, { method: 'PUT', headers: { authorization: `Bearer ${connection.token}`, 'content-type': file.type }, body: file.bytes });
        if (!upload.response.ok) throw new PublishError(httpKind(upload.response.status), 'LinkedIn did not accept the image upload.');
        imageUrns.push(payload.value.image);
      }
      await saveStage({ imageUrns });
    }
    const body = {
      author,
      commentary: linkedInCommentary(content.text),
      visibility,
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false
    };
    const withAlt = (id, index) => ({ id, ...(content.alt?.[images[index]] ? { altText: content.alt[images[index]].slice(0, 4086) } : {}) });
    if (imageUrns.length === 1) body.content = { media: withAlt(imageUrns[0], 0) };
    else if (imageUrns.length > 1) body.content = { multiImage: { images: imageUrns.map(withAlt) } };
    else if (firstLink(content.text)) {
      const link = firstLink(content.text);
      body.content = { article: { source: link, title: firstLine(content.text, 200) || new URL(link).hostname } };
    }
    await markSent();
    const { headers } = await linkedIn('posts', { method: 'POST', token: connection.token, body, sending: true });
    const urn = headers.get('x-restli-id') || headers.get('x-linkedin-id') || '';
    return { externalId: urn, url: urn ? `https://www.linkedin.com/feed/update/${urn}/` : '' };
  },

  async comment({ connection, externalId, text }) {
    const { headers } = await linkedIn(`socialActions/${encodeURIComponent(externalId)}/comments`, {
      method: 'POST', token: connection.token, body: { actor: connection.external_id, object: externalId, message: { text } }
    });
    return { id: headers.get('x-restli-id') || '' };
  },

  async listComments({ connection, job }) {
    const { payload } = await linkedIn(`socialActions/${encodeURIComponent(job.external_id)}/comments?count=50`, { token: connection.token });
    // LinkedIn returns member IDs, not names, without extra profile permissions.
    return (payload.elements || []).map((item) => ({
      id: item.$URN || item.commentUrn || item.id, text: item.message?.text || '',
      author: item.actor === connection.external_id ? 'You' : 'LinkedIn member', at: item.created?.time ? new Date(item.created.time).toISOString() : null, replies: []
    }));
  },

  async reply({ connection, job, commentId, text }) {
    const { headers } = await linkedIn(`socialActions/${encodeURIComponent(job.external_id)}/comments`, {
      method: 'POST', token: connection.token, body: { actor: connection.external_id, object: job.external_id, parentComment: commentId, message: { text } }
    });
    return { id: headers.get('x-restli-id') || '' };
  },

  async metrics({ connection, job }) {
    const { payload } = await linkedIn(`socialActions/${encodeURIComponent(job.external_id)}`, { token: connection.token });
    return { likes: payload.likesSummary?.totalLikes ?? null, comments: payload.commentsSummary?.aggregatedTotalComments ?? payload.commentsSummary?.totalFirstLevelComments ?? null };
  }
};

// --- Pinterest ---

function pinterestBase() {
  // Apps with trial access can test against Pinterest's sandbox.
  return process.env.PINTEREST_SANDBOX === 'true' ? 'https://api-sandbox.pinterest.com/v5' : 'https://api.pinterest.com/v5';
}

function pinterestBasicAuth() {
  return `Basic ${Buffer.from(`${process.env.PINTEREST_APP_ID}:${process.env.PINTEREST_APP_SECRET}`).toString('base64')}`;
}

async function pinterestApi(path, { method = 'GET', token, body, sending = false, base = pinterestBase() } = {}) {
  const { response, body: payload } = await request(`${base}/${path.replace(/^\//, '')}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  }, { sending });
  if (!response.ok) throw new PublishError(httpKind(response.status), payload.message || `Pinterest returned HTTP ${response.status}.`);
  return payload;
}

const pinterest = {
  authorizeUrl(state) {
    const url = new URL('https://www.pinterest.com/oauth/');
    url.searchParams.set('client_id', process.env.PINTEREST_APP_ID);
    url.searchParams.set('redirect_uri', redirectUri());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'boards:read,pins:read,pins:write,user_accounts:read');
    url.searchParams.set('state', state);
    return url.href;
  },

  async exchange(code) {
    const token = await tokenRequest('https://api.pinterest.com/v5/oauth/token', { grant_type: 'authorization_code', code, redirect_uri: redirectUri() }, { authorization: pinterestBasicAuth() });
    const account = await pinterestApi('user_account', { token: token.access_token, base: 'https://api.pinterest.com/v5' });
    const boards = await pinterestApi('boards?page_size=100', { token: token.access_token });
    const boardList = (boards.items || []).map((board) => ({ id: board.id, name: board.name }));
    return {
      candidates: [{
        key: `pinterest:${account.username}`, platform: 'pinterest', externalId: account.username, displayName: account.business_name || account.username,
        username: account.username, profileUrl: `https://www.pinterest.com/${account.username}/`, imageUrl: account.profile_image || '', boards: boardList,
        note: boardList.length ? 'Choose the board new Pins go to' : 'Create a board on Pinterest first'
      }],
      secret: { token: token.access_token, refreshToken: token.refresh_token || null, expiresAt: expiresAt(token.expires_in), refreshExpiresAt: expiresAt(token.refresh_token_expires_in) }
    };
  },

  connectionFor(candidate, secret, selection = {}) {
    const board = (candidate.boards || []).find((item) => item.id === selection.boardId) || candidate.boards?.[0];
    if (!board) throw new PublishError('invalid', 'Create a Pinterest board first, then connect again.');
    return { token: secret.token, refreshToken: secret.refreshToken, expiresAt: secret.expiresAt, refreshExpiresAt: secret.refreshExpiresAt, meta: { boardId: board.id, boardName: board.name, boards: candidate.boards } };
  },

  async refresh(connection) {
    const token = await tokenRequest('https://api.pinterest.com/v5/oauth/token', { grant_type: 'refresh_token', refresh_token: connection.refreshToken }, { authorization: pinterestBasicAuth() });
    return { token: token.access_token, refreshToken: token.refresh_token || connection.refreshToken, expiresAt: expiresAt(token.expires_in), refreshExpiresAt: expiresAt(token.refresh_token_expires_in) || connection.refresh_expires_at };
  },

  async publish({ connection, content, options, markSent }) {
    const images = content.media.filter((url) => mediaKind(url) === 'image');
    if (content.media.some((url) => mediaKind(url) === 'video')) throw new PublishError('invalid', 'Video Pins aren’t supported by direct publishing yet. Use an image.');
    if (!images.length) throw new PublishError('invalid', 'Pins need an image.');
    if (images.length > 5) throw new PublishError('invalid', 'Pins can include up to 5 images.');
    const pin = options.pinterest || {};
    const boardId = pin.boardId || connection.meta?.boardId;
    if (!boardId) throw new PublishError('invalid', 'Choose a Pinterest board for this Pin.');
    const link = pin.link || firstLink(content.text);
    const body = {
      board_id: boardId,
      title: (pin.title || firstLine(content.text, 100)).slice(0, 100),
      description: content.text.slice(0, 800),
      media_source: images.length === 1 ? { source_type: 'image_url', url: images[0] } : { source_type: 'multiple_image_urls', items: images.map((url) => ({ url })) }
    };
    if (link) body.link = link;
    if (content.alt?.[images[0]]) body.alt_text = content.alt[images[0]].slice(0, 500);
    await markSent();
    const result = await pinterestApi('pins', { method: 'POST', token: connection.token, body, sending: true });
    return { externalId: result.id, url: `https://www.pinterest.com/pin/${result.id}/` };
  },

  async metrics({ connection, job }) {
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Math.max(Date.parse(job.published_at || end), Date.now() - 89 * 86400000)).toISOString().slice(0, 10);
    const result = await pinterestApi(`pins/${encodeURIComponent(job.external_id)}/analytics?start_date=${start}&end_date=${end}&metric_types=IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK,TOTAL_COMMENTS,TOTAL_REACTIONS`, { token: connection.token });
    const summary = result.all?.summary_metrics || result.all?.lifetime_metrics || {};
    const clicks = [summary.PIN_CLICK, summary.OUTBOUND_CLICK].filter((value) => typeof value === 'number');
    return { views: summary.IMPRESSION ?? null, saves: summary.SAVE ?? null, clicks: clicks.length ? clicks.reduce((a, b) => a + b, 0) : null, comments: summary.TOTAL_COMMENTS ?? null, likes: summary.TOTAL_REACTIONS ?? null };
  }
};

const PROVIDERS = { meta, linkedin, pinterest };
const COMMENTABLE = new Set(['facebook', 'instagram', 'linkedin']);

function adapterFor(platform) {
  return PROVIDERS[DIRECT_PLATFORMS[platform]];
}

module.exports = {
  DIRECT_PLATFORMS, PROVIDERS, COMMENTABLE, PublishError, providerConfigured, adapterFor, mediaKind, linkedInCommentary, redirectUri
};
