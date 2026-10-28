const crypto = require('node:crypto');
const { send, getConfig, getBearerToken, processDueComments, runAutopilot } = require('./_lib/core');
const { recordAppError, alertPlatformAdmins } = require('./_lib/platform');
const { syncDueConnections } = require('./_lib/sync');
const { processPublishQueue, maintainConnections, refreshRecentMetrics, recordWorkerRun, lastWorkerRun, checkWorkerHealth, recycleEvergreen } = require('./_lib/publishing');
const { processEmailDigests, processClientReports } = require('./_lib/notify');
const { runWeeklyReports } = require('./_lib/reports');
const { cleanupMedia } = require('./_lib/media');
const { processPlanningReminders, processPlanningNotes } = require('./_lib/planning');

const DAY_MS = 86400000;

function authorized(req) {
  const secret = process.env.CRON_SECRET || '';
  const token = getBearerToken(req);
  return Boolean(secret) && token.length === secret.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret));
}

// Publishes due posts, then runs Autopilot feeds, due comments, token upkeep, metrics, evergreen reposts, weekly
// Top Posts reports, email digests, planning reminders and notes, and a daily media cleanup. Call it on a schedule with
// `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this header automatically).
// `?only=publish` runs just the publishing queue, for an every-minute schedule.
// `?only=health` only checks that publishing is running; Vercel Cron calls it daily as a backstop.
module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  if (!authorized(req)) return send(res, 401, { error: 'Unauthorized.' });
  const { encryptionKey, missing } = getConfig();
  if (missing.length) return send(res, 503, { error: 'Social integrations are not configured.', missing });
  const only = new URL(req.url || '/', 'http://localhost').searchParams.get('only');
  const started = Date.now();
  try {
    if (only === 'health') return send(res, 200, { health: await checkWorkerHealth() });
    const publishing = await processPublishQueue({ encryptionKey, limit: 15, deadline: started + 200000 });
    const comments = await processDueComments({ encryptionKey, limit: 50 });
    await recordWorkerRun('publish', { ...publishing, comments: comments.posted });
    if (only === 'publish') return send(res, 200, { publishing, comments });
    const connections = await maintainConnections({ encryptionKey });
    const metrics = await refreshRecentMetrics({ encryptionKey, limit: 10 });
    // Posts and audience numbers from every source on connected accounts.
    const accountSync = await syncDueConnections({ encryptionKey, limit: 4 }).catch((error) => ({ error: error.message }));
    const evergreen = await recycleEvergreen({ encryptionKey });
    const feeds = await runAutopilot({ encryptionKey, staleMinutes: 10, limit: 25 });
    const reports = await runWeeklyReports({ encryptionKey, limit: 3 });
    const digests = await processEmailDigests({ limit: 40 });
    const clientReports = await processClientReports({ encryptionKey }).catch((error) => ({ error: error.message }));
    const reviewReminders = await require('./_lib/reminders').processReviewReminders({ encryptionKey }).catch((error) => ({ error: error.message }));
    const planning = await processPlanningReminders().catch((error) => ({ error: error.message }));
    // "What to post next" notes take a while to write, so only when this run has time to spare.
    const planningNotes = Date.now() - started < 120000 ? await processPlanningNotes().catch((error) => ({ error: error.message })) : { skipped: true };
    let media = null;
    const lastCleanup = await lastWorkerRun('media-cleanup');
    if (!lastCleanup || Date.now() - Date.parse(lastCleanup) > DAY_MS) {
      media = await cleanupMedia().catch((error) => ({ error: error.message }));
      await recordWorkerRun('media-cleanup', media);
    }
    const health = await checkWorkerHealth();
    // Platform owners hear about server errors and widespread failures, at most every 6 hours.
    const platformAlert = await alertPlatformAdmins({ lastAlert: await lastWorkerRun('platform-alert') }).catch((error) => ({ error: error.message }));
    if (platformAlert.sent) await recordWorkerRun('platform-alert', platformAlert);
    await recordWorkerRun('worker', { feeds: feeds.length });
    return send(res, 200, { publishing, comments, connections, metrics, accountSync, evergreen, feeds: feeds.length, created: feeds.reduce((sum, feed) => sum + feed.created, 0), reports, digests, clientReports, reviewReminders, planning, planningNotes, media, health });
  } catch (error) {
    console.error('Scheduled run failed:', error.message);
    await recordAppError(`api/cron${only ? `?only=${only}` : ''}`, error);
    return send(res, 500, { error: 'Scheduled run failed.' });
  }
};
