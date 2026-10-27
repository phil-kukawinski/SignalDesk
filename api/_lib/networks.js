const crypto = require('node:crypto');

// Direct connections to X, YouTube, TikTok, and Threads. Each adapter has the same shape as the
// ones in platforms.js: authorizeUrl(state), exchange(code, { state }), connectionFor(candidate,
// secret), refresh(connection), publish(ctx), and optionally metrics(ctx).
// None of these has been run against the live network yet; they follow each network's API docs.

const MAX_VIDEO_BYTES = 250 * 1024 * 1024;

module.exports = function networks({ request, tokenRequest, PublishError, httpKind, redirectUri, downloadMedia, mediaKind, expiresAt, firstLine }) {
  // PKCE without storing anything extra: the verifier is derived from the one-time sign-in state
  // and the server's encryption key, so only this server can recreate it at the callback.
  function pkceVerifier(state) {
    return crypto.createHmac('sha256', process.env.SOCIAL_PROFILE_ENCRYPTION_KEY || 'signaldesk').update(`pkce:${state}`).digest('base64url');
  }
  const pkceChallenge = (state) => crypto.createHash('sha256').update(pkceVerifier(state)).digest('base64url');
  const basic = (id, secret) => `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;

  async function api(url, { method = 'GET', token, body, form, headers = {}, sending = false, name = 'The network' } = {}) {
    const { response, body: payload } = await request(url, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
      ...(body ? { body: JSON.stringify(body) } : form ? { body: form } : {})
    }, { sending });
    if (!response.ok) {
      const detail = payload?.error?.message || payload?.detail || payload?.errors?.[0]?.message || payload?.title || payload?.message || payload?.error_description || (typeof payload?.error === 'string' ? payload.error : '');
      throw new PublishError(httpKind(response.status), `${name}: ${detail || `HTTP ${response.status}`}`);
    }
    return { payload, response };
  }

  // ---------------------------------------------------------------- X (Twitter) — API v2
  const X_API = 'https://api.x.com/2';
  const xAuth = () => basic(process.env.X_CLIENT_ID, process.env.X_CLIENT_SECRET);
  const x = {
    authorizeUrl(state) {
      const url = new URL('https://x.com/i/oauth2/authorize');
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', process.env.X_CLIENT_ID);
      url.searchParams.set('redirect_uri', redirectUri());
      url.searchParams.set('scope', 'tweet.read tweet.write users.read media.write offline.access');
      url.searchParams.set('state', state);
      url.searchParams.set('code_challenge', pkceChallenge(state));
      url.searchParams.set('code_challenge_method', 'S256');
      return url.href;
    },
    async exchange(code, { state }) {
      const token = await tokenRequest(`${X_API}/oauth2/token`, { grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: pkceVerifier(state), client_id: process.env.X_CLIENT_ID }, { authorization: xAuth() });
      const { payload } = await api(`${X_API}/users/me?user.fields=profile_image_url,username,name`, { token: token.access_token, name: 'X' });
      const me = payload.data || {};
      return {
        candidates: [{ key: `twitter:${me.id}`, platform: 'twitter', externalId: me.id, displayName: me.name || me.username, username: me.username || '', profileUrl: me.username ? `https://x.com/${me.username}` : '', imageUrl: me.profile_image_url || '' }],
        secret: { token: token.access_token, refreshToken: token.refresh_token || null, expiresAt: expiresAt(token.expires_in) }
      };
    },
    connectionFor(candidate, secret) {
      return { token: secret.token, refreshToken: secret.refreshToken, expiresAt: secret.expiresAt, refreshExpiresAt: null, meta: {} };
    },
    async refresh(connection) {
      const token = await tokenRequest(`${X_API}/oauth2/token`, { grant_type: 'refresh_token', refresh_token: connection.refreshToken, client_id: process.env.X_CLIENT_ID }, { authorization: xAuth() });
      return { token: token.access_token, refreshToken: token.refresh_token || connection.refreshToken, expiresAt: expiresAt(token.expires_in) };
    },
    async publish({ connection, content, stage, saveStage, markSent }) {
      if (content.text.length > 280) throw new PublishError('invalid', 'X posts can be up to 280 characters.');
      if (!content.text.trim() && !content.media.length) throw new PublishError('invalid', 'Write something to post on X.');
      const media = content.media.slice(0, 4);
      if (media.some((url) => mediaKind(url) === 'video') && media.length > 1) throw new PublishError('invalid', 'X posts can have one video, or up to 4 images.');
      let mediaIds = stage.xMediaIds;
      if (!mediaIds) {
        mediaIds = [];
        for (const url of media) {
          const video = mediaKind(url) === 'video';
          const file = await downloadMedia(url, { maxBytes: video ? 512 * 1024 * 1024 : 5 * 1024 * 1024 });
          if (!video) {
            const form = new FormData();
            form.append('media', new Blob([file.bytes], { type: file.type }), 'image');
            form.append('media_category', 'tweet_image');
            const { payload } = await api(`${X_API}/media/upload`, { method: 'POST', token: connection.token, form, name: 'X media upload' });
            mediaIds.push(payload.data?.id || payload.media_id_string);
            continue;
          }
          const { payload: init } = await api(`${X_API}/media/upload/initialize`, { method: 'POST', token: connection.token, body: { media_type: file.type || 'video/mp4', total_bytes: file.bytes.length, media_category: 'tweet_video' }, name: 'X video upload' });
          const id = init.data?.id;
          const CHUNK = 4 * 1024 * 1024;
          for (let index = 0, offset = 0; offset < file.bytes.length; index += 1, offset += CHUNK) {
            const form = new FormData();
            form.append('media', new Blob([file.bytes.subarray(offset, offset + CHUNK)]), 'chunk');
            form.append('segment_index', String(index));
            await api(`${X_API}/media/upload/${id}/append`, { method: 'POST', token: connection.token, form, name: 'X video upload' });
          }
          await api(`${X_API}/media/upload/${id}/finalize`, { method: 'POST', token: connection.token, name: 'X video upload' });
          mediaIds.push(id);
        }
        await saveStage({ xMediaIds: mediaIds, processingSince: new Date().toISOString() });
      }
      // Videos process before they can be attached.
      for (const id of mediaIds) {
        const { payload } = await api(`${X_API}/media/upload?command=STATUS&media_id=${encodeURIComponent(id)}`, { token: connection.token, name: 'X media' }).catch(() => ({ payload: {} }));
        const state = payload.data?.processing_info?.state;
        if (state === 'failed') { await saveStage({ xMediaIds: null }); throw new PublishError('invalid', 'X couldn’t process the video.'); }
        if (state === 'pending' || state === 'in_progress') return { pending: true, retryInSeconds: Math.max(5, payload.data.processing_info.check_after_secs || 30) };
      }
      await markSent();
      const body = { text: content.text, ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}) };
      const { payload } = await api(`${X_API}/tweets`, { method: 'POST', token: connection.token, body, sending: true, name: 'X' });
      const id = payload.data?.id;
      return { externalId: id, url: connection.username ? `https://x.com/${connection.username}/status/${id}` : `https://x.com/i/web/status/${id}` };
    },
    async metrics({ connection, job }) {
      const { payload } = await api(`${X_API}/tweets/${encodeURIComponent(job.external_id)}?tweet.fields=public_metrics`, { token: connection.token, name: 'X' });
      const m = payload.data?.public_metrics || {};
      return { views: m.impression_count ?? null, likes: m.like_count ?? null, comments: m.reply_count ?? null, shares: (m.retweet_count ?? 0) + (m.quote_count ?? 0), saves: m.bookmark_count ?? null };
    }
  };

  // ---------------------------------------------------------------- YouTube — Data API v3
  const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
  const YT = 'https://www.googleapis.com/youtube/v3';
  const google = {
    authorizeUrl(state) {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID);
      url.searchParams.set('redirect_uri', redirectUri());
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly');
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
      url.searchParams.set('include_granted_scopes', 'true');
      url.searchParams.set('state', state);
      return url.href;
    },
    async exchange(code) {
      const token = await tokenRequest(GOOGLE_TOKEN, { grant_type: 'authorization_code', code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri() });
      const { payload } = await api(`${YT}/channels?part=snippet&mine=true`, { token: token.access_token, name: 'YouTube' });
      const candidates = (payload.items || []).map((channel) => ({
        key: `youtube:${channel.id}`, platform: 'youtube', externalId: channel.id, displayName: channel.snippet?.title || 'YouTube channel',
        username: channel.snippet?.customUrl || '', profileUrl: channel.snippet?.customUrl ? `https://www.youtube.com/${channel.snippet.customUrl}` : `https://www.youtube.com/channel/${channel.id}`,
        imageUrl: channel.snippet?.thumbnails?.default?.url || ''
      }));
      if (!candidates.length) throw new PublishError('invalid', 'That Google account has no YouTube channel. Create one on YouTube first.');
      return { candidates, secret: { token: token.access_token, refreshToken: token.refresh_token || null, expiresAt: expiresAt(token.expires_in) } };
    },
    connectionFor(candidate, secret) {
      if (!secret.refreshToken) throw new PublishError('auth', 'Google didn’t grant offline access. Connect again and allow access.');
      return { token: secret.token, refreshToken: secret.refreshToken, expiresAt: secret.expiresAt, refreshExpiresAt: null, meta: {} };
    },
    async refresh(connection) {
      const token = await tokenRequest(GOOGLE_TOKEN, { grant_type: 'refresh_token', refresh_token: connection.refreshToken, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET });
      return { token: token.access_token, refreshToken: connection.refreshToken, expiresAt: expiresAt(token.expires_in) };
    },
    async publish({ connection, content, options, markSent }) {
      const video = content.media.find((url) => mediaKind(url) === 'video');
      if (!video) throw new PublishError('invalid', 'YouTube posts need a video.');
      const yt = options.youtube || {};
      const title = (yt.title || firstLine(content.text, 100) || 'New video').slice(0, 100);
      const privacy = ['public', 'unlisted', 'private'].includes(yt.visibility) ? yt.visibility : 'public';
      const file = await downloadMedia(video, { maxBytes: MAX_VIDEO_BYTES });
      const start = await request('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
        method: 'POST',
        headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': file.type || 'video/mp4', 'x-upload-content-length': String(file.bytes.length) },
        body: JSON.stringify({ snippet: { title, description: content.text.slice(0, 5000), categoryId: '22' }, status: { privacyStatus: privacy, selfDeclaredMadeForKids: false } })
      });
      if (!start.response.ok) throw new PublishError(httpKind(start.response.status), `YouTube: ${start.body?.error?.message || `HTTP ${start.response.status}`}`);
      const location = start.response.headers.get('location');
      if (!location) throw new PublishError('temporary', 'YouTube didn’t return an upload address.');
      await markSent();
      const { response, body } = await request(location, { method: 'PUT', headers: { 'content-type': file.type || 'video/mp4' }, body: file.bytes }, { sending: true });
      if (!response.ok) throw new PublishError(response.status >= 500 ? 'unknown' : httpKind(response.status), `YouTube: ${body?.error?.message || `HTTP ${response.status}`}`);
      return { externalId: body.id, url: `https://www.youtube.com/watch?v=${body.id}` };
    },
    async metrics({ connection, job }) {
      const { payload } = await api(`${YT}/videos?part=statistics&id=${encodeURIComponent(job.external_id)}`, { token: connection.token, name: 'YouTube' });
      const s = payload.items?.[0]?.statistics || {};
      const num = (value) => (value === undefined ? null : Number(value));
      return { views: num(s.viewCount), likes: num(s.likeCount), comments: num(s.commentCount) };
    }
  };

  // ---------------------------------------------------------------- TikTok — Content Posting API
  const TT = 'https://open.tiktokapis.com/v2';
  const TT_PRIVACY = { public: 'PUBLIC_TO_EVERYONE', friends: 'MUTUAL_FOLLOW_FRIENDS', followers: 'FOLLOWER_OF_CREATOR', private: 'SELF_ONLY' };
  async function tiktokApi(path, { token, body, sending = false } = {}) {
    const { payload } = await api(`${TT}/${path}`, { method: 'POST', token, body: body || {}, headers: { 'content-type': 'application/json; charset=UTF-8' }, sending, name: 'TikTok' });
    if (payload.error && payload.error.code && payload.error.code !== 'ok') {
      const kind = /access_token|scope|unauthorized/i.test(payload.error.code) ? 'auth' : /rate_limit|spam/i.test(payload.error.code) ? 'rate_limit' : 'invalid';
      throw new PublishError(kind, `TikTok: ${payload.error.message || payload.error.code}`);
    }
    return payload.data || {};
  }
  const tiktok = {
    authorizeUrl(state) {
      const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
      url.searchParams.set('client_key', process.env.TIKTOK_CLIENT_KEY);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'user.info.basic,video.publish,video.upload');
      url.searchParams.set('redirect_uri', redirectUri());
      url.searchParams.set('state', state);
      return url.href;
    },
    async exchange(code) {
      const token = await tokenRequest(`${TT}/oauth/token/`, { client_key: process.env.TIKTOK_CLIENT_KEY, client_secret: process.env.TIKTOK_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: redirectUri() });
      const { payload } = await api(`${TT}/user/info/?fields=open_id,avatar_url,display_name`, { token: token.access_token, name: 'TikTok' });
      const user = payload.data?.user || {};
      return {
        candidates: [{ key: `tiktok:${token.open_id || user.open_id}`, platform: 'tiktok', externalId: token.open_id || user.open_id, displayName: user.display_name || 'TikTok account', profileUrl: '', imageUrl: user.avatar_url || '' }],
        secret: { token: token.access_token, refreshToken: token.refresh_token || null, expiresAt: expiresAt(token.expires_in), refreshExpiresAt: expiresAt(token.refresh_expires_in) }
      };
    },
    connectionFor(candidate, secret) {
      return { token: secret.token, refreshToken: secret.refreshToken, expiresAt: secret.expiresAt, refreshExpiresAt: secret.refreshExpiresAt, meta: {} };
    },
    async refresh(connection) {
      const token = await tokenRequest(`${TT}/oauth/token/`, { client_key: process.env.TIKTOK_CLIENT_KEY, client_secret: process.env.TIKTOK_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: connection.refreshToken });
      return { token: token.access_token, refreshToken: token.refresh_token || connection.refreshToken, expiresAt: expiresAt(token.expires_in), refreshExpiresAt: expiresAt(token.refresh_expires_in) };
    },
    async publish({ connection, content, options, stage, saveStage, markSent }) {
      let publishId = stage.tiktokPublishId;
      if (!publishId) {
        const video = content.media.find((url) => mediaKind(url) === 'video');
        if (!video) throw new PublishError('invalid', 'TikTok posts need a video.');
        // The creator's allowed privacy levels decide what we can ask for. Apps TikTok hasn't
        // audited yet can only post privately (SELF_ONLY).
        const creator = await tiktokApi('post/publish/creator_info/query/', { token: connection.token });
        const allowed = creator.privacy_level_options || ['SELF_ONLY'];
        const wanted = TT_PRIVACY[options.tiktok?.visibility] || 'PUBLIC_TO_EVERYONE';
        const privacy = allowed.includes(wanted) ? wanted : allowed.includes('SELF_ONLY') ? 'SELF_ONLY' : allowed[0];
        const file = await downloadMedia(video, { maxBytes: MAX_VIDEO_BYTES });
        const size = file.bytes.length;
        // One chunk up to 64 MB; larger files go in 10 MB chunks with the last one taking the rest.
        const chunk = size <= 64 * 1024 * 1024 ? size : 10 * 1024 * 1024;
        const count = size <= 64 * 1024 * 1024 ? 1 : Math.floor(size / chunk);
        await markSent();
        const init = await tiktokApi('post/publish/video/init/', {
          token: connection.token, sending: true,
          body: { post_info: { title: content.text.slice(0, 2200), privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false }, source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunk, total_chunk_count: count } }
        });
        for (let index = 0; index < count; index += 1) {
          const from = index * chunk, to = index === count - 1 ? size : from + chunk;
          const { response } = await request(init.upload_url, { method: 'PUT', headers: { 'content-type': file.type || 'video/mp4', 'content-range': `bytes ${from}-${to - 1}/${size}` }, body: file.bytes.subarray(from, to) });
          if (!response.ok && response.status !== 206) throw new PublishError('temporary', `TikTok upload returned HTTP ${response.status}.`);
        }
        publishId = init.publish_id;
        await saveStage({ tiktokPublishId: publishId, tiktokPrivacy: privacy, processingSince: new Date().toISOString() });
      }
      const status = await tiktokApi('post/publish/status/fetch/', { token: connection.token, body: { publish_id: publishId } });
      if (status.status === 'FAILED') throw new PublishError('invalid', `TikTok couldn’t publish the video${status.fail_reason ? `: ${status.fail_reason}` : '.'}`);
      if (status.status !== 'PUBLISH_COMPLETE') {
        if (Date.now() - Date.parse(stage.processingSince || Date.now()) > 30 * 60000) throw new PublishError('unknown', 'TikTok was still processing the video after 30 minutes. Check the account.');
        return { pending: true, retryInSeconds: 30 };
      }
      const postId = status.publicaly_available_post_id?.[0] || status.publicly_available_post_id?.[0] || publishId;
      return { externalId: String(postId), url: '' };
    }
  };

  // ---------------------------------------------------------------- Threads — Threads API (Meta)
  const TH = 'https://graph.threads.net/v1.0';
  async function threadsApi(path, { method = 'GET', token, params = {}, sending = false } = {}) {
    const url = new URL(`${TH}/${path.replace(/^\//, '')}`);
    const query = { ...params, access_token: token };
    if (method === 'GET') Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    const { payload } = await api(url.href, method === 'GET' ? { token: null, name: 'Threads', sending } : { method, form: new URLSearchParams(query), headers: { 'content-type': 'application/x-www-form-urlencoded' }, sending, name: 'Threads' });
    return payload;
  }
  const threads = {
    authorizeUrl(state) {
      const url = new URL('https://threads.net/oauth/authorize');
      url.searchParams.set('client_id', process.env.THREADS_APP_ID);
      url.searchParams.set('redirect_uri', redirectUri());
      url.searchParams.set('scope', 'threads_basic,threads_content_publish');
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('state', state);
      return url.href;
    },
    async exchange(code) {
      const short = await tokenRequest('https://graph.threads.net/oauth/access_token', { client_id: process.env.THREADS_APP_ID, client_secret: process.env.THREADS_APP_SECRET, grant_type: 'authorization_code', redirect_uri: redirectUri(), code });
      const longUrl = new URL('https://graph.threads.net/access_token');
      longUrl.searchParams.set('grant_type', 'th_exchange_token');
      longUrl.searchParams.set('client_secret', process.env.THREADS_APP_SECRET);
      longUrl.searchParams.set('access_token', short.access_token);
      const { payload: long } = await api(longUrl.href, { name: 'Threads' });
      const me = await threadsApi('me', { token: long.access_token, params: { fields: 'id,username,name,threads_profile_picture_url' } });
      return {
        candidates: [{ key: `threads:${me.id}`, platform: 'threads', externalId: me.id, displayName: me.name || me.username, username: me.username || '', profileUrl: me.username ? `https://www.threads.net/@${me.username}` : '', imageUrl: me.threads_profile_picture_url || '' }],
        // Threads renews the long-lived token itself (no separate refresh token), so it's stored as both.
        secret: { token: long.access_token, refreshToken: long.access_token, expiresAt: expiresAt(long.expires_in) }
      };
    },
    connectionFor(candidate, secret) {
      return { token: secret.token, refreshToken: secret.refreshToken, expiresAt: secret.expiresAt, refreshExpiresAt: null, meta: {} };
    },
    async refresh(connection) {
      const url = new URL('https://graph.threads.net/refresh_access_token');
      url.searchParams.set('grant_type', 'th_refresh_token');
      url.searchParams.set('access_token', connection.token);
      const { payload } = await api(url.href, { name: 'Threads' });
      return { token: payload.access_token, refreshToken: payload.access_token, expiresAt: expiresAt(payload.expires_in) };
    },
    async publish({ connection, content, stage, saveStage, markSent }) {
      if (content.text.length > 500) throw new PublishError('invalid', 'Threads posts can be up to 500 characters.');
      const user = connection.external_id;
      let container = stage.threadsContainer;
      if (!container) {
        const media = content.media.slice(0, 20);
        const item = (url, carousel) => ({ media_type: mediaKind(url) === 'video' ? 'VIDEO' : 'IMAGE', [mediaKind(url) === 'video' ? 'video_url' : 'image_url']: url, ...(carousel ? { is_carousel_item: 'true' } : {}) });
        if (!media.length) container = (await threadsApi(`${user}/threads`, { method: 'POST', token: connection.token, params: { media_type: 'TEXT', text: content.text } })).id;
        else if (media.length === 1) container = (await threadsApi(`${user}/threads`, { method: 'POST', token: connection.token, params: { ...item(media[0]), text: content.text } })).id;
        else {
          const children = [];
          for (const url of media) children.push((await threadsApi(`${user}/threads`, { method: 'POST', token: connection.token, params: item(url, true) })).id);
          container = (await threadsApi(`${user}/threads`, { method: 'POST', token: connection.token, params: { media_type: 'CAROUSEL', children: children.join(','), text: content.text } })).id;
        }
        await saveStage({ threadsContainer: container, processingSince: new Date().toISOString() });
        if (content.media.length) return { pending: true, retryInSeconds: 30 };
      }
      const status = await threadsApi(container, { token: connection.token, params: { fields: 'status,error_message' } }).catch(() => ({}));
      if (status.status === 'ERROR' || status.status === 'EXPIRED') { await saveStage({ threadsContainer: null }); throw new PublishError('invalid', `Threads couldn’t process the post${status.error_message ? `: ${status.error_message}` : '.'}`); }
      if (status.status === 'IN_PROGRESS') return { pending: true, retryInSeconds: 30 };
      await markSent();
      const published = await threadsApi(`${user}/threads_publish`, { method: 'POST', token: connection.token, params: { creation_id: container }, sending: true });
      let url = '';
      try { url = (await threadsApi(published.id, { token: connection.token, params: { fields: 'permalink' } })).permalink || ''; } catch { /* live either way */ }
      return { externalId: published.id, url };
    }
  };

  return { x, google, tiktok, threads };
};
