// Direct posting to Bluesky and Mastodon. Neither needs a SignalDesk developer app: Bluesky connects
// with the account's handle and an app password (Settings → Privacy and security → App passwords),
// and Mastodon with an access token the person creates on their server (Preferences → Development).
// Same adapter shape as networks.js, plus login(credentials) in place of the OAuth steps.

const BSKY_PUBLIC = 'https://public.api.bsky.app/xrpc';
const BSKY_ENTRY = 'https://bsky.social/xrpc';
const BSKY_IMAGE_BYTES = 1000000;
const BSKY_ACCESS_MS = 90 * 60000;

module.exports = function fediverse({ request, PublishError, httpKind, downloadMedia, mediaKind, assertPublicUrl }) {
  async function call(url, { method = 'GET', token, json, bytes, type, headers = {}, sending = false, name }) {
    const { response, body } = await request(url, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(json ? { 'content-type': 'application/json' } : {}), ...(bytes ? { 'content-type': type || 'application/octet-stream' } : {}), ...headers },
      ...(json ? { body: JSON.stringify(json) } : bytes ? { body: bytes } : {})
    }, { sending });
    if (!response.ok) {
      const detail = body?.message || body?.error_description || (typeof body?.error === 'string' ? body.error : '') || '';
      const expired = /ExpiredToken|InvalidToken/i.test(`${body?.error || ''}`);
      throw new PublishError(expired ? 'auth' : httpKind(response.status), `${name}: ${detail || `HTTP ${response.status}`}`);
    }
    return body;
  }

  // ------------------------------------------------------------------ Bluesky (AT Protocol)
  // Where an account lives: its handle points to a DID, and the DID document names its server (PDS).
  async function bskyServer(handle) {
    const { did } = await call(`${BSKY_ENTRY}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`, { name: 'Bluesky' });
    if (!/^did:(plc|web):[\w.:%-]+$/.test(did || '')) throw new PublishError('invalid', 'Bluesky: that handle didn’t resolve to an account.');
    const doc = did.startsWith('did:plc:')
      ? await call(`https://plc.directory/${did}`, { name: 'Bluesky' })
      : await call(`https://${did.slice('did:web:'.length).replace(/%3A/gi, ':')}/.well-known/did.json`, { name: 'Bluesky' });
    const endpoint = (doc.service || []).find((item) => String(item.id).endsWith('#atproto_pds'))?.serviceEndpoint;
    if (!/^https:\/\//.test(endpoint || '')) throw new PublishError('invalid', 'Bluesky: couldn’t find the account’s server.');
    await assertPublicUrl(endpoint, 'Bluesky servers');
    return { did, pds: endpoint.replace(/\/+$/, '') };
  }

  const bskyExpiry = () => new Date(Date.now() + BSKY_ACCESS_MS).toISOString();

  // Links and #hashtags become rich text: positions are counted in UTF-8 bytes.
  function bskyFacets(text) {
    const facets = [];
    const bytePos = (index) => Buffer.byteLength(text.slice(0, index), 'utf8');
    for (const match of text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
      const url = match[0].replace(/[.,!?;:]+$/, '');
      facets.push({ index: { byteStart: bytePos(match.index), byteEnd: bytePos(match.index + url.length) }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }] });
    }
    for (const match of text.matchAll(/(^|\s)(#[\p{L}\p{N}_]{1,64})/gu)) {
      const start = match.index + match[1].length, tag = match[2];
      if (/^#\d+$/.test(tag)) continue;
      facets.push({ index: { byteStart: bytePos(start), byteEnd: bytePos(start + tag.length) }, features: [{ $type: 'app.bsky.richtext.facet#tag', tag: tag.slice(1) }] });
    }
    return facets;
  }

  // Bluesky takes images up to about 1 MB; bigger ones are re-encoded as JPEG, getting smaller until they fit.
  async function bskyImage(bytes, type) {
    if (bytes.length <= BSKY_IMAGE_BYTES && /^image\/(jpeg|png|webp|gif)$/.test(type)) return { bytes, type };
    const sharp = require('sharp');
    for (const [width, quality] of [[2000, 85], [1600, 80], [1280, 75], [1000, 70], [800, 65]]) {
      const out = await sharp(bytes, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' }).resize({ width, withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
      if (out.length <= BSKY_IMAGE_BYTES) return { bytes: out, type: 'image/jpeg' };
    }
    throw new PublishError('invalid', 'Bluesky: an image is too large even after shrinking it.');
  }

  const bluesky = {
    async login({ handle, password }) {
      const clean = String(handle || '').trim().replace(/^@/, '').toLowerCase();
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(clean)) throw new PublishError('invalid', 'Enter the full handle, like yourname.bsky.social.');
      if (!/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i.test(String(password || '').trim())) throw new PublishError('invalid', 'Use an app password (it looks like xxxx-xxxx-xxxx-xxxx), not your main password. Make one in Bluesky under Settings → Privacy and security → App passwords.');
      const { did, pds } = await bskyServer(clean);
      const session = await call(`${pds}/xrpc/com.atproto.server.createSession`, { method: 'POST', json: { identifier: did, password: String(password).trim() }, name: 'Bluesky' });
      const profile = await call(`${BSKY_PUBLIC}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`, { name: 'Bluesky' }).catch(() => ({}));
      return {
        candidate: { key: `bluesky:${did}`, platform: 'bluesky', externalId: did, displayName: profile.displayName || session.handle, username: session.handle, profileUrl: `https://bsky.app/profile/${session.handle}`, imageUrl: profile.avatar || '' },
        connection: { token: session.accessJwt, refreshToken: session.refreshJwt, expiresAt: bskyExpiry(), refreshExpiresAt: new Date(Date.now() + 60 * 86400000).toISOString(), meta: { pds, did } }
      };
    },
    async refresh(connection) {
      const pds = connection.meta?.pds || 'https://bsky.social';
      const session = await call(`${pds}/xrpc/com.atproto.server.refreshSession`, { method: 'POST', token: connection.refreshToken, name: 'Bluesky' });
      return { token: session.accessJwt, refreshToken: session.refreshJwt || connection.refreshToken, expiresAt: bskyExpiry(), refreshExpiresAt: new Date(Date.now() + 60 * 86400000).toISOString() };
    },
    async publish({ connection, content, stage, saveStage, markSent }) {
      const text = content.text || '';
      if ([...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)].length > 300) throw new PublishError('invalid', 'Bluesky posts can be up to 300 characters.');
      if (!text.trim() && !content.media.length) throw new PublishError('invalid', 'Write something to post on Bluesky.');
      if (content.media.some((url) => mediaKind(url) === 'video')) throw new PublishError('invalid', 'Bluesky video isn’t supported from SignalDesk yet. Post images, or use a reminder for this one.');
      const pds = connection.meta?.pds || 'https://bsky.social', did = connection.meta?.did || connection.external_id;
      let images = stage.bskyImages;
      if (!images) {
        images = [];
        for (const url of content.media.slice(0, 4)) {
          const file = await downloadMedia(url, { maxBytes: 20 * 1024 * 1024 });
          const ready = await bskyImage(file.bytes, String(file.type).split(';')[0]);
          const { blob } = await call(`${pds}/xrpc/com.atproto.repo.uploadBlob`, { method: 'POST', token: connection.token, bytes: ready.bytes, type: ready.type, name: 'Bluesky image upload' });
          images.push({ image: blob, alt: String(content.alt?.[url] || '').slice(0, 2000) });
        }
        await saveStage({ bskyImages: images });
      }
      const facets = bskyFacets(text);
      const record = { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString(), langs: ['en'], ...(facets.length ? { facets } : {}), ...(images.length ? { embed: { $type: 'app.bsky.embed.images', images } } : {}) };
      await markSent();
      const created = await call(`${pds}/xrpc/com.atproto.repo.createRecord`, { method: 'POST', token: connection.token, json: { repo: did, collection: 'app.bsky.feed.post', record }, sending: true, name: 'Bluesky' });
      const rkey = String(created.uri || '').split('/').pop();
      return { externalId: created.uri, url: `https://bsky.app/profile/${connection.username || did}/post/${rkey}` };
    },
    async metrics({ job }) {
      const { posts = [] } = await call(`${BSKY_PUBLIC}/app.bsky.feed.getPosts?uris=${encodeURIComponent(job.external_id)}`, { name: 'Bluesky' });
      const post = posts[0];
      if (!post) return {};
      return { likes: post.likeCount ?? null, comments: post.replyCount ?? null, shares: (post.repostCount ?? 0) + (post.quoteCount ?? 0) };
    }
  };

  // ------------------------------------------------------------------ Mastodon
  const instanceOf = (connection) => connection.meta?.instance;
  const mastodon = {
    async login({ instance, token }) {
      const host = String(instance || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) throw new PublishError('invalid', 'Enter the server name, like mastodon.social.');
      if (!/^[\w-]{20,200}$/.test(String(token || '').trim())) throw new PublishError('invalid', 'Paste the access token from your Mastodon server (Preferences → Development → your app).');
      await assertPublicUrl(`https://${host}/`, 'Mastodon servers');
      const me = await call(`https://${host}/api/v1/accounts/verify_credentials`, { token: String(token).trim(), name: 'Mastodon' });
      return {
        candidate: { key: `mastodon:${host}:${me.id}`, platform: 'mastodon', externalId: `${host}:${me.id}`, displayName: me.display_name || me.username, username: `${me.username}@${host}`, profileUrl: me.url || `https://${host}/@${me.username}`, imageUrl: me.avatar || '' },
        connection: { token: String(token).trim(), refreshToken: null, expiresAt: null, refreshExpiresAt: null, meta: { instance: host } }
      };
    },
    async publish({ connection, content, job, stage, saveStage, markSent }) {
      const host = instanceOf(connection);
      if (!host) throw new PublishError('auth', 'Mastodon: reconnect the account.');
      if ((content.text || '').length > 500) throw new PublishError('invalid', 'Mastodon posts can be up to 500 characters on most servers.');
      if (!content.text.trim() && !content.media.length) throw new PublishError('invalid', 'Write something to post on Mastodon.');
      const media = content.media.slice(0, 4);
      if (media.some((url) => mediaKind(url) === 'video') && media.length > 1) throw new PublishError('invalid', 'Mastodon posts can have one video, or up to 4 images.');
      let ids = stage.mastodonMedia;
      if (!ids) {
        ids = [];
        for (const url of media) {
          const file = await downloadMedia(url, { maxBytes: mediaKind(url) === 'video' ? 99 * 1024 * 1024 : 16 * 1024 * 1024 });
          const form = new FormData();
          form.append('file', new Blob([file.bytes], { type: file.type }), mediaKind(url) === 'video' ? 'video.mp4' : 'image');
          if (content.alt?.[url]) form.append('description', String(content.alt[url]).slice(0, 1500));
          const { response, body } = await request(`https://${host}/api/v2/media`, { method: 'POST', headers: { authorization: `Bearer ${connection.token}` }, body: form });
          if (!response.ok) throw new PublishError(httpKind(response.status), `Mastodon media upload: ${body?.error || `HTTP ${response.status}`}`);
          ids.push(body.id);
        }
        await saveStage({ mastodonMedia: ids });
      }
      // Media still processing has no URL yet; check back shortly.
      for (const id of ids) {
        const item = await call(`https://${host}/api/v1/media/${encodeURIComponent(id)}`, { token: connection.token, name: 'Mastodon media' }).catch(() => ({}));
        if (item && item.id && !item.url) return { pending: true, retryInSeconds: 20 };
      }
      await markSent();
      const status = await call(`https://${host}/api/v1/statuses`, { method: 'POST', token: connection.token, json: { status: content.text, media_ids: ids, visibility: 'public' }, headers: { 'idempotency-key': String(job?.id || stage.idempotencyKey || '') }, sending: true, name: 'Mastodon' });
      return { externalId: `${host}:${status.id}`, url: status.url || '' };
    },
    async metrics({ connection, job }) {
      const [host, id] = String(job.external_id).split(':');
      const status = await call(`https://${host || instanceOf(connection)}/api/v1/statuses/${encodeURIComponent(id)}`, { token: connection.token, name: 'Mastodon' });
      return { likes: status.favourites_count ?? null, comments: status.replies_count ?? null, shares: status.reblogs_count ?? null };
    }
  };

  return { bluesky, mastodon, bskyFacets };
};
