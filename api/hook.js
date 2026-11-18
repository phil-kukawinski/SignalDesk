const crypto = require('node:crypto');
const { send, getConfig, databaseRequest, getWorkspaceState, WORKSPACE_TIMEZONES, runFeed } = require('./_lib/core');

// Instant links for Autopilot: /hook/<secret> (see vercel.json). A website or CMS calls it when a
// story is published, and that feed is checked right away instead of at the next 10-minute check.
// The secret is the only credential, so only its hash is stored, and a link can be replaced or
// turned off from Autopilot. Calling it more than once is harmless: articles already seen are skipped.

const RECHECK_MS = 20000;
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

module.exports = async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { error: 'Use GET or POST.' });
  const token = new URL(req.url || '/', 'http://localhost').searchParams.get('token') || '';
  const { encryptionKey, missing } = getConfig();
  if (missing.length) return send(res, 503, { error: 'SignalDesk isn’t set up yet.' });
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return send(res, 404, { error: 'This link isn’t active.' });
  try {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const [feed] = await databaseRequest(`autopilot_feeds?hook_token_hash=eq.${hash}&select=*`) || [];
    if (!feed) return send(res, 404, { error: 'This link isn’t active.' });
    await databaseRequest(`autopilot_feeds?id=eq.${feed.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ last_hook_at: new Date().toISOString() }) });
    if (!feed.enabled) return send(res, 200, { ok: true, checked: false, message: 'This feed is paused in SignalDesk.' });
    const state = await getWorkspaceState(feed.workspace_id);
    const options = { encryptionKey, timeZone: WORKSPACE_TIMEZONES[state?.settings?.timezone] || 'America/New_York' };
    let result = await runFeed(feed, options);
    // Many sites cache their feed for a minute or so, so a story just published may not be in it yet. Look once more.
    if (!result.created && !result.error && !result.busy) {
      await wait(RECHECK_MS);
      result = await runFeed({ ...feed, last_error: null }, options);
    }
    if (result.busy) return send(res, 200, { ok: true, checked: false, message: 'This feed was checked moments ago.' });
    if (result.error) return send(res, 200, { ok: false, checked: true, created: 0, message: result.error });
    return send(res, 200, { ok: true, checked: true, created: result.created, message: result.created ? `${result.created} new post${result.created === 1 ? '' : 's'} queued.` : 'Nothing new in the feed yet. SignalDesk checks again within 10 minutes.' });
  } catch (error) {
    console.error('Instant link failed:', error.message);
    return send(res, 500, { error: 'SignalDesk couldn’t check the feed. It will try again within 10 minutes.' });
  }
};
