const { getConfig, databaseRequest } = require('./_lib/core');

// Short links: /l/<code> (see vercel.json) counts the click and redirects to the destination.
// Link-preview robots that networks send to build cards are redirected without being counted.

// In-app browsers (LinkedInApp, Pinterest, FBAN/Instagram) are real people, so only the
// networks' preview robots are matched by name.
const BOTS = /bot\b|bot\/|crawler|spider|slurp|facebookexternalhit|facebookcatalog|meta-externalagent|linkedinbot|pinterestbot|embedly|preview|whatsapp\/|skypeuripreview|vkshare|quora link|outbrain|bitlybot|nuzzel|curl\/|wget\/|python-requests|go-http-client|headlesschrome/i;

function notFound(res) {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  return res.status(404).send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link not found</title><body style="font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center;background:#fdf9f5;color:#1a1f3a"><div><p style="font-weight:700;margin:0 0 6px">This link isn’t available</p><p style="margin:0;color:#5d6475">It may have been mistyped or removed.</p></div>');
}

module.exports = async function handler(req, res) {
  const code = new URL(req.url || '/', 'http://localhost').searchParams.get('code') || '';
  if (!/^[A-Za-z0-9]{6,12}$/.test(code) || getConfig().missing.length) return notFound(res);
  try {
    const human = req.method === 'GET' && !BOTS.test(req.headers['user-agent'] || '') && req.headers.purpose !== 'prefetch' && req.headers['sec-purpose'] !== 'prefetch';
    const counted = human ? await databaseRequest('rpc/record_link_click', { method: 'POST', body: JSON.stringify({ p_code: code }) }) : null;
    // PostgREST returns a function's single value as-is; accept a one-item list too.
    const url = human ? (Array.isArray(counted) ? counted[0] : counted) : (await databaseRequest(`short_links?code=eq.${code}&select=url`))?.[0]?.url;
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return notFound(res);
    res.setHeader('cache-control', 'no-store');
    res.setHeader('referrer-policy', 'no-referrer-when-downgrade');
    res.setHeader('location', url);
    return res.status(302).end();
  } catch (error) {
    console.error('Short link failed:', error.message);
    require('./_lib/platform').recordAppError('api/go', error);
    return notFound(res);
  }
};
