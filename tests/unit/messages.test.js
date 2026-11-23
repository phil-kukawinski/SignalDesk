// Social Inbox → Messages: conversations come from each connected Page and Instagram account, an account
// without the messaging permission is named rather than failing the inbox, the 24-hour reply window is
// worked out from the person's last message, and a reply goes to the person in that conversation
// (never to an ID the browser sends), using the Page that owns the conversation.
const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', META_APP_SECRET: 'meta-secret' });
const KEY = Buffer.alloc(32, 7);
const { encryptSecret } = require(ROOT + '/api/_lib/core.js');
const now = Date.parse('2026-11-23T15:00:00Z');
const hoursAgo = (hours) => new Date(now - hours * 3600000).toISOString();
const rows = [
  { id: 'c-fb', workspace_id: 'ws-1', client_id: 'cl1', platform: 'facebook', external_id: 'page1', display_name: 'Harbor Coffee', username: null, status: 'active', meta: {} },
  { id: 'c-ig', workspace_id: 'ws-1', client_id: 'cl1', platform: 'instagram', external_id: 'ig1', display_name: 'Harbor', username: 'harborcoffee', status: 'active', meta: { pageId: 'page1' } },
  { id: 'c-li', workspace_id: 'ws-1', client_id: 'cl1', platform: 'linkedin', external_id: 'li1', status: 'active', meta: {} },
  { id: 'c-other', workspace_id: 'ws-2', client_id: 'cl9', platform: 'facebook', external_id: 'page9', status: 'active', meta: {} }
];
const calls = [];
let igDenied = true;
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
global.fetch = async (input, options = {}) => {
  const url = new URL(String(input)), method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : null;
  calls.push({ url, method, body });
  if (url.hostname === 'sb.test') {
    const id = url.searchParams.get('id')?.replace('eq.', ''), workspace = url.searchParams.get('workspace_id')?.replace('eq.', '');
    if (id) return reply(rows.filter((row) => row.id === id).map((row) => ({ ...row, token_ciphertext: encryptSecret(`token-${row.id}`, KEY) })));
    return reply(rows.filter((row) => row.workspace_id === workspace));
  }
  const path = url.pathname.replace(/^\/v[\d.]+\//, '');
  if (path === 'page1/conversations' && url.searchParams.get('platform') === 'instagram') {
    return igDenied ? reply({ error: { code: 10, message: '(#10) Requires instagram_manage_messages permission to manage the object' } }, 403) : reply({ data: [] });
  }
  if (path === 'page1/conversations') return reply({ data: [
    { id: 't_old', updated_time: hoursAgo(30), participants: { data: [{ id: 'psid-2', name: 'Ben Ortiz' }, { id: 'page1', name: 'Harbor Coffee' }] }, messages: { data: [{ id: 'm2', message: 'Open Sunday?', from: { id: 'psid-2', name: 'Ben Ortiz' }, created_time: hoursAgo(30) }] } },
    { id: 't_new', updated_time: hoursAgo(2), participants: { data: [{ id: 'page1', name: 'Harbor Coffee' }, { id: 'psid-1', name: 'Ana Ruiz' }] }, messages: { data: [{ id: 'm1', message: 'Do you cater?', from: { id: 'psid-1', name: 'Ana Ruiz' }, created_time: hoursAgo(2) }] } },
    { id: 't_done', updated_time: hoursAgo(5), participants: { data: [{ id: 'psid-3', name: 'Cy' }, { id: 'page1', name: 'Harbor Coffee' }] }, messages: { data: [{ id: 'm3', message: 'Thanks!', from: { id: 'page1', name: 'Harbor Coffee' }, created_time: hoursAgo(5) }] } }
  ] });
  if (path === 't_new' && method === 'GET') return reply({ participants: { data: [{ id: 'page1', name: 'Harbor Coffee' }, { id: 'psid-1', name: 'Ana Ruiz' }] }, messages: { data: [{ id: 'm1', message: 'Do you cater?', from: { id: 'psid-1' }, created_time: hoursAgo(2) }, { id: 'm0', from: { id: 'psid-1' }, created_time: hoursAgo(3) }] } });
  if (path === 'page1/messages' && method === 'POST') return reply({ recipient_id: body.recipient.id, message_id: 'mid.9' });
  return reply({ error: { message: `unexpected ${method} ${path}` } }, 400);
};
const { listConversations, conversationMessages, sendMessage } = require(ROOT + '/api/_lib/messages.js');

(async () => {
  // The inbox: Facebook conversations, newest first, with the Instagram permission problem named.
  const inbox = await listConversations('ws-1', { encryptionKey: KEY, now });
  assert.strictEqual(inbox.accounts, 2, 'only Facebook and Instagram accounts have messages');
  assert.deepStrictEqual(inbox.conversations.map((item) => item.id), ['t_new', 't_done', 't_old']);
  const [fresh, done, old] = inbox.conversations;
  assert.deepStrictEqual([fresh.with.name, fresh.needsReply, fresh.canReply, fresh.replyBy], ['Ana Ruiz', true, true, new Date(now + 22 * 3600000).toISOString()]);
  assert.deepStrictEqual([done.needsReply, done.last.mine, done.canReply], [false, true, true], 'our own last message means nothing is waiting');
  assert.deepStrictEqual([old.needsReply, old.canReply], [true, false], 'after 24 hours the window has closed');
  assert.strictEqual(inbox.problems.length, 1);
  assert.strictEqual(inbox.problems[0].platform, 'instagram');
  assert.match(inbox.problems[0].error, /Reconnect it in Social Accounts and allow messages/);
  assert.strictEqual(inbox.problems[0].permission, true, 'a missing permission is marked so the inbox can say it calmly');
  const conversationsCall = calls.find((call) => call.url.pathname.endsWith('page1/conversations'));
  assert.strictEqual(conversationsCall.url.searchParams.get('access_token'), 'token-c-fb');
  assert.ok(conversationsCall.url.searchParams.get('appsecret_proof'), 'calls are signed with the app secret');

  // Instagram reads through its linked Page, once the permission is there.
  igDenied = false;
  const allowed = await listConversations('ws-1', { encryptionKey: KEY, now });
  assert.strictEqual(allowed.problems.length, 0);
  assert.ok(calls.some((call) => call.url.pathname.endsWith('page1/conversations') && call.url.searchParams.get('platform') === 'instagram' && call.url.searchParams.get('access_token') === 'token-c-ig'));

  // One conversation, oldest message first; a message without text is an attachment.
  const thread = await conversationMessages('ws-1', { connectionId: 'c-fb', conversationId: 't_new', encryptionKey: KEY });
  assert.deepStrictEqual(thread.messages.map((item) => item.id), ['m0', 'm1']);
  assert.strictEqual(thread.messages[0].hasAttachment, true);
  assert.strictEqual(thread.with.name, 'Ana Ruiz');

  // Sending: the recipient comes from the conversation, Messenger replies are marked as responses.
  calls.length = 0;
  const sent = await sendMessage('ws-1', { connectionId: 'c-fb', conversationId: 't_new', text: '  Yes, we do!  ', encryptionKey: KEY });
  assert.deepStrictEqual([sent.id, sent.text, sent.mine], ['mid.9', 'Yes, we do!', true]);
  const post = calls.find((call) => call.method === 'POST');
  assert.deepStrictEqual([post.body.recipient, post.body.message, post.body.messaging_type], [{ id: 'psid-1' }, { text: 'Yes, we do!' }, 'RESPONSE']);

  // Limits and ownership.
  await assert.rejects(sendMessage('ws-1', { connectionId: 'c-ig', conversationId: 't_new', text: 'x'.repeat(1001), encryptionKey: KEY }), /up to 1,000 characters/, 'Instagram allows 1,000 characters');
  await assert.rejects(sendMessage('ws-1', { connectionId: 'c-fb', conversationId: 't_new', text: '   ', encryptionKey: KEY }), /Write a message/);
  await assert.rejects(sendMessage('ws-1', { connectionId: 'c-other', conversationId: 't_new', text: 'hi', encryptionKey: KEY }), (error) => error.status === 404, 'another workspace’s account is not found');
  await assert.rejects(conversationMessages('ws-1', { connectionId: 'c-li', conversationId: 't_new', encryptionKey: KEY }), (error) => error.status === 404, 'LinkedIn has no messages here');
  await assert.rejects(conversationMessages('ws-1', { connectionId: 'c-fb', conversationId: '../me?x', encryptionKey: KEY }), /Choose a conversation/);
  console.log('messages: ok');
})().catch((error) => { console.error(error); process.exit(1); });
