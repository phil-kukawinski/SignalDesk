const crypto = require('node:crypto');
const { databaseRequest, httpError } = require('./core');

// Plans, credits, and Stripe (docs/pricing-plan.md). Everything here waits for the billing switch:
// app_settings key "billing_enabled" set to true. Until then every workspace keeps the beta
// allowances and nothing costs credits.

const GB = 1024 * 1024 * 1024;
const PLANS = {
  free: { plan: 'free', clients: 2, teamMembers: 3, monthlyCredits: 20, storageBytes: 2 * GB, historyDays: 90, approvalLinks: false, clientReports: false, removeBadge: false },
  pro: { plan: 'pro', clients: 5, teamMembers: 5, monthlyCredits: 100, storageBytes: 10 * GB, historyDays: 365, approvalLinks: true, clientReports: true, removeBadge: false },
  business: { plan: 'business', clients: 15, teamMembers: 1000, monthlyCredits: 400, storageBytes: 50 * GB, historyDays: 730, approvalLinks: true, clientReports: true, removeBadge: true },
  internal: { plan: 'internal', clients: 1000, teamMembers: 1000, monthlyCredits: 1000, storageBytes: null, historyDays: 3650, approvalLinks: true, clientReports: true, removeBadge: true }
};
// What each AI action costs once billing is on. Anything not listed is free (questions, proofreading,
// image descriptions, Fill from website, reply suggestions).
const CREDIT_COSTS = { 'trends-refresh': 10, 'trends-quick': 4, 'campaign-plan': 2, 'campaign-post': 1, 'draft-captions': 1, 'refresh-post': 1, 'report-summary': 1 };
const CREDIT_PACKS = { 'credits-small': { credits: 60, env: 'STRIPE_PRICE_CREDITS_SMALL' }, 'credits-large': { credits: 200, env: 'STRIPE_PRICE_CREDITS_LARGE' } };
const PLAN_PRICES = { pro: { month: 'STRIPE_PRICE_PRO_MONTHLY', year: 'STRIPE_PRICE_PRO_YEARLY' }, business: { month: 'STRIPE_PRICE_BUSINESS_MONTHLY', year: 'STRIPE_PRICE_BUSINESS_YEARLY' } };

let switchCache = { at: 0, on: false };
async function billingEnabled() {
  if (Date.now() - switchCache.at < 60000) return switchCache.on;
  const rows = await databaseRequest('app_settings?key=eq.billing_enabled&select=value').catch(() => null);
  switchCache = { at: Date.now(), on: rows?.[0]?.value === true || rows?.[0]?.value === 'true' };
  return switchCache.on;
}

async function workspacePlan(workspaceId) {
  const [row] = await databaseRequest(`workspaces?id=eq.${workspaceId}&select=plan,plan_status,current_period_end,trial_ends_at,extra_clients,stripe_customer_id,stripe_subscription_id`).catch(() => []) || [];
  return row || { plan: 'beta' };
}

// The plan a workspace is using right now: a trial counts as Pro until it ends; a lapsed paid plan is Free.
function activePlan(row, now = Date.now()) {
  if (!row || row.plan === 'beta') return null;
  if (row.plan_status === 'trialing' && row.trial_ends_at && Date.parse(row.trial_ends_at) > now) return PLANS.pro;
  if ((row.plan === 'pro' || row.plan === 'business') && ['canceled', 'unpaid', 'incomplete_expired'].includes(row.plan_status)) return PLANS.free;
  const plan = PLANS[row.plan] || PLANS.free;
  return row.plan === 'business' ? { ...plan, clients: plan.clients + Math.max(0, row.extra_clients || 0) } : plan;
}

async function creditBalance(workspaceId) {
  const rows = await databaseRequest('rpc/credit_balance', { method: 'POST', body: JSON.stringify({ p_workspace: workspaceId }) }).catch(() => null);
  const row = Array.isArray(rows) ? rows[0] : rows;
  return { monthly: row?.monthly || 0, promotional: row?.promotional || 0, purchased: row?.purchased || 0 };
}

// Runs an AI request that costs credits: spends first, gives the credits back if the request fails.
async function withCredits(workspaceId, costKey, fn) {
  const cost = CREDIT_COSTS[costKey] || 0;
  if (!cost || !await billingEnabled()) return fn();
  const plan = activePlan(await workspacePlan(workspaceId));
  if (!plan) return fn();
  const key = `spend:${costKey}:${crypto.randomUUID()}`;
  const answer = await databaseRequest('rpc/spend_credits', { method: 'POST', body: JSON.stringify({ p_workspace: workspaceId, p_amount: cost, p_reason: costKey, p_key: key }) });
  const ok = Array.isArray(answer) ? answer[0] : answer;
  if (ok === false) throw httpError(402, `This needs ${cost} credit${cost === 1 ? '' : 's'}, and the workspace is out. Buy more credits or upgrade in Settings → Plan & usage.`);
  try {
    return await fn();
  } catch (error) {
    await databaseRequest('rpc/refund_credits', { method: 'POST', body: JSON.stringify({ p_key: key }) }).catch(() => {});
    throw error;
  }
}

// Monthly credits for every workspace on a plan, once per calendar month (UTC), expiring at its end.
async function grantMonthlyCredits({ now = new Date() } = {}) {
  if (!await billingEnabled()) return { granted: 0, enabled: false };
  const month = now.toISOString().slice(0, 7);
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  const rows = await databaseRequest('workspaces?plan=neq.beta&select=id,plan,plan_status,trial_ends_at,extra_clients') || [];
  const grants = rows.map((row) => ({ row, plan: activePlan(row, now.getTime()) })).filter((item) => item.plan?.monthlyCredits)
    .map(({ row, plan }) => ({ workspace_id: row.id, kind: 'monthly', amount: plan.monthlyCredits, reason: `${plan.plan} plan, ${month}`, key: `monthly:${row.id}:${month}`, expires_at: end }));
  for (let index = 0; index < grants.length; index += 200) {
    await databaseRequest('credit_ledger?on_conflict=key', { method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(grants.slice(index, index + 200)) });
  }
  return { granted: grants.length, enabled: true };
}

// --- Stripe, through its REST API (form-encoded). Keys live only in Vercel's environment. ---
function form(data, prefix = '') {
  const parts = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object') parts.push(form(value, name));
    else parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
  }
  return parts.filter(Boolean).join('&');
}

async function stripe(path, data = null, { method = data ? 'POST' : 'GET' } = {}) {
  if (!process.env.STRIPE_SECRET_KEY) throw httpError(503, 'Payments aren’t set up yet.');
  const response = await fetch(`https://api.stripe.com/v1/${path}`, { method, headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, ...(data ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) }, ...(data ? { body: form(data) } : {}) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status >= 500 ? 502 : 400, body?.error?.message || `Stripe returned HTTP ${response.status}.`);
  return body;
}

async function ensureCustomer(workspaceId, email) {
  const row = await workspacePlan(workspaceId);
  if (row.stripe_customer_id) return row.stripe_customer_id;
  const customer = await stripe('customers', { email, metadata: { workspace_id: workspaceId, product: 'signaldesk' } });
  await databaseRequest(`workspaces?id=eq.${workspaceId}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ stripe_customer_id: customer.id }) });
  return customer.id;
}

async function checkoutSession({ workspaceId, email, item, interval = 'month', returnUrl }) {
  if (!await billingEnabled()) throw httpError(409, 'Billing isn’t turned on yet.');
  const pack = CREDIT_PACKS[item], planPrices = PLAN_PRICES[item];
  const price = pack ? process.env[pack.env] : planPrices ? process.env[planPrices[interval === 'year' ? 'year' : 'month']] : null;
  if (!price) throw httpError(400, 'That plan or pack isn’t available.');
  const customer = await ensureCustomer(workspaceId, email);
  const session = await stripe('checkout/sessions', {
    mode: pack ? 'payment' : 'subscription', customer, client_reference_id: workspaceId, allow_promotion_codes: 'true',
    line_items: { 0: { price, quantity: 1 } },
    success_url: `${returnUrl}#settings`, cancel_url: `${returnUrl}#settings`,
    metadata: { workspace_id: workspaceId, item, product: 'signaldesk' },
    ...(pack ? { payment_intent_data: { metadata: { workspace_id: workspaceId, item } } } : { subscription_data: { metadata: { workspace_id: workspaceId, item, product: 'signaldesk' } } })
  });
  return session.url;
}

async function portalSession({ workspaceId, returnUrl }) {
  const row = await workspacePlan(workspaceId);
  if (!row.stripe_customer_id) throw httpError(400, 'There’s no billing account yet. Choose a plan first.');
  return (await stripe('billing_portal/sessions', { customer: row.stripe_customer_id, return_url: `${returnUrl}#settings` })).url;
}

// Stripe-Signature: t=<time>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">.
function verifyStripeSignature(rawBody, header, secret, now = Date.now()) {
  const parts = Object.fromEntries(String(header || '').split(',').map((part) => part.split('=')).filter((pair) => pair.length === 2).map(([k, v]) => [k, v]));
  const signatures = String(header || '').split(',').filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (!parts.t || !signatures.length || !secret || Math.abs(now / 1000 - Number(parts.t)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  return signatures.some((value) => value.length === expected.length && crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected)));
}

function planFromPrice(priceId) {
  for (const [plan, prices] of Object.entries(PLAN_PRICES)) if (Object.values(prices).some((env) => process.env[env] && process.env[env] === priceId)) return plan;
  return null;
}

async function handleStripeEvent(event) {
  const fresh = await databaseRequest('stripe_events?on_conflict=id', { method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify({ id: event.id, type: event.type }) });
  if (Array.isArray(fresh) && !fresh.length) return { duplicate: true };
  const object = event.data?.object || {};
  if (event.type === 'checkout.session.completed' && object.mode === 'payment' && object.payment_status === 'paid') {
    const pack = CREDIT_PACKS[object.metadata?.item], workspaceId = object.metadata?.workspace_id || object.client_reference_id;
    if (pack && workspaceId) await databaseRequest('credit_ledger?on_conflict=key', { method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ workspace_id: workspaceId, kind: 'purchased', amount: pack.credits, reason: `${pack.credits} credits bought`, key: `stripe:${object.id}` }) });
    return { credits: pack?.credits || 0 };
  }
  if (event.type.startsWith('customer.subscription.')) {
    const workspaceId = object.metadata?.workspace_id;
    if (!workspaceId) return { ignored: 'no workspace' };
    const items = object.items?.data || [];
    const plan = items.map((item) => planFromPrice(item.price?.id)).find(Boolean);
    const extra = items.filter((item) => item.price?.id && item.price.id === process.env.STRIPE_PRICE_EXTRA_CLIENT).reduce((sum, item) => sum + (item.quantity || 0), 0);
    const ended = event.type === 'customer.subscription.deleted';
    await databaseRequest(`workspaces?id=eq.${workspaceId}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({
      ...(plan && !ended ? { plan } : {}), ...(ended ? { plan: 'free' } : {}), plan_status: ended ? 'canceled' : object.status,
      current_period_end: object.current_period_end ? new Date(object.current_period_end * 1000).toISOString() : null, stripe_subscription_id: ended ? null : object.id, extra_clients: ended ? 0 : extra
    }) });
    return { plan: ended ? 'free' : plan, status: object.status };
  }
  return { ignored: event.type };
}

module.exports = { PLANS, CREDIT_COSTS, CREDIT_PACKS, billingEnabled, workspacePlan, activePlan, creditBalance, withCredits, grantMonthlyCredits, checkoutSession, portalSession, verifyStripeSignature, handleStripeEvent, form, resetBillingCache: () => { switchCache = { at: 0, on: false }; } };
