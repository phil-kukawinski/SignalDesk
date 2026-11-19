// Names on posts ("Scheduled by Phil"): the name someone set in their account, else the start of their email,
// looked up once and reused for a while instead of on every calendar load. Posts say who approved them.
const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc' });
let lookups = 0;
const ok = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
global.fetch = async (url) => {
  const text = String(url);
  if (text.includes('/rest/v1/workspace_members')) { lookups += 1; return ok([{ user_id: 'u1', email: 'phil@pkworks.co' }, { user_id: 'u2', email: 'sam.lee@example.com' }]); }
  if (text.endsWith('/auth/v1/admin/users/u1')) return ok({ user_metadata: { display_name: '  Phil\nK  ' } });
  if (text.endsWith('/auth/v1/admin/users/u2')) return ok({ user_metadata: {} });
  return new Response('{}', { status: 404 });
};
const { workspacePeople } = require(ROOT + '/api/_lib/core.js');

(async () => {
  const people = await workspacePeople('ws-1');
  assert.deepStrictEqual(people, { u1: 'Phil K', u2: 'sam.lee' });
  await workspacePeople('ws-1');
  assert.strictEqual(lookups, 1, 'names are reused for a while');
  const source = require('node:fs').readFileSync(ROOT + '/api/_lib/publishing.js', 'utf8');
  assert.match(source, /approvedBy: row\.approved_by/, 'posts say who approved them');
  console.log('people: ok');
})().catch((error) => { console.error(error); process.exit(1); });
