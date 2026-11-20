const { send, getConfig } = require('./_lib/core');
const { verifySignature, handleReply, replyConfigured } = require('./_lib/replies');

// Resend's webhook for received email (event email.received): client replies to review emails. The
// signature is checked against the raw body before anything is read. Always answers 200 once the
// signature is good, so Resend doesn't keep resending a reply that was handled or ignored.

// Read the stream before touching req.body: Vercel parses req.body on first access, which would use up
// the stream and lose the exact bytes the signature covers.
async function rawBody(req) {
  const chunks = [];
  if (typeof req[Symbol.asyncIterator] === 'function') for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (chunks.length) return Buffer.concat(chunks).toString('utf8');
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  return '';
}

module.exports = async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
  if (!replyConfigured() || getConfig().missing.length) return send(res, 503, { error: 'Email replies aren’t set up.' });
  let body = '';
  try { body = await rawBody(req); } catch { return send(res, 400, { error: 'Could not read the request.' }); }
  if (!verifySignature(body, req.headers || {}, process.env.RESEND_WEBHOOK_SECRET)) return send(res, 401, { error: 'Bad signature.' });
  try {
    const result = await handleReply(JSON.parse(body));
    return send(res, 200, { ok: true, ...result });
  } catch (error) {
    console.error('Email reply failed:', error.message);
    require('./_lib/platform').recordAppError('api/inbound', error);
    return send(res, 200, { ok: false });
  }
};

// The raw body is needed for the signature check.
module.exports.config = { api: { bodyParser: false } };
