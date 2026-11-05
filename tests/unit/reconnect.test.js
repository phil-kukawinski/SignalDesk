// Disconnecting clears the account from a client's posts. Reconnecting gives unfinished posts the account
// again, and retrying a post with no account asks for a reconnect instead of sending a bad database request.
const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc' });
const key = Buffer.alloc(32, 7), JOB = '33333333-3333-4333-8333-333333333333', CONN = '44444444-4444-4444-8444-444444444444';
const calls = [];
let job = { id: JOB, status: 'failed', connection_id: null, provider: 'direct' }, connection = [{ id: CONN, status: 'active' }];
const ok = (body, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
global.fetch = async (url, opts = {}) => {
  const method = opts.method || 'GET', body = opts.body ? JSON.parse(opts.body) : undefined;
  calls.push({ url: String(url), method, body });
  if (String(url).includes('id=eq.null')) return ok({ message: 'invalid input syntax for type uuid: "null"' }, 400);
  if (String(url).includes('/social_connections?on_conflict')) return ok([{ id: CONN }], 201);
  if (String(url).includes('/social_connections?') && method === 'GET') return ok(connection);
  if (String(url).includes('/publish_jobs?') && method === 'GET') return ok([job]);
  return ok(null, 204);
};
const { saveConnection, retryJob } = require(ROOT + '/api/_lib/publishing.js');

(async () => {
  // Retrying before reconnecting: a clear instruction, and nothing is queued.
  await assert.rejects(retryJob('ws-1', JOB), /Reconnect this account/);
  assert.ok(!calls.some((call) => call.url.includes('id=eq.null')), 'should not look up an account with no id');
  assert.ok(!calls.some((call) => call.method === 'PATCH'), 'should not queue the post');

  // Reconnecting puts the account back on this client's unfinished posts only.
  const save = (platform) => saveConnection({ workspaceId: 'ws-1', clientId: 'pk works', userId: 'u1', candidate: { platform, externalId: 'x' }, connection: { token: 't', meta: {} }, encryptionKey: key });
  calls.length = 0;
  await save('pinterest');
  const relink = calls.find((call) => call.method === 'PATCH' && call.url.includes('/publish_jobs?'));
  assert.ok(relink, 'reconnecting should update waiting posts');
  assert.deepEqual(relink.body.connection_id, CONN);
  for (const part of ['workspace_id=eq.ws-1', 'client_id=eq.pk%20works', 'platform=in.(pinterest)', 'provider=eq.direct', 'connection_id=is.null', 'status=in.(held,queued,failed,unknown)']) assert.ok(relink.url.includes(part), `should narrow to ${part}: ${relink.url}`);

  // An Instagram connection also covers Instagram Stories.
  calls.length = 0;
  await save('instagram');
  assert.ok(calls.find((call) => call.method === 'PATCH').url.includes('platform=in.(instagram,instagram_story)'));

  // After that, the retry queues the post.
  job = { ...job, connection_id: CONN };
  calls.length = 0;
  assert.deepEqual(await retryJob('ws-1', JOB), { queued: true });
  assert.equal(calls.find((call) => call.method === 'PATCH').body.status, 'queued');

  // An account that still needs reconnecting is refused too.
  connection = [{ id: CONN, status: 'needs_reauth' }];
  await assert.rejects(retryJob('ws-1', JOB), /Reconnect this account/);
  console.log('reconnect tests passed');
})().catch((error) => { console.error(error); process.exit(1); });
