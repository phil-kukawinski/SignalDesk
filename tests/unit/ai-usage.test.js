// Measuring for the pricing plan: what each AI request costs, recorded per workspace and action;
// the allowances every limit reads; and storage per workspace from the daily Storage sync.
const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
const fs = require('node:fs');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', ANTHROPIC_API_KEY: 'test-key' });
const { usageCost, trackedClient, withAiUsage } = require(ROOT + '/api/_lib/ai.js');
const { BETA, DAILY_COUNTERS, workspaceAllowances } = require(ROOT + '/api/_lib/allowances.js');
const { syncMediaFiles } = require(ROOT + '/api/_lib/media.js');

const ok = (body, status = 200, type = 'application/json') => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': type } });
const message = (usage, model = 'claude-sonnet-5-5') => ({ id: 'm1', type: 'message', role: 'assistant', model, content: [{ type: 'text', text: 'Hi' }], stop_reason: 'end_turn', usage });
const sse = (usage) => [
  ['message_start', { type: 'message_start', message: { ...message({ input_tokens: usage.input_tokens, output_tokens: 0 }), content: [], stop_reason: null } }],
  ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
  ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Plan' } }],
  ['content_block_stop', { type: 'content_block_stop', index: 0 }],
  ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: usage.output_tokens } }],
  ['message_stop', { type: 'message_stop' }]
].map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');

(async () => {
  // --- what a request costs, from its usage
  // The measured November 10 trend scan: 57,322 in, 6,160 out, 4 searches on Sonnet 5.5.
  assert.equal(usageCost('claude-sonnet-5-5', { input_tokens: 57322, output_tokens: 6160, server_tool_use: { web_search_requests: 4 } }), 0.21624, "about the $0.22 the pricing plan measured");
  // Cache reads are cheaper than input; cache writes cost 1.25 times input.
  assert.equal(usageCost('claude-sonnet-5-5', { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1e6 }), 0.1);
  assert.equal(usageCost('claude-sonnet-5-5', { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1e6 }), 2.5);
  // Haiku is five times the price for prompts over 100,000 tokens.
  assert.equal(usageCost('claude-haiku-5-5', { input_tokens: 1e5, output_tokens: 0 }), 0.01);
  assert.equal(usageCost('claude-haiku-5-5', { input_tokens: 2e5, output_tokens: 0 }), 0.1);
  assert.equal(usageCost('claude-unknown-model', { input_tokens: 10, output_tokens: 10 }), null, 'an unknown model is recorded without a price');

  // --- recording: per workspace and action, never the prompt or reply
  const rows = [];
  let anthropicReply = () => ok(message({ input_tokens: 1000, output_tokens: 200 }));
  let failRecording = false;
  global.fetch = async (input, options = {}) => {
    const url = String(input.url || input);
    if (url.startsWith('https://sb.test/rest/v1/ai_usage')) {
      if (failRecording) return ok({ message: 'relation "ai_usage" does not exist' }, 404);
      rows.push(JSON.parse(options.body)); return ok('', 201);
    }
    if (url.startsWith('https://api.anthropic.com/v1/messages')) return anthropicReply(JSON.parse(options.body));
    throw new Error('unexpected request ' + url);
  };
  const request = { model: 'claude-sonnet-5-5', max_tokens: 100, messages: [{ role: 'user', content: 'Write a caption about our secret launch' }] };
  const reply = await withAiUsage({ workspaceId: 'ws-1', action: 'draft-captions' }, () => trackedClient().beta.messages.create(request));
  assert.equal(reply.content[0].text, 'Hi', 'the reply comes back unchanged');
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { workspace_id: 'ws-1', action: 'draft-captions', model: 'claude-sonnet-5-5', input_tokens: 1000, output_tokens: 200, cache_read_tokens: 0, cache_write_tokens: 0, web_searches: 0, cost_usd: 0.004 });
  assert.ok(!JSON.stringify(rows[0]).includes('secret launch'), 'no prompt text is stored');

  // Outside a request (no workspace or action known), nothing is recorded.
  await trackedClient().beta.messages.create(request);
  assert.equal(rows.length, 1);

  // Streamed requests (campaign plans) are recorded once, when the final message arrives.
  anthropicReply = () => ok(sse({ input_tokens: 3000, output_tokens: 500 }), 200, 'text/event-stream');
  const streamed = await withAiUsage({ workspaceId: 'ws-2', action: 'campaign-plan' }, () => trackedClient().beta.messages.stream(request).finalMessage());
  assert.equal(streamed.content[0].text, 'Plan');
  assert.equal(rows.length, 2);
  assert.equal(rows[1].action, 'campaign-plan'); assert.equal(rows[1].workspace_id, 'ws-2');
  assert.equal(rows[1].input_tokens, 3000); assert.equal(rows[1].output_tokens, 500);

  // Before the database update adds ai_usage, recording fails quietly and AI help still works.
  failRecording = true; anthropicReply = () => ok(message({ input_tokens: 10, output_tokens: 10 }));
  const quiet = console.error; console.error = () => {};
  const still = await withAiUsage({ workspaceId: 'ws-1', action: 'proofread' }, () => trackedClient().beta.messages.create(request));
  console.error = quiet;
  assert.equal(still.content[0].text, 'Hi');
  failRecording = false;

  // --- allowances: one place for every limit, and the database agrees on clients
  const allow = await workspaceAllowances('ws-1');
  assert.deepEqual(Object.keys(DAILY_COUNTERS).map((kind) => typeof allow[DAILY_COUNTERS[kind]]), ['number', 'number', 'number'], 'every daily counter has an allowance');
  assert.equal(allow.postsPerDay, 150); assert.equal(allow.teamMembers, 25); assert.equal(allow.storageBytes, null);
  allow.clients = 1; assert.equal((await workspaceAllowances('ws-1')).clients, BETA.clients, 'changing a copy never changes the defaults');
  const schema = fs.readFileSync(ROOT + '/supabase/schema.sql', 'utf8');
  const sqlLimit = Number(schema.match(/function public\.workspace_client_limit[\s\S]*?\$\$ select (\d+) \$\$/)[1]);
  assert.equal(sqlLimit, BETA.clients, 'workspace_client_limit() in schema.sql matches allowances.js');

  // --- storage per workspace, from Storage's own file list
  const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222';
  const upserts = []; let deleted = null;
  global.fetch = async (input, options = {}) => {
    const url = String(input.url || input), method = options.method || 'GET';
    if (url.includes('/rest/v1/workspace_members?')) return ok([{ user_id: U1, workspace_id: 'ws-1' }, { user_id: U2, workspace_id: 'ws-2' }]);
    if (url.includes('/rest/v1/media_files?on_conflict=path')) { upserts.push(...JSON.parse(options.body)); return ok('', 201); }
    if (url.includes('/rest/v1/media_files?seen_at=lt.') && method === 'DELETE') { deleted = decodeURIComponent(url.split('seen_at=lt.')[1]); return new Response(null, { status: 204 }); }
    if (url.endsWith('/storage/v1/object/list/social-media')) {
      const { prefix } = JSON.parse(options.body);
      if (prefix === '') return ok([{ name: U1, id: null }, { name: U2, id: null }, { name: 'loose.png', id: 'f0' }]);
      if (prefix === U1) return ok([{ name: 'a.jpg', id: 'f1', created_at: '2026-11-01T00:00:00Z', metadata: { size: 2000000 } }, { name: 'avatar-1.jpg', id: 'f2', metadata: { size: 50000 } }]);
      if (prefix === U2) return ok([{ name: 'b.mp4', id: 'f3', created_at: '2026-11-02T00:00:00Z', metadata: { size: 30000000 } }]);
    }
    throw new Error('unexpected request ' + url);
  };
  const now = new Date('2026-11-18T12:00:00Z');
  const synced = await syncMediaFiles({ now });
  assert.deepEqual(synced, { files: 2, bytes: 32000000 }, 'profile photos and stray top-level files are left out');
  assert.deepEqual(upserts.map((row) => [row.path, row.workspace_id, row.size_bytes]), [[`${U1}/a.jpg`, 'ws-1', 2000000], [`${U2}/b.mp4`, 'ws-2', 30000000]], 'each file is counted for its uploader’s workspace');
  assert.equal(deleted, now.toISOString(), 'files gone from Storage drop out of the count');

  console.log('AI usage, allowance, and storage tests passed');
})().catch((error) => { console.error(error); process.exit(1); });
