// Direct messages to connected Facebook Pages and Instagram professional accounts, read live from Meta's
// Conversations API and answered with the Send API. Nothing is stored: each look at the inbox asks Meta.
// Meta lets a business answer only within 24 hours of the person's last message.
const { httpError } = require('./core');
const { graph } = require('./platforms');
const { listConnections, loadConnection, ensureFreshToken } = require('./publishing');

const MESSAGE_WINDOW_MS = 24 * 3600000;
const MESSAGE_NETWORKS = { facebook: 'messenger', instagram: 'instagram' };
const TEXT_LIMITS = { facebook: 2000, instagram: 1000 };
const ID = /^[A-Za-z0-9_:=.-]{1,300}$/;

// The Page that owns the conversations: the Page itself, or the Page an Instagram account is linked to.
const pageIdFor = (connection) => (connection.platform === 'facebook' ? connection.external_id : connection.meta?.pageId);
const isMine = (connection, from = {}) => from.id === connection.external_id || from.id === pageIdFor(connection) || Boolean(connection.username && from.username === connection.username);
const shapeMessage = (connection, item) => ({ id: item.id, text: item.message || '', at: item.created_time || null, mine: isMine(connection, item.from), hasAttachment: !item.message });
function otherPerson(connection, participants) {
  const person = (participants?.data || []).find((item) => !isMine(connection, item)) || {};
  return { id: person.id || '', name: person.name || (person.username ? `@${person.username}` : connection.platform === 'instagram' ? 'Instagram user' : 'Facebook user') };
}

// Plain reasons for the errors Meta gives here, instead of the generic "reconnect" its codes suggest.
function messageError(error) {
  const text = String(error.message || '');
  if (/outside (of )?(the )?allowed window|24 hour/i.test(text)) return httpError(400, 'It’s been more than 24 hours since they last wrote, so Meta doesn’t let a business answer from another app. Reply in the Facebook or Instagram app instead.');
  if (/permission|not authorized|access/i.test(text) || error.kind === 'auth') return httpError(400, 'This account hasn’t allowed SignalDesk to read and answer messages. Reconnect it in Social Accounts and allow messages.');
  if (/isn.t available|not available|551/i.test(text)) return httpError(400, 'This person isn’t available to message right now.');
  return httpError(502, text || 'Meta didn’t answer. Try again in a minute.');
}

async function messagingConnection(workspaceId, connectionId, encryptionKey) {
  if (typeof connectionId !== 'string' || !ID.test(connectionId)) throw httpError(400, 'Choose an account.');
  const connection = await loadConnection(connectionId, encryptionKey);
  if (!connection || connection.workspace_id !== workspaceId || !MESSAGE_NETWORKS[connection.platform]) throw httpError(404, 'That account isn’t connected to this workspace.');
  if (connection.status !== 'active') throw httpError(400, 'This account needs reconnecting in Social Accounts.');
  if (!pageIdFor(connection)) throw httpError(400, 'Reconnect this Instagram account in Social Accounts so SignalDesk knows its Facebook Page.');
  return ensureFreshToken(connection, encryptionKey);
}

// The latest conversations on each connected Page and Instagram account. A conversation needs a reply
// when the last message is theirs; `replyBy` is when Meta's 24-hour window closes.
async function listConversations(workspaceId, { clientId = '', encryptionKey, now = Date.now() } = {}) {
  const accounts = (await listConnections(workspaceId, clientId || null)).filter((row) => MESSAGE_NETWORKS[row.platform] && row.status === 'active');
  const results = await Promise.allSettled(accounts.map(async (row) => {
    const connection = await messagingConnection(workspaceId, row.id, encryptionKey);
    const result = await graph(`${pageIdFor(connection)}/conversations`, { token: connection.token, params: { platform: MESSAGE_NETWORKS[connection.platform], fields: 'id,updated_time,participants,messages.limit(1){id,message,from,created_time}', limit: '25' } });
    return (result.data || []).map((item) => {
      const last = item.messages?.data?.[0] ? shapeMessage(connection, item.messages.data[0]) : null;
      const needsReply = Boolean(last && !last.mine);
      const replyBy = needsReply && last.at ? new Date(Date.parse(last.at) + MESSAGE_WINDOW_MS).toISOString() : null;
      return { id: item.id, connectionId: row.id, clientId: row.client_id, platform: row.platform, account: row.username ? `@${row.username}` : row.display_name || '', with: otherPerson(connection, item.participants), updatedAt: item.updated_time || last?.at || null, last, needsReply, replyBy, canReply: !replyBy || Date.parse(replyBy) > now };
    });
  }));
  const conversations = [], problems = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') conversations.push(...result.value);
    else problems.push({ connectionId: accounts[index].id, clientId: accounts[index].client_id, platform: accounts[index].platform, account: accounts[index].username ? `@${accounts[index].username}` : accounts[index].display_name || '', ...(() => { const error = result.reason.status ? result.reason : messageError(result.reason); return { error: error.message, permission: /allow messages/.test(error.message) }; })() });
  });
  conversations.sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
  return { conversations, problems, accounts: accounts.length };
}

// One conversation's recent messages, oldest first. Meta returns only the 20 most recent.
async function conversationMessages(workspaceId, { connectionId, conversationId, encryptionKey }) {
  if (typeof conversationId !== 'string' || !ID.test(conversationId)) throw httpError(400, 'Choose a conversation.');
  const connection = await messagingConnection(workspaceId, connectionId, encryptionKey);
  try {
    const result = await graph(conversationId, { token: connection.token, params: { fields: 'participants,messages.limit(20){id,message,from,created_time}' } });
    return { with: otherPerson(connection, result.participants), messages: (result.messages?.data || []).map((item) => shapeMessage(connection, item)).reverse() };
  } catch (error) {
    throw messageError(error);
  }
}

// Sends a text reply. The recipient comes from the conversation itself, never from the browser.
async function sendMessage(workspaceId, { connectionId, conversationId, text, encryptionKey }) {
  if (typeof conversationId !== 'string' || !ID.test(conversationId)) throw httpError(400, 'Choose a conversation.');
  const connection = await messagingConnection(workspaceId, connectionId, encryptionKey);
  const message = typeof text === 'string' ? text.trim() : '';
  const limit = TEXT_LIMITS[connection.platform];
  if (!message || message.length > limit) throw httpError(400, `Write a message up to ${limit.toLocaleString('en-US')} characters.`);
  try {
    const conversation = await graph(conversationId, { token: connection.token, params: { fields: 'participants' } });
    const recipient = otherPerson(connection, conversation.participants);
    if (!recipient.id) throw httpError(404, 'That conversation wasn’t found.');
    const result = await graph(`${pageIdFor(connection)}/messages`, { method: 'POST', token: connection.token, sending: true, params: { recipient: { id: recipient.id }, message: { text: message }, ...(connection.platform === 'facebook' ? { messaging_type: 'RESPONSE' } : {}) } });
    return { id: result.message_id || null, text: message, at: new Date().toISOString(), mine: true };
  } catch (error) {
    throw error.status ? error : messageError(error);
  }
}

module.exports = { listConversations, conversationMessages, sendMessage, MESSAGE_WINDOW_MS, TEXT_LIMITS };
