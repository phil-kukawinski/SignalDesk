const crypto = require('node:crypto');
const { send, getConfig, databaseRequest, getWorkspaceState } = require('./_lib/core');
const { approvePost, listNotes, addNote, contentFor, addHistory } = require('./_lib/publishing');
const { notify } = require('./_lib/notify');

// The client review page. A client opens a private link (no SignalDesk account) to see a
// client's upcoming posts, approve them, or ask for changes. The link's secret is sent in
// the request body and only its hash is stored.

const LOOKAHEAD_DAYS = 60;
const PLATFORM_LABELS = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', pinterest: 'Pinterest', tiktok: 'TikTok', youtube: 'YouTube', twitter: 'X', threads: 'Threads', bluesky: 'Bluesky', gmb: 'Google Business Profile', reddit: 'Reddit', telegram: 'Telegram', snapchat: 'Snapchat', whatsapp: 'WhatsApp' };

async function findLink(token) {
  if (typeof token !== 'string' || !/^[\w-]{40,64}$/.test(token)) return null;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const rows = await databaseRequest(`review_links?token_hash=eq.${hash}&revoked_at=is.null&select=id,workspace_id,client_id,expires_at`);
  const link = rows?.[0];
  return link && Date.parse(link.expires_at) > Date.now() ? link : null;
}

function publicPost(row, notes) {
  const platforms = [...new Set((row.publish_jobs || []).filter((job) => job.status !== 'canceled').map((job) => job.platform))];
  return {
    id: row.id, title: row.title, scheduledFor: row.scheduled_for, status: row.status === 'pending_approval' ? 'waiting' : 'scheduled',
    clientStatus: row.client_status, campaign: row.campaign || '',
    versions: platforms.map((platform) => ({ platform, label: PLATFORM_LABELS[platform] || platform, ...contentFor(row, platform) })),
    notes: notes.filter((note) => note.postId === row.id).map(({ author, body, decision, at }) => ({ author, body, decision, at }))
  };
}

async function reviewablePost(link, postId) {
  if (typeof postId !== 'string' || !/^[0-9a-f-]{36}$/i.test(postId)) return null;
  const rows = await databaseRequest(`scheduled_posts?workspace_id=eq.${link.workspace_id}&client_id=eq.${encodeURIComponent(link.client_id)}&id=eq.${postId}&status=in.(pending_approval,scheduled)&select=id,title,status,scheduled_for,created_by`);
  return rows?.[0] || null;
}

function icsText(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/[,;]/g, (char) => `\\${char}`).replace(/\r?\n/g, '\\n');
}

function icsDate(value) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// A calendar feed of the client's upcoming posts for calendar apps. Calendar apps can't send
// a request body, so this one request takes the link's secret in the address.
async function calendarFeed(req, res) {
  const token = new URL(req.url, 'http://localhost').searchParams.get('t');
  const link = await findLink(token);
  if (!link) return send(res, 404, { error: 'This calendar link has expired or was turned off.' });
  const client = ((await getWorkspaceState(link.workspace_id)).clients || []).find((item) => item.id === link.client_id);
  const query = new URLSearchParams({ select: 'id,title,status,scheduled_for,content,publish_jobs(platform,status)', workspace_id: `eq.${link.workspace_id}`, client_id: `eq.${link.client_id}`, status: 'in.(pending_approval,scheduled,publishing,published,partial)', order: 'scheduled_for.asc', limit: '300' });
  query.append('scheduled_for', `gte.${new Date(Date.now() - 30 * 86400000).toISOString()}`);
  query.append('scheduled_for', `lte.${new Date(Date.now() + LOOKAHEAD_DAYS * 86400000).toISOString()}`);
  const rows = await databaseRequest(`scheduled_posts?${query}`) || [];
  const events = rows.map((row) => {
    const networks = [...new Set((row.publish_jobs || []).filter((job) => job.status !== 'canceled').map((job) => PLATFORM_LABELS[job.platform] || job.platform))].join(', ');
    return ['BEGIN:VEVENT', `UID:${row.id}@signaldesk`, `DTSTAMP:${icsDate(Date.now())}`, `DTSTART:${icsDate(row.scheduled_for)}`, 'DURATION:PT15M',
      `SUMMARY:${icsText(`${row.title || 'Post'} (${networks})`)}`, `DESCRIPTION:${icsText(`${row.status === 'pending_approval' ? 'Waiting for approval. ' : ''}${(row.content?.text || '').slice(0, 900)}`)}`, 'END:VEVENT'].join('\r\n');
  });
  res.statusCode = 200;
  res.setHeader('content-type', 'text/calendar; charset=utf-8');
  res.setHeader('content-disposition', 'inline; filename="posts.ics"');
  res.end(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SignalDesk//Posts//EN', `X-WR-CALNAME:${icsText(`${client?.name || 'Client'} posts`)}`, 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join('\r\n'));
}

module.exports = async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('referrer-policy', 'no-referrer');
  if (req.method === 'GET' && new URL(req.url || '/', 'http://localhost').searchParams.get('format') === 'ics') {
    if (getConfig().missing.length) return send(res, 503, { error: 'Calendar feeds aren’t available right now.' });
    try { return await calendarFeed(req, res); } catch (error) { console.error('Calendar feed failed:', error.message);
    require('./_lib/platform').recordAppError('api/review', error); return send(res, 500, { error: 'Something went wrong.' }); }
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return send(res, 400, { error: 'Invalid request.' }); } }
  if (!body || typeof body !== 'object') return send(res, 400, { error: 'Invalid request.' });
  if (getConfig().missing.length) return send(res, 503, { error: 'Reviews aren’t available right now.' });
  try {
    const link = await findLink(body.token);
    if (!link) return send(res, 404, { error: 'This review link has expired or was turned off. Ask for a new one.' });
    await databaseRequest(`review_links?id=eq.${link.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ last_used_at: new Date().toISOString() }) });
    const state = await getWorkspaceState(link.workspace_id);
    const client = (state.clients || []).find((item) => item.id === link.client_id);
    if (!client) return send(res, 404, { error: 'This review link is no longer active.' });

    if (body.action === 'load') {
      const now = Date.now();
      const query = new URLSearchParams({
        select: 'id,title,status,scheduled_for,client_status,campaign,content,publish_jobs(platform,status)',
        workspace_id: `eq.${link.workspace_id}`, client_id: `eq.${link.client_id}`, status: 'in.(pending_approval,scheduled)', order: 'scheduled_for.asc', limit: '100'
      });
      query.append('scheduled_for', `gte.${new Date(now - 86400000).toISOString()}`);
      query.append('scheduled_for', `lte.${new Date(now + LOOKAHEAD_DAYS * 86400000).toISOString()}`);
      const rows = await databaseRequest(`scheduled_posts?${query}`) || [];
      // Clients see their own comments, never the team's internal notes.
      const notes = rows.length ? await listNotes(link.workspace_id, rows.map((row) => row.id), { clientOnly: true }) : [];
      return send(res, 200, {
        client: { name: client.name, initials: client.initials, color: client.brand?.colors?.[0] || client.text || '#5b8db8', logo: /^https:\/\//.test(client.brand?.logo || '') ? client.brand.logo : '' },
        workspace: state.settings?.name || 'SignalDesk',
        expiresAt: link.expires_at,
        posts: rows.map((row) => publicPost(row, notes))
      });
    }

    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
    const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
    if (!name) return send(res, 400, { error: 'Add your name so the team knows who reviewed this.' });
    if (comment.length > 2000) return send(res, 400, { error: 'Comments can be up to 2,000 characters.' });
    const post = await reviewablePost(link, body.postId);
    if (!post) return send(res, 404, { error: 'This post has already gone out or was removed.' });

    if (body.action === 'decide') {
      if (!['approved', 'changes_requested'].includes(body.decision)) return send(res, 400, { error: 'Choose approve or request changes.' });
      if (body.decision === 'changes_requested' && !comment) return send(res, 400, { error: 'Say what should change.' });
      await addNote({ workspaceId: link.workspace_id, postId: post.id, authorName: name, kind: 'client', body: comment, decision: body.decision });
      await databaseRequest(`scheduled_posts?id=eq.${post.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ client_status: body.decision }) });
      await addHistory(link.workspace_id, post.id, body.decision === 'approved' ? 'client_approved' : 'client_requested_changes', { actorName: `${name} (client)`, detail: { comment } });
      // A post the team sent for approval is released when the client approves it.
      let released = false;
      if (body.decision === 'approved' && post.status === 'pending_approval') {
        await approvePost(link.workspace_id, post.id, null);
        released = true;
      }
      await notify({
        workspaceId: link.workspace_id, audience: 'admins', type: 'client_review', category: 'approvals',
        title: body.decision === 'approved' ? `${client.name} approved “${post.title || 'a post'}”` : `${client.name} asked for changes to “${post.title || 'a post'}”`,
        body: `${name}${comment ? `: ${comment.slice(0, 200)}` : ''}${released ? ' It’s now scheduled.' : ''}`, view: 'calendar', data: { postId: post.id }
      });
      return send(res, 200, { ok: true, released });
    }

    if (body.action === 'comment') {
      if (!comment) return send(res, 400, { error: 'Write a comment first.' });
      await addNote({ workspaceId: link.workspace_id, postId: post.id, authorName: name, kind: 'client', body: comment });
      await notify({ workspaceId: link.workspace_id, audience: 'admins', type: 'client_comment', category: 'approvals', title: `${client.name} commented on “${post.title || 'a post'}”`, body: `${name}: ${comment.slice(0, 200)}`, view: 'calendar', data: { postId: post.id } });
      return send(res, 200, { ok: true });
    }

    return send(res, 400, { error: 'Unknown review action.' });
  } catch (error) {
    if (error.status && error.status < 500) return send(res, error.status, { error: error.message });
    console.error('Review request failed:', error.message);
    require('./_lib/platform').recordAppError('api/review', error);
    return send(res, 500, { error: 'Something went wrong. Try again.' });
  }
};
