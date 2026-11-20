const crypto = require('node:crypto');
const { databaseRequest, getWorkspaceState } = require('./core');
const { approvePost, addNote, addHistory } = require('./publishing');
const { notify, sendEmail, renderEmail, reportEmails } = require('./notify');

// Approving by email reply. Review emails get a reply-to of review+<code>@INBOUND_EMAIL_DOMAIN. Resend
// receives the reply and calls api/inbound.js, which checks the signature, fetches the reply's text,
// and acts on it here: APPROVE approves every post that email listed; CHANGES (with what to change)
// asks for changes on them. Only replies from the client's report addresses count.

const CODE_DAYS = 14;
const replyConfigured = () => Boolean(process.env.INBOUND_EMAIL_DOMAIN && process.env.RESEND_WEBHOOK_SECRET && process.env.RESEND_API_KEY);

async function createReplyCode({ workspaceId, clientId, linkId, postIds, sentTo }) {
  const code = crypto.randomBytes(15).toString('hex');
  await databaseRequest('email_reply_codes', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ code, workspace_id: workspaceId, client_id: clientId, link_id: linkId || null, post_ids: postIds.slice(0, 50), sent_to: sentTo, expires_at: new Date(Date.now() + CODE_DAYS * 86400000).toISOString() }) });
  return `review+${code}@${process.env.INBOUND_EMAIL_DOMAIN}`;
}

// Svix-style signature (what Resend webhooks use): HMAC-SHA256 of "<id>.<timestamp>.<raw body>" with the
// base64 secret after "whsec_", compared against each "v1,<base64>" in the signature header. Rejects
// anything more than 5 minutes old.
function verifySignature(rawBody, headers, secret, now = Date.now()) {
  const id = headers['svix-id'], timestamp = headers['svix-timestamp'], signatures = String(headers['svix-signature'] || '');
  if (!id || !timestamp || !signatures || !secret) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signatures.split(' ').some((part) => {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) return false;
    const given = Buffer.from(value, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

// The reply itself: the text above the quoted original, without signatures.
function replyText(text, html) {
  let body = typeof text === 'string' && text.trim() ? text : String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  const lines = [];
  for (const line of body.replace(/\r/g, '').split('\n')) {
    if (/^\s*>/.test(line) || /^On .+wrote:\s*$/.test(line.trim()) || /^-{2,}\s*Original Message/i.test(line.trim()) || /^From:\s/.test(line.trim()) || /^--\s*$/.test(line) || /^Sent from my /i.test(line.trim())) break;
    lines.push(line);
  }
  return lines.join('\n').trim();
}

function replyDecision(text) {
  const clean = text.trim();
  if (/^(approve|approved|approve all|yes|ok|okay|looks good|lgtm|good to go)\b[.!]*/i.test(clean)) return { decision: 'approved', comment: clean.replace(/^(approve all|approved|approve|yes|okay|ok|looks good|lgtm|good to go)\b[.!,:\s-]*/i, '').trim().slice(0, 2000) };
  const changes = clean.match(/^(changes?|change requested|please change|no)\b[.!,:\s-]*([\s\S]*)$/i);
  if (changes) return { decision: 'changes_requested', comment: changes[2].trim().slice(0, 2000) };
  return null;
}

const clean = (address) => String(address || '').toLowerCase().replace(/^.*<([^>]+)>.*$/, '$1').trim();

async function fetchReceivedEmail(id) {
  const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}` } });
  if (!response.ok) throw new Error(`Resend returned HTTP ${response.status} for the reply.`);
  return response.json();
}

// Handles one received email. Returns what happened, for the webhook's reply and the tests.
async function handleReply(event, { fetchEmail = fetchReceivedEmail } = {}) {
  if (event?.type !== 'email.received') return { ignored: 'not a received email' };
  const data = event.data || {};
  const addresses = [...(data.to || []), ...(data.received_for || [])].map(clean);
  const code = addresses.map((address) => address.match(/^review\+([a-f0-9]{30})@/)?.[1]).find(Boolean);
  if (!code) return { ignored: 'no review code' };
  const [row] = await databaseRequest(`email_reply_codes?code=eq.${code}&select=*`) || [];
  if (!row || row.used_at || Date.parse(row.expires_at) < Date.now()) return { ignored: 'code expired or used' };
  const state = await getWorkspaceState(row.workspace_id);
  const client = (state.clients || []).find((item) => item.id === row.client_id);
  const sender = clean(data.from);
  const allowed = reportEmails(client?.reports?.emails);
  if (!client || !allowed.includes(sender) || sender !== clean(row.sent_to)) {
    await notify({ workspaceId: row.workspace_id, audience: 'admins', type: 'client_review', category: 'approvals', level: 'attention', title: `A review reply for ${client?.name || 'a client'} wasn’t used`, body: `It came from ${sender || 'an unknown address'}, which isn’t the address the review email went to. Nothing was approved.`, view: 'approvals' });
    return { ignored: 'sender not allowed' };
  }
  const email = await fetchEmail(data.email_id);
  const text = replyText(email?.text, email?.html);
  const decision = replyDecision(text);
  const agency = state.settings?.name || 'Your social media team';
  const answer = (heading, intro) => sendEmail(sender, `Re: ${data.subject || 'Your review'}`, renderEmail({ eyebrow: agency.toUpperCase(), heading, intro, sections: [], showCta: false, footer: 'Sent by SignalDesk for your social media team.' })).catch(() => {});
  if (!decision || (decision.decision === 'changes_requested' && !decision.comment)) {
    await answer('We couldn’t tell what you meant', 'Reply with APPROVE to approve the posts, or CHANGES followed by what should change. You can also use the review link in the earlier email.');
    return { ignored: 'unclear reply' };
  }
  const posts = row.post_ids.length ? await databaseRequest(`scheduled_posts?workspace_id=eq.${row.workspace_id}&client_id=eq.${encodeURIComponent(row.client_id)}&id=in.(${row.post_ids.join(',')})&status=in.(pending_approval,scheduled)&select=id,title,status,client_status`) || [] : [];
  const name = `${sender} (email reply)`;
  let done = 0;
  for (const post of posts) {
    if (post.client_status === 'approved' && decision.decision === 'approved') continue;
    await addNote({ workspaceId: row.workspace_id, postId: post.id, authorName: sender, kind: 'client', body: decision.comment, decision: decision.decision });
    await databaseRequest(`scheduled_posts?id=eq.${post.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ client_status: decision.decision }) });
    await addHistory(row.workspace_id, post.id, decision.decision === 'approved' ? 'client_approved' : 'client_requested_changes', { actorName: name, detail: { comment: decision.comment, by: 'email' } });
    if (decision.decision === 'approved' && post.status === 'pending_approval') await approvePost(row.workspace_id, post.id, null);
    done += 1;
  }
  await databaseRequest(`email_reply_codes?code=eq.${code}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ used_at: new Date().toISOString() }) });
  const approved = decision.decision === 'approved';
  await notify({ workspaceId: row.workspace_id, audience: 'admins', type: 'client_review', category: 'approvals', level: approved ? 'good' : 'attention', title: approved ? `${client.name} approved ${done} post${done === 1 ? '' : 's'} by email` : `${client.name} asked for changes by email`, body: `${sender}${decision.comment ? `: ${decision.comment.slice(0, 200)}` : ''}`, view: 'approvals' });
  await answer(approved ? `Thanks, ${done} post${done === 1 ? ' is' : 's are'} approved` : 'Thanks, we’ll make the changes', approved ? `${agency} has your OK.` : `${agency} has your note and will follow up.`);
  return { decision: decision.decision, posts: done };
}

module.exports = { CODE_DAYS, replyConfigured, createReplyCode, verifySignature, replyText, replyDecision, handleReply };
