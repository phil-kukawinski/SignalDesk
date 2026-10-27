const crypto = require('node:crypto');
const { databaseRequest } = require('./_lib/core');
const { renderEmail, emailConfigured } = require('./_lib/notify');
const { platformAdmins } = require('./_lib/platform');

// "Request an invite" on the public landing page. Emails the platform admins (with Reply-To set
// to the person asking) and keeps a record. A hidden field and a per-address hourly limit keep
// out most spam; only a hash of the IP address is stored.

const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const BRANDS = new Set(['1–3', '4–10', '11–25', 'More than 25']);

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 8000) break; }
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
  const body = await readBody(req);
  // Bots fill in every field, including the hidden one; pretend it worked.
  if (clean(body.company_site, 100)) return send(res, 200, { ok: true });
  const name = clean(body.name, 80), email = clean(body.email, 200).toLowerCase(), note = clean(body.note, 600);
  const brands = BRANDS.has(body.brands) ? body.brands : '';
  if (!name) return send(res, 400, { error: 'Add your name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return send(res, 400, { error: 'Enter a valid email address.' });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ipHash = ip ? crypto.createHash('sha256').update(`${process.env.CRON_SECRET || ''}:${ip}`).digest('hex').slice(0, 32) : null;
  try {
    if (ipHash) {
      const since = new Date(Date.now() - 3600000).toISOString();
      const recent = await databaseRequest(`invite_requests?ip_hash=eq.${ipHash}&created_at=gte.${since}&select=id`) || [];
      if (recent.length >= 5) return send(res, 429, { error: 'Too many requests from this connection. Try again in an hour.' });
    }
    await databaseRequest('invite_requests', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ name, email, brands, note, ip_hash: ipHash }) });
  } catch (error) {
    // Still email the request if the table isn't there yet.
    console.error('Invite request not stored:', error.message);
  }
  const admins = platformAdmins();
  if (emailConfigured() && admins.length) {
    const content = renderEmail({
      eyebrow: 'INVITE REQUEST', heading: `${name} would like an invite`, intro: 'Someone asked for an invite on the SignalDesk website. Reply to this email to answer them.',
      sections: [{ title: 'Details', items: [{ title: name, body: email }, ...(brands ? [{ title: 'Brands they manage', body: brands }] : []), ...(note ? [{ title: 'Their note', body: note }] : [])] }],
      ctaLabel: 'Create an invite in Settings', footer: 'You get these because your email is in PLATFORM_ADMIN_EMAILS.'
    });
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: process.env.NOTIFY_FROM_EMAIL, to: admins, reply_to: email, subject: `Invite request: ${name}`, html: content.html, text: content.text })
    }).catch(() => null);
    if (!response?.ok) console.error('Invite request email failed:', response?.status);
  }
  return send(res, 200, { ok: true });
};
