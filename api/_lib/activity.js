const { databaseRequest } = require('./core');

// The workspace-wide activity list for admins. Post events come from post_history; team, account,
// client, and settings changes come from activity_log.
const ACTIVITY_GROUPS = {
  team: ['member_invited', 'member_role_changed', 'member_removed', 'invite_removed'],
  accounts: ['account_connected', 'account_disconnected'],
  workspace: ['client_added', 'client_updated', 'client_removed', 'settings_changed', 'autopilot_saved', 'autopilot_deleted', 'review_link_created', 'review_link_revoked']
};
const PAGE = 50;
const KEEP_DAYS = 365;

// A log problem should never stop the change it describes.
async function recordActivity(workspaceId, actorName, action, detail = {}) {
  await databaseRequest('activity_log', {
    method: 'POST', headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ workspace_id: workspaceId, actor_name: actorName || null, action, detail })
  }).catch((error) => console.error('Could not record activity:', error.message));
}

function trimDetail(detail = {}) {
  const { previous, ...rest } = detail;
  return previous ? { ...rest, previous: { text: String(previous.text || '').slice(0, 100) } } : rest;
}

async function listActivity(workspaceId, { group = '', before = '' } = {}) {
  const limit = `order=created_at.desc,id.desc&limit=${PAGE + 1}`;
  const scope = new URLSearchParams({ workspace_id: `eq.${workspaceId}` });
  if (before && Number.isFinite(Date.parse(before))) scope.append('created_at', `lt.${new Date(before).toISOString()}`);
  const wantPosts = !group || group === 'posts';
  const groups = group ? ACTIVITY_GROUPS[group] : Object.values(ACTIVITY_GROUPS).flat();
  const posts = wantPosts ? await databaseRequest(`post_history?${scope}&select=id,post_id,action,actor_name,detail,created_at&${limit}`) || [] : [];
  // Until the latest schema has run there's no activity_log table, and post events still show.
  let logged = [], ready = true;
  if (groups) {
    try {
      logged = await databaseRequest(`activity_log?${scope}&action=in.(${groups.join(',')})&select=id,action,actor_name,detail,created_at&${limit}`) || [];
    } catch {
      ready = false;
    }
  }
  const merged = [...posts.map((row) => ({ ...row, kind: 'post' })), ...logged.map((row) => ({ ...row, kind: 'workspace' }))]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const page = merged.slice(0, PAGE);
  const ids = [...new Set(page.filter((row) => row.kind === 'post').map((row) => row.post_id))];
  const titles = new Map((ids.length ? await databaseRequest(`scheduled_posts?id=in.(${ids.join(',')})&select=id,title,client_id`) || [] : []).map((row) => [row.id, row]));
  return {
    ready,
    next: merged.length > PAGE ? page[page.length - 1].created_at : null,
    activity: page.map((row) => ({
      id: `${row.kind}-${row.id}`, kind: row.kind, action: row.action, actor: row.actor_name, at: row.created_at, detail: trimDetail(row.detail),
      ...(row.kind === 'post' ? { postId: row.post_id, title: titles.get(row.post_id)?.title || '', clientId: titles.get(row.post_id)?.client_id || '' } : {})
    }))
  };
}

async function cleanupActivity({ now = Date.now() } = {}) {
  await databaseRequest(`activity_log?created_at=lt.${new Date(now - KEEP_DAYS * 86400000).toISOString()}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } });
}

module.exports = { ACTIVITY_GROUPS, KEEP_DAYS, recordActivity, listActivity, cleanupActivity };
