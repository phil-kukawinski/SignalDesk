const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
const crypto = require('node:crypto');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', SOCIAL_PROFILE_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'), META_APP_SECRET: 'meta-secret', APP_URL: 'https://app.test/', LEGAL_CONTACT_EMAIL: 'owner@studio.test', LEGAL_OPERATOR_NAME: 'PK <Works>', RESEND_API_KEY: 'r' });
const calls = []; const json = (body, status = 200) => ({ ok: status < 400, status, headers: new Map([['content-length', body == null ? '0' : '1']]), json: async () => body, text: async () => JSON.stringify(body) });
global.fetch = async (url, opts = {}) => {
  url = String(url); const method = opts.method || 'GET'; calls.push({ url, method, body: opts.body && JSON.parse(opts.body) });
  if (url.includes('/rest/v1/social_connections?') && method === 'DELETE') return json([{ id: 'a' }, { id: 'b' }]);
  if (url.includes('/rest/v1/data_deletion_requests?code=eq.') && method === 'GET') return url.includes('aaaaaaaaaaaaaaaaaaaaaaaa') ? json([{ code: 'aaaaaaaaaaaaaaaaaaaaaaaa', status: 'completed', connections_removed: 2, requested_at: '2026-10-17T12:00:00Z' }]) : json([]);
  if (url.includes('/rest/v1/')) return json(null);
  throw new Error('unexpected ' + url);
};
const handler = require(ROOT + '/api/legal.js');
const b64 = (v) => Buffer.from(v).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function signed(data, secret = 'meta-secret') { const payload = b64(JSON.stringify(data)); return b64(crypto.createHmac('sha256', secret).update(payload).digest()) + '.' + payload; }
async function call(url, { method = 'GET', body } = {}) {
  let status, payload, sent; const headers = {};
  const res = { status(s) { status = s; return this; }, json(p) { payload = p; }, send(t) { sent = t; }, setHeader(k, v) { headers[k] = v; } };
  await handler({ method, url, body, headers: { host: 'x.test' } }, res); return { status, payload, sent, headers };
}
(async () => {
  let r = await call('/api/legal?page=privacy');
  assert.equal(r.status, 200); assert.match(r.headers['content-type'], /text\/html/);
  assert.match(r.sent, /PK &lt;Works&gt;/); assert.match(r.sent, /mailto:owner@studio\.test/); assert.match(r.sent, /Resend/); assert.doesNotMatch(r.sent, /Anthropic|Ayrshare/);
  r = await call('/api/legal?page=terms'); assert.equal(r.status, 200); assert.match(r.sent, /Terms of Service/); assert.doesNotMatch(r.sent, /Governing law/);
  process.env.LEGAL_GOVERNING_LAW = 'the State of New York'; r = await call('/api/legal?page=terms'); assert.match(r.sent, /Governing law[\s\S]*State of New York/);
  r = await call('/api/legal?page=data-deletion'); assert.equal(r.status, 200); assert.doesNotMatch(r.sent, /class="status"/);
  r = await call('/api/legal?page=data-deletion&code=aaaaaaaaaaaaaaaaaaaaaaaa'); assert.match(r.sent, /Done\./); assert.equal(r.headers['cache-control'], 'no-store');
  r = await call('/api/legal?page=data-deletion&code=bbbbbbbbbbbbbbbbbbbbbbbb'); assert.match(r.sent, /couldn’t find/);
  r = await call('/api/legal?page=data-deletion&code=../../x'); assert.match(r.sent, /couldn’t find/);
  r = await call('/api/legal?page=nope'); assert.equal(r.status, 404);
  // Signed request parsing
  assert.equal(handler.parseSignedRequest(signed({ algorithm: 'HMAC-SHA256', user_id: '123' }), 'meta-secret').user_id, '123');
  assert.equal(handler.parseSignedRequest(signed({ algorithm: 'HMAC-SHA256', user_id: '123' }, 'wrong'), 'meta-secret'), null);
  assert.equal(handler.parseSignedRequest(signed({ algorithm: 'HMAC-SHA256', user_id: '1 or 1=1' }), 'meta-secret'), null);
  assert.equal(handler.parseSignedRequest('garbage', 'meta-secret'), null);
  // Deletion callback
  calls.length = 0;
  r = await call('/api/legal?event=meta-deletion', { method: 'POST', body: { signed_request: signed({ algorithm: 'HMAC-SHA256', user_id: '987' }) } });
  assert.equal(r.status, 200); assert.match(r.payload.confirmation_code, /^[a-f0-9]{24}$/); assert.equal(r.payload.url, `https://app.test/data-deletion?code=${r.payload.confirmation_code}`);
  const del = calls.find((c) => c.method === 'DELETE'); assert.match(del.url, /social_connections\?platform=in\.\(facebook,instagram\)&meta->>metaUserId=eq\.987/);
  const patch = calls.find((c) => c.method === 'PATCH'); assert.equal(patch.body.status, 'completed'); assert.equal(patch.body.connections_removed, 2);
  // Form-encoded string body, deauthorize
  calls.length = 0;
  r = await call('/api/legal?event=meta-deauthorize', { method: 'POST', body: 'signed_request=' + encodeURIComponent(signed({ algorithm: 'HMAC-SHA256', user_id: '987' })) });
  assert.equal(r.status, 200); assert.equal(calls[0].method, 'PATCH'); assert.equal(calls[0].body.status, 'needs_reauth');
  r = await call('/api/legal?event=meta-deletion', { method: 'POST', body: { signed_request: signed({ algorithm: 'HMAC-SHA256', user_id: '1' }, 'bad') } }); assert.equal(r.status, 400);
  r = await call('/api/legal?event=meta-deletion'); assert.equal(r.status, 405);
  delete process.env.META_APP_SECRET; r = await call('/api/legal?event=meta-deletion', { method: 'POST', body: {} }); assert.equal(r.status, 503);
  // Threads callbacks use the Threads app secret and match Threads connections by account ID.
  r = await call('/api/legal?event=threads-deletion', { method: 'POST', body: {} }); assert.equal(r.status, 503);
  process.env.THREADS_APP_SECRET = 'threads-secret';
  r = await call('/api/legal?event=threads-deletion', { method: 'POST', body: { signed_request: signed({ algorithm: 'HMAC-SHA256', user_id: '555' }, 'meta-secret') } }); assert.equal(r.status, 400);
  calls.length = 0;
  r = await call('/api/legal?event=threads-deletion', { method: 'POST', body: { signed_request: signed({ algorithm: 'HMAC-SHA256', user_id: '555' }, 'threads-secret') } });
  assert.equal(r.status, 200); assert.match(calls.find((c) => c.method === 'DELETE').url, /social_connections\?platform=eq\.threads&external_id=eq\.555/);
  calls.length = 0;
  r = await call('/api/legal?event=threads-uninstall', { method: 'POST', body: { signed_request: signed({ algorithm: 'HMAC-SHA256', user_id: '555' }, 'threads-secret') } });
  assert.equal(r.status, 200); assert.equal(calls[0].body.status, 'needs_reauth'); assert.match(calls[0].body.last_error, /Threads/);
  // Missing contact email falls back to a visible note.
  delete process.env.LEGAL_CONTACT_EMAIL; r = await call('/api/legal?page=privacy'); assert.match(r.sent, /not set up yet/);
  if (process.argv[2]) require('fs').writeFileSync(process.argv[2], (await call('/api/legal?page=privacy')).sent);
  console.log('legal tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
