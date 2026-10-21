// Link checks (no private addresses, redirects, HEAD fallback) and AI proofreading filters.
const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
process.env.ANTHROPIC_API_KEY = 'test';
require('node:dns').promises.lookup = async (host) => [{ address: host.endsWith('.internal') ? '10.0.0.9' : '93.184.216.34', family: 4 }];
let aiReply;
global.fetch = async (url, opts = {}) => {
  url = String(url); const method = opts.method || 'GET';
  if (url.includes('api.anthropic.com')) return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: aiReply.stop || 'end_turn', content: [{ type: 'text', text: JSON.stringify({ issues: aiReply.issues }) }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  if (url === 'https://ok.test/') return new Response(null, { status: 200 });
  if (url === 'https://moved.test/') return new Response(null, { status: 301, headers: { location: 'https://ok.test/' } });
  if (url === 'https://sneaky.test/') return new Response(null, { status: 302, headers: { location: 'http://admin.internal/' } });
  if (url === 'https://nohead.test/') return new Response(null, { status: method === 'HEAD' ? 405 : 200 });
  if (url === 'https://missing.test/') return new Response(null, { status: 404 });
  if (url === 'https://blocked.test/') return new Response(null, { status: 999 });
  throw new Error('unexpected ' + method + ' ' + url);
};
const { checkLink } = require(ROOT + '/api/_lib/core.js');
const { proofreadTexts } = require(ROOT + '/api/_lib/proofread.js');
(async () => {
  assert.equal((await checkLink('https://ok.test/')).status, 'ok');
  const moved = await checkLink('https://moved.test/');
  assert.equal(moved.status, 'ok'); assert.equal(moved.finalUrl, 'https://ok.test/');
  assert.notEqual((await checkLink('https://sneaky.test/')).status, 'ok', 'a redirect to a private address is refused');
  assert.notEqual((await checkLink('http://127.0.0.1/')).status, 'ok');
  assert.equal((await checkLink('https://nohead.test/')).status, 'ok', 'falls back to GET when HEAD is refused');
  const missing = await checkLink('https://missing.test/');
  assert.equal(missing.status, 'broken'); assert.match(missing.detail, /404/);
  // Proofreading keeps only suggestions that point at real text in the right version.
  aiReply = { issues: [
    { key: 'all', original: 'Their going', suggestion: "They're going", type: 'grammar', reason: 'x' },
    { key: 'all', original: 'not in the text', suggestion: 'y', type: 'spelling', reason: 'x' },
    { key: 'facebook', original: 'Their', suggestion: 'There', type: 'spelling', reason: 'unknown key' },
    { key: 'all', original: 'love', suggestion: 'love', type: 'clarity', reason: 'no change' }
  ] };
  const issues = await proofreadTexts([{ key: 'all', label: 'Post', text: 'Their going to love it' }]);
  assert.deepEqual(issues.map((issue) => issue.original), ['Their going']);
  aiReply = { issues: [], stop: 'refusal' };
  await assert.rejects(proofreadTexts([{ key: 'all', label: 'Post', text: 'x' }]), /declined/);
  delete process.env.ANTHROPIC_API_KEY;
  await assert.rejects(proofreadTexts([{ key: 'all', label: 'Post', text: 'x' }]), /not configured/);
  console.log('check/proofread tests passed');
})().catch((error) => { console.error(error); process.exit(1); });
