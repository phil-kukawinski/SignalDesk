const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
process.env.ANTHROPIC_API_KEY = 'test';
require('node:dns').promises.lookup = async (host) => [{ address: host === 'internal.test' ? '10.0.0.5' : '93.184.216.34', family: 4 }];
require('node:dns').lookup = (host, opts, cb) => { (cb || opts)(null, [{ address: host === 'internal.test' ? '10.0.0.5' : '93.184.216.34', family: 4 }]); };
let sentImage, aiStatus = 200;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
global.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('api.anthropic.com')) {
    const body = JSON.parse(opts.body); sentImage = body.messages[0].content[0];
    if (aiStatus !== 200) return new Response(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }), { status: aiStatus, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ altText: 'A pink square.' }) }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url === 'https://cdn.test/redirect') return new Response(null, { status: 302, headers: { location: 'https://cdn.test/pic.png' } });
  if (url === 'https://cdn.test/sneaky') return new Response(null, { status: 302, headers: { location: 'http://internal.test/secret.png' } });
  if (url === 'https://cdn.test/pic.png') return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } });
  if (url === 'https://cdn.test/page.html') return new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } });
  if (url === 'https://cdn.test/missing.png') return new Response('', { status: 404 });
  throw new Error('unexpected ' + url);
};
const { describeImage } = require(ROOT + '/api/_lib/captions.js');
(async () => {
  assert.equal(await describeImage({ url: 'https://cdn.test/redirect', context: '' }), 'A pink square.');
  assert.equal(sentImage.source.type, 'base64'); assert.equal(sentImage.source.media_type, 'image/png'); assert.equal(sentImage.source.data, png.toString('base64'));
  await assert.rejects(describeImage({ url: 'https://cdn.test/sneaky' }), /public website/);
  await assert.rejects(describeImage({ url: 'https://cdn.test/page.html' }), /JPEG, PNG/);
  await assert.rejects(describeImage({ url: 'https://cdn.test/missing.png' }), /HTTP 404/);
  aiStatus = 529;
  const err = await describeImage({ url: 'https://cdn.test/pic.png' }).catch((e) => e);
  const { APIError } = require(ROOT + '/node_modules/@anthropic-ai/sdk');
  assert.ok(err instanceof APIError, 'SDK error type'); assert.equal(err.status, 529);
  console.log('alt text tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
