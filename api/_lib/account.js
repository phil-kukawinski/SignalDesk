const { databaseRequest, httpError } = require('./core');

// Self-serve account deletion (Settings → Delete my account), as Meta and privacy laws expect.
// If the person is the only member, their whole workspace goes too: clients, posts, connected
// accounts and their tokens, notes, links, and uploaded files. Otherwise only their own
// membership, drafts, and files are removed, and the workspace stays with the rest of the team.

const BUCKET = 'social-media';

function storage(path, { method = 'GET', body } = {}) {
  return fetch(`${process.env.SUPABASE_URL}/storage/v1/${path}`, {
    method,
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  }).then(async (response) => (response.ok ? response.json().catch(() => null) : null)).catch(() => null);
}

async function listNames(prefix) {
  const names = [];
  for (let offset = 0; offset < 20000; offset += 1000) {
    const page = (await storage(`object/list/${BUCKET}`, { method: 'POST', body: { prefix, limit: 1000, offset } })) || [];
    names.push(...page.filter((item) => item.id).map((item) => `${prefix}${item.name}`));
    if (page.length < 1000) break;
  }
  return names;
}

async function removeFiles(names) {
  for (let index = 0; index < names.length; index += 500) {
    await storage(`object/${BUCKET}`, { method: 'DELETE', body: { prefixes: names.slice(index, index + 500) } });
  }
  return names.length;
}

// What deleting would remove, so the confirmation can say so plainly.
async function deletionPlan(userId) {
  const memberships = await databaseRequest(`workspace_members?user_id=eq.${userId}&select=workspace_id,role`) || [];
  const membership = memberships[0];
  if (!membership) return { workspace: null, soleMember: false, blocked: null };
  const members = await databaseRequest(`workspace_members?workspace_id=eq.${membership.workspace_id}&select=user_id,role`) || [];
  const others = members.filter((member) => member.user_id !== userId);
  const otherAdmins = others.filter((member) => member.role === 'admin');
  const blocked = membership.role === 'admin' && others.length && !otherAdmins.length
    ? 'You’re the only admin. Make another member an admin, or remove the other members, before deleting your account.'
    : null;
  return { workspace: membership.workspace_id, soleMember: !others.length, members: members.length, blocked };
}

async function deleteAccount(user) {
  const plan = await deletionPlan(user.id);
  if (plan.blocked) throw httpError(409, plan.blocked);
  let files = 0;
  if (plan.workspace && plan.soleMember) {
    // Converted Instagram images are named after their jobs; collect them before the jobs go.
    const jobs = (await databaseRequest(`publish_jobs?workspace_id=eq.${plan.workspace}&select=id`) || []).map((job) => job.id);
    if (jobs.length) {
      const converted = await listNames('system/instagram/');
      files += await removeFiles(converted.filter((name) => jobs.some((id) => name.startsWith(`system/instagram/${id}-`))));
    }
    await databaseRequest(`workspaces?id=eq.${plan.workspace}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } });
  } else if (plan.workspace) {
    await databaseRequest(`workspace_members?user_id=eq.${user.id}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } });
  }
  files += await removeFiles(await listNames(`${user.id}/`));
  await databaseRequest(`user_drafts?user_id=eq.${user.id}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } }).catch(() => {});
  await databaseRequest(`push_subscriptions?user_id=eq.${user.id}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } }).catch(() => {});
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
    method: 'DELETE', headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }
  });
  if (!response.ok && response.status !== 404) throw new Error(`Couldn’t delete the sign-in (HTTP ${response.status}). Your data was removed; try again to finish.`);
  return { deleted: true, workspaceDeleted: Boolean(plan.workspace && plan.soleMember), files };
}

module.exports = { deletionPlan, deleteAccount };
