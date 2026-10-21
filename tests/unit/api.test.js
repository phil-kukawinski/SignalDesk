const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
const crypto = require('node:crypto');
const key = crypto.randomBytes(32);
Object.assign(process.env, { AYRSHARE_API_KEY: 'k', SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', SOCIAL_PROFILE_ENCRYPTION_KEY: key.toString('base64'), CRON_SECRET: 'cron-secret' });
function enc(text) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv); const e = Buffer.concat([c.update(text, 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), e]).toString('base64'); }
let role = 'user'; const calls = [];
const json = (body, status = 200) => ({ ok: status < 400, status, headers: new Map([['content-length', '1']]), json: async () => body });
global.fetch = async (url, opts = {}) => {
  url = String(url); const method = opts.method || 'GET'; const body = opts.body ? JSON.parse(opts.body) : undefined;
  calls.push({ url, method, body });
  if (url.endsWith('/auth/v1/user')) return json({ id: '11111111-1111-1111-1111-111111111111', email: 'u@x.com' });
  if (url.includes('/rest/v1/workspace_members?') && method === 'GET' && url.includes('user_id=eq.1111')) return json([{ workspace_id: 'ws-1', role, email: 'u@x.com' }]);
  if (url.includes('/rest/v1/workspace_state?')) return json([{ state: { clients: [{ id: 'pk-works', name: 'PK Works' }], settings: { timezone: 'Eastern Time (US & Canada)' } } }]);
  if (url.includes('/rest/v1/social_profiles?')) return json([{ client_id: 'pk-works', ayrshare_ref_id: 'ref', profile_key_ciphertext: enc('profile-key') }]);
  if (url.includes('/rest/v1/scheduled_comments') && method === 'POST') return { ok: true, status: 201, headers: new Map([['content-length', '0']]), json: async () => null };
  if (url.includes('/rest/v1/workspace_members?') && url.includes('email=eq.')) return json([]);
  if ((url.includes('/rest/v1/workspace_members?workspace_id=') || url.includes('/rest/v1/workspace_invites?workspace_id=')) && method === 'GET') return json([]);
  if (url.includes('/rest/v1/app_errors')) return json([]);
  if (url.includes('/rest/v1/workspace_invites') && method === 'POST') return { ok: true, status: 201, headers: new Map([['content-length', '0']]), json: async () => null };
  if (url === 'https://api.ayrshare.com/api/post' && method === 'POST') return json({ status: 'scheduled', id: 'post-' + calls.filter((c) => c.url.endsWith('/api/post')).length });
  throw new Error('unexpected fetch ' + method + ' ' + url);
};
const handler = require(ROOT + '/api/social.js');
const cron = require(ROOT + '/api/cron.js');
async function call(h, body, { method = 'POST', auth = 'Bearer token' } = {}) {
  let status, payload; const res = { status(s) { status = s; return this; }, json(p) { payload = p; } };
  await h({ method, body, headers: { authorization: auth, origin: 'http://localhost:3000' } }, res); return { status, payload };
}
const future = new Date(Date.now() + 86400000).toISOString();
(async () => {
  let r;
  for (const action of ['approve', 'members', 'invite', 'connect', 'autopilot', 'feed-save', 'messages', 'analytics', 'autopilot-run', 'oauth-start', 'disconnect', 'reject', 'retry-job', 'reschedule-post', 'oauth-finish']) {
    r = await call(handler, { action, clientId: 'pk-works', postId: 'p' }); assert.equal(r.status, 403, action);
  }
  role = 'admin'; calls.length = 0;
  r = await call(handler, { action: 'invite', email: 'New@Example.com', role: 'user' }); assert.equal(r.status, 200); assert.equal(r.payload.invited, 'new@example.com');
  r = await call(handler, { action: 'invite', email: 'nope', role: 'user' }); assert.equal(r.status, 400);
  r = await call(handler, { action: 'feed-preview', url: 'http://127.0.0.1/rss' }); assert.equal(r.status, 400);
  r = await call(handler, { action: 'publish', clientId: 'other-client', text: 'x', platforms: ['facebook'] }); assert.equal(r.status, 404);
  // Cron auth
  r = await call(cron, {}, { method: 'GET', auth: 'Bearer wrong' }); assert.equal(r.status, 401);
  r = await call(cron, {}, { method: 'GET', auth: '' }); assert.equal(r.status, 401);
  console.log('api tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
