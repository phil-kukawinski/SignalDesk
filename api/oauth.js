const { getConfig, databaseRequest, encryptSecret } = require('./_lib/core');
const { PROVIDERS } = require('./_lib/platforms');

// Where Meta, LinkedIn, and Pinterest send people back after they approve SignalDesk.
// The sign-in is tied to a one-time state value, so only the person who started it can
// finish connecting accounts.

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function page(res, status, { ok, message, sessionId }) {
  const payload = JSON.stringify({ type: 'signaldesk-oauth', ok, sessionId: sessionId || null, message }).replace(/</g, '\\u003c');
  res.statusCode = status;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('referrer-policy', 'no-referrer');
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SignalDesk</title></head>
<body style="font:15px/1.5 system-ui,sans-serif;color:#1a1f3a;background:#fdf6f0;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center">
<div><p style="font-weight:700;margin:0 0 6px">${ok ? 'Signed in' : 'Couldn’t connect'}</p><p style="margin:0;color:#606779">${escapeHtml(message)}</p></div>
<script>try{if(window.opener)window.opener.postMessage(${payload},location.origin)}catch(e){}setTimeout(function(){window.close()},${ok ? 700 : 6000})</script>
</body></html>`);
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const { encryptionKey, missing } = getConfig();
  if (missing.length) return page(res, 503, { ok: false, message: 'SignalDesk isn’t fully configured on the server.' });
  if (!/^[\w-]{20,100}$/.test(state)) return page(res, 400, { ok: false, message: 'This sign-in link is invalid. Start connecting again from SignalDesk.' });
  let session;
  try {
    const rows = await databaseRequest(`oauth_sessions?state=eq.${encodeURIComponent(state)}&select=id,provider,status,expires_at`);
    session = rows?.[0];
  } catch {
    return page(res, 500, { ok: false, message: 'Couldn’t check this sign-in. Try again.' });
  }
  if (!session || session.status !== 'started' || Date.parse(session.expires_at) < Date.now()) {
    return page(res, 400, { ok: false, message: 'This sign-in expired or was already used. Start connecting again from SignalDesk.' });
  }
  const fail = async (message) => {
    await databaseRequest(`oauth_sessions?id=eq.${session.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ status: 'failed', error: message }) }).catch(() => {});
    return page(res, 400, { ok: false, message, sessionId: session.id });
  };
  const denied = url.searchParams.get('error_description') || url.searchParams.get('error');
  if (denied) return fail(`The sign-in was canceled or declined (${denied.slice(0, 200)}).`);
  if (!code) return fail('No sign-in code came back. Try again.');
  try {
    const { candidates, secret } = await PROVIDERS[session.provider].exchange(code);
    if (!candidates.length) return fail(session.provider === 'meta' ? 'No Facebook Pages were shared. Choose at least one Page when Facebook asks.' : 'No accounts were found to connect.');
    await databaseRequest(`oauth_sessions?id=eq.${session.id}`, {
      method: 'PATCH', headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'authorized', candidates, secret_ciphertext: encryptSecret(JSON.stringify(secret), encryptionKey) })
    });
    return page(res, 200, { ok: true, message: 'Return to SignalDesk to choose which accounts to connect.', sessionId: session.id });
  } catch (error) {
    console.error('OAuth exchange failed:', session.provider, error.message);
    return fail(error.message || 'The network didn’t accept the sign-in.');
  }
};
