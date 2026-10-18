const webpush = require('web-push');
const { databaseRequest } = require('./core');

// Browser push notifications. Needs VAPID keys (generate with `npx web-push generate-vapid-keys`).

function pushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;
function setup() {
  if (configured) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || `mailto:${(process.env.NOTIFY_FROM_EMAIL || 'admin@example.com').replace(/^.*<|>.*$/g, '')}`, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  configured = true;
}

// Sends a notification to each of these people's devices. Never throws.
async function sendPush(userIds, { title, body = '', view = null }) {
  if (!pushConfigured() || !userIds.length) return 0;
  try {
    setup();
    const rows = await databaseRequest(`push_subscriptions?user_id=in.(${userIds.join(',')})&select=endpoint,p256dh,auth`) || [];
    const payload = JSON.stringify({ title, body: body.slice(0, 300), view });
    let sent = 0;
    await Promise.all(rows.map(async (row) => {
      try {
        await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload, { TTL: 86400 });
        sent += 1;
      } catch (error) {
        // The browser dropped this subscription; forget it.
        if (error.statusCode === 404 || error.statusCode === 410) {
          await databaseRequest(`push_subscriptions?endpoint=eq.${encodeURIComponent(row.endpoint)}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } }).catch(() => {});
        } else {
          console.error('Push failed:', error.statusCode || error.message);
        }
      }
    }));
    return sent;
  } catch (error) {
    console.error('Push failed:', error.message);
    return 0;
  }
}

module.exports = { pushConfigured, sendPush };
