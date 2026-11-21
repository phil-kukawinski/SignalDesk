// Stripe webhook signatures, Stripe's form encoding, which plan a workspace is really on, and the
// public status page.
const ROOT = require('node:path').resolve(__dirname, '../..');
const assert = require('node:assert');
const crypto = require('node:crypto');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc' });
const { verifyStripeSignature, form, activePlan, PLANS } = require(ROOT + '/api/_lib/billing.js');
const secret = 'whsec_test', body = '{"id":"evt_1"}', t = Math.floor(Date.now() / 1000);
const sig = (raw, at = t) => `t=${at},v1=${crypto.createHmac('sha256', secret).update(`${at}.${raw}`).digest('hex')}`;
assert.strictEqual(verifyStripeSignature(body, sig(body), secret), true);
assert.strictEqual(verifyStripeSignature(body + ' ', sig(body), secret), false, 'changed body');
assert.strictEqual(verifyStripeSignature(body, sig(body, t - 600), secret), false, 'too old');
assert.strictEqual(verifyStripeSignature(body, `t=${t},v1=abc,${sig(body).split(',')[1]}`, secret), true, 'any matching v1 counts');
assert.strictEqual(verifyStripeSignature(body, sig(body), 'whsec_other'), false);
assert.strictEqual(form({ mode: 'payment', line_items: { 0: { price: 'p_1', quantity: 1 } }, metadata: { a: 'x y' }, skip: undefined }), 'mode=payment&line_items%5B0%5D%5Bprice%5D=p_1&line_items%5B0%5D%5Bquantity%5D=1&metadata%5Ba%5D=x%20y');
const now = Date.parse('2026-12-01T00:00:00Z');
assert.strictEqual(activePlan({ plan: 'beta' }), null, 'beta keeps beta allowances');
assert.strictEqual(activePlan({ plan: 'pro', plan_status: 'trialing', trial_ends_at: '2026-12-05T00:00:00Z' }, now).plan, 'pro');
assert.strictEqual(activePlan({ plan: 'pro', plan_status: 'trialing', trial_ends_at: '2026-11-20T00:00:00Z' }, now).plan, 'pro', 'a trial that ended but was converted keeps the plan the webhook set');
assert.strictEqual(activePlan({ plan: 'pro', plan_status: 'canceled' }, now).plan, 'free');
assert.strictEqual(activePlan({ plan: 'business', plan_status: 'active', extra_clients: 3 }, now).clients, 18);
assert.strictEqual(PLANS.free.monthlyCredits, 20);

const { statusPage, helpPage } = require(ROOT + '/api/_lib/legal.js');
const page = statusPage({ lastRun: new Date().toISOString(), networks: { instagram: { published: 40, failed: 1 }, pinterest: { published: 2, failed: 5 } } });
assert.match(page, /Publishing is running/);
assert.match(page, /Instagram<\/td><td><span class="dot ok"><\/span>Working/);
assert.match(page, /Pinterest<\/td><td><span class="dot bad"><\/span>Problems/);
assert.match(statusPage({ lastRun: new Date(Date.now() - 3600000).toISOString(), networks: {} }), /Publishing is delayed/);
assert.match(helpPage(), /id="connect"[\s\S]*App passwords/);
console.log('billing: ok');
