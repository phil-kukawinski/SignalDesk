const crypto = require('node:crypto');
const { send, getConfig, getBearerToken, processDueComments, runAutopilot } = require('./_lib/core');
const { processEmailDigests } = require('./_lib/notify');
const { runWeeklyReports } = require('./_lib/reports');

// Runs Autopilot feeds, due follow-up comments, weekly Top Posts reports, and email digests. Call it on a schedule with
// `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this header automatically).
module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  const secret = process.env.CRON_SECRET || '';
  const token = getBearerToken(req);
  if (!secret || token.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret))) {
    return send(res, 401, { error: 'Unauthorized.' });
  }
  const { encryptionKey, missing } = getConfig();
  if (missing.length) return send(res, 503, { error: 'Social integrations are not configured.', missing });
  try {
    const comments = await processDueComments({ encryptionKey, limit: 50 });
    const feeds = await runAutopilot({ encryptionKey, staleMinutes: 10, limit: 25 });
    const reports = await runWeeklyReports({ encryptionKey, limit: 3 });
    const digests = await processEmailDigests({ limit: 40 });
    return send(res, 200, { comments, feeds: feeds.length, created: feeds.reduce((sum, feed) => sum + feed.created, 0), reports, digests });
  } catch (error) {
    console.error('Scheduled run failed:', error.message);
    return send(res, 500, { error: 'Scheduled run failed.' });
  }
};
