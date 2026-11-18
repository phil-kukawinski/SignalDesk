const { databaseRequest } = require('./core');

// Deletes uploads nobody uses anymore. A file is removed only when it is older than
// KEEP_DAYS and no draft, saved post, or recent scheduled post refers to it. If any
// reference can't be read, nothing is deleted.

const BUCKET = 'social-media';
const KEEP_DAYS = 30;
const PATH_PATTERN = /\/storage\/v1\/object\/public\/social-media\/([^"'?#\s)\\]+)/g;

function storageRequest(path, { method = 'GET', body } = {}) {
  return fetch(`${process.env.SUPABASE_URL}/storage/v1/${path}`, {
    method,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json'
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  }).then(async (response) => {
    if (!response.ok) throw new Error(`Storage returned HTTP ${response.status}.`);
    return response.json().catch(() => null);
  });
}

async function listFolder(prefix) {
  const items = [];
  for (let offset = 0; offset < 10000; offset += 1000) {
    const page = await storageRequest(`object/list/${BUCKET}`, { method: 'POST', body: { prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } } }) || [];
    items.push(...page);
    if (page.length < 1000) break;
  }
  return items;
}

function collectPaths(value, into) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  for (const match of text.matchAll(PATH_PATTERN)) {
    try { into.add(decodeURIComponent(match[1])); } catch { into.add(match[1]); }
  }
}

async function referencedPaths(keepSince) {
  const used = new Set();
  const [posts, drafts, sharedDrafts, states] = await Promise.all([
    databaseRequest(`scheduled_posts?or=(status.in.(pending_approval,scheduled,publishing),updated_at.gte.${keepSince})&select=content`),
    databaseRequest('user_drafts?select=draft,saved'),
    databaseRequest('saved_drafts?select=draft'),
    databaseRequest('workspace_state?select=state')
  ]);
  if (!Array.isArray(posts) || !Array.isArray(drafts) || !Array.isArray(sharedDrafts) || !Array.isArray(states)) throw new Error('Could not read media references.');
  posts.forEach((row) => collectPaths(row.content, used));
  drafts.forEach((row) => { collectPaths(row.draft, used); collectPaths(row.saved, used); });
  sharedDrafts.forEach((row) => collectPaths(row.draft, used));
  states.forEach((row) => collectPaths(row.state, used));
  return used;
}

async function cleanupMedia({ limit = 200, now = Date.now() } = {}) {
  const cutoff = now - KEEP_DAYS * 86400000;
  const used = await referencedPaths(new Date(cutoff).toISOString());
  const stale = [];
  for (const folder of await listFolder('')) {
    if (folder.id) continue; // uploads always live in a per-person folder
    for (const file of await listFolder(folder.name)) {
      // Profile photos are in use for as long as the person keeps them, with no post pointing at them.
      if (!file.id || file.name.startsWith('avatar-')) continue;
      const path = `${folder.name}/${file.name}`;
      const created = Date.parse(file.created_at || file.updated_at);
      if (Number.isFinite(created) && created < cutoff && !used.has(path)) stale.push(path);
      if (stale.length >= limit) break;
    }
    if (stale.length >= limit) break;
  }
  if (stale.length) await storageRequest(`object/${BUCKET}`, { method: 'DELETE', body: { prefixes: stale } });
  return { deleted: stale.length, referenced: used.size };
}

// Storage used by each workspace, in media_files, for storage limits later (docs/pricing-plan.md).
// Uploads sit in each person's folder, and a person belongs to one workspace. Profile photos don't
// count. Files deleted since the last run drop out.
async function syncMediaFiles({ now = new Date() } = {}) {
  const members = await databaseRequest('workspace_members?select=user_id,workspace_id');
  if (!Array.isArray(members)) throw new Error('Could not read workspace members.');
  const workspaceOf = new Map(members.map((row) => [row.user_id, row.workspace_id]));
  const seenAt = now.toISOString();
  const rows = [];
  for (const folder of await listFolder('')) {
    if (folder.id) continue;
    const userId = /^[0-9a-f-]{36}$/i.test(folder.name) ? folder.name : null;
    for (const file of await listFolder(folder.name)) {
      if (!file.id || file.name.startsWith('avatar-')) continue;
      rows.push({
        path: `${folder.name}/${file.name}`, workspace_id: workspaceOf.get(userId) || null, user_id: userId,
        size_bytes: Math.max(0, Number(file.metadata?.size) || 0), created_at: file.created_at || seenAt, seen_at: seenAt
      });
    }
  }
  for (let index = 0; index < rows.length; index += 500) {
    await databaseRequest('media_files?on_conflict=path', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(index, index + 500)) });
  }
  await databaseRequest(`media_files?seen_at=lt.${encodeURIComponent(seenAt)}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } });
  return { files: rows.length, bytes: rows.reduce((sum, row) => sum + row.size_bytes, 0) };
}

module.exports = { cleanupMedia, syncMediaFiles, collectPaths, referencedPaths, KEEP_DAYS };
