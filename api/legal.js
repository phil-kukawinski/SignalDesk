const crypto = require('node:crypto');
const { send, getConfig, databaseRequest } = require('./_lib/core');
const { privacyPage, termsPage, deletionPage } = require('./_lib/legal');

// Serves /privacy, /terms, and /data-deletion (see the rewrites in vercel.json), and receives
// Meta's two callbacks for when someone removes SignalDesk from their Facebook settings:
//   POST /api/legal?event=meta-deletion     → delete their connections, return a status link
//   POST /api/legal?event=meta-deauthorize  → mark their connections as needing sign-in
// and the same two for Threads, which has its own app secret:
//   POST /api/legal?event=threads-deletion and ?event=threads-uninstall

const META_PLATFORMS = 'platform=in.(facebook,instagram)';

function base64UrlDecode(value) {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// Meta signs the request with the app secret: "<signature>.<payload>", both base64url.
function parseSignedRequest(signedRequest, secret) {
  if (typeof signedRequest !== 'string' || !secret) return null;
  const [signature, payload] = signedRequest.split('.');
  if (!signature || !payload) return null;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  const given = base64UrlDecode(signature);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(base64UrlDecode(payload).toString('utf8'));
    if (String(data.algorithm).toUpperCase() !== 'HMAC-SHA256' || !/^\d{1,30}$/.test(String(data.user_id || ''))) return null;
    return data;
  } catch {
    return null;
  }
}

function formBody(req) {
  const body = req.body;
  if (body && typeof body === 'object' && !Buffer.isBuffer(body)) return body;
  const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body || '');
  return Object.fromEntries(new URLSearchParams(text));
}

function siteOrigin(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `https://${host}`;
}

async function metaCallback(req, res, event) {
  const threads = event.startsWith('threads-');
  const secret = threads ? process.env.THREADS_APP_SECRET : process.env.META_APP_SECRET;
  if (!secret) return send(res, 503, { error: `${threads ? 'Threads' : 'Meta'} isn’t set up on this server.` });
  if (getConfig().missing.length) return send(res, 503, { error: 'The database isn’t set up on this server.' });
  const data = parseSignedRequest(formBody(req).signed_request, secret);
  if (!data) return send(res, 400, { error: 'Invalid signed request.' });
  // Threads identifies the person by their Threads user ID, which is the connection's account ID.
  const match = threads ? `platform=eq.threads&external_id=eq.${data.user_id}` : `${META_PLATFORMS}&meta->>metaUserId=eq.${data.user_id}`;

  if (event === 'meta-deauthorize' || event === 'threads-uninstall') {
    await databaseRequest(`social_connections?${match}`, {
      method: 'PATCH', headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'needs_reauth', last_error: `Access was removed in ${threads ? 'Threads' : 'Facebook'} settings. Sign in again to keep posting.`, updated_at: new Date().toISOString() })
    });
    return send(res, 200, { ok: true });
  }

  const code = crypto.randomBytes(12).toString('hex');
  await databaseRequest('data_deletion_requests', {
    method: 'POST', headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ code, platform: 'meta', status: 'received' })
  });
  const removed = await databaseRequest(`social_connections?${match}&select=id`, { method: 'DELETE', headers: { prefer: 'return=representation' } }) || [];
  await databaseRequest(`data_deletion_requests?code=eq.${code}`, {
    method: 'PATCH', headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'completed', connections_removed: removed.length, completed_at: new Date().toISOString() })
  });
  return send(res, 200, { url: `${siteOrigin(req)}/data-deletion?code=${code}`, confirmation_code: code });
}

async function deletionRequest(code) {
  if (!code) return undefined;
  if (!/^[a-f0-9]{24}$/.test(code) || getConfig().missing.length) return null;
  const rows = await databaseRequest(`data_deletion_requests?code=eq.${code}&select=code,status,connections_removed,requested_at`).catch(() => null);
  return rows?.[0] || null;
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const event = url.searchParams.get('event');
  try {
    if (['meta-deletion', 'meta-deauthorize', 'threads-deletion', 'threads-uninstall'].includes(event)) {
      if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
      return await metaCallback(req, res, event);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed.' });
    const page = url.searchParams.get('page');
    let html;
    if (page === 'privacy') html = privacyPage();
    else if (page === 'terms') html = termsPage();
    else if (page === 'data-deletion') html = deletionPage(await deletionRequest(url.searchParams.get('code')));
    else return send(res, 404, { error: 'Not found.' });
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('cache-control', url.searchParams.get('code') ? 'no-store' : 'public, max-age=300');
    res.setHeader('x-content-type-options', 'nosniff');
    return res.status(200).send(html);
  } catch (error) {
    console.error('Legal page failed:', error.message);
    require('./_lib/platform').recordAppError('api/legal', error);
    return send(res, 500, { error: 'Something went wrong. Please try again.' });
  }
};

module.exports.parseSignedRequest = parseSignedRequest;
