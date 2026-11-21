const { send, getConfig } = require('./_lib/core');
const { verifyStripeSignature, handleStripeEvent } = require('./_lib/billing');

// Stripe's webhook: plan changes (customer.subscription.*) and credit purchases (checkout.session.completed).
// The signature is checked against the raw body first. Each event is handled once (stripe_events).

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
  if (!process.env.STRIPE_WEBHOOK_SECRET || getConfig().missing.length) return send(res, 503, { error: 'Payments aren’t set up.' });
  let body = '';
  try { body = await rawBody(req); } catch { return send(res, 400, { error: 'Could not read the request.' }); }
  if (!verifyStripeSignature(body, req.headers?.['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)) return send(res, 400, { error: 'Bad signature.' });
  try {
    return send(res, 200, { received: true, ...await handleStripeEvent(JSON.parse(body)) });
  } catch (error) {
    console.error('Stripe event failed:', error.message);
    require('./_lib/platform').recordAppError('api/stripe', error);
    // A 500 makes Stripe retry later, which is what we want for a database hiccup.
    return send(res, 500, { error: 'Not handled yet.' });
  }
};

module.exports.config = { api: { bodyParser: false } };
