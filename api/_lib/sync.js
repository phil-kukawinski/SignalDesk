const { databaseRequest } = require('./core');
const { accountHistory, PublishError } = require('./platforms');
const { loadConnection, ensureFreshToken, markNeedsReauth } = require('./publishing');
const { finishMetrics } = require('./reports');

// Reads each connected account's posts (from any source) and audience numbers from the network,
// so the calendar and analytics show everything, not only what SignalDesk published.
// Runs from the background worker: each account about every 3 hours, oldest first.

const SYNC_EVERY_MS = 3 * 3600000;
const FIRST_SYNC_DAYS = 90;
const LATER_SYNC_DAYS = 35;

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function upsertPosts(rows) {
  for (let index = 0; index < rows.length; index += 100) {
    await databaseRequest('network_posts?on_conflict=workspace_id,platform,external_id', {
      method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(index, index + 100))
    });
  }
}

async function syncConnection(row, { encryptionKey, now = Date.now() } = {}) {
  let connection = await loadConnection(row.id, encryptionKey);
  if (!connection || connection.status !== 'active') return { skipped: true };
  const since = now - (row.synced_at ? LATER_SYNC_DAYS : FIRST_SYNC_DAYS) * 86400000;
  try {
    connection = await ensureFreshToken(connection, encryptionKey);
    const history = await accountHistory(row.platform, connection, since);
    // Posts SignalDesk published are linked to their job, so they're never counted twice.
    const jobs = await databaseRequest(`publish_jobs?workspace_id=eq.${row.workspace_id}&platform=eq.${row.platform}&external_id=not.is.null&published_at=gte.${new Date(since - 86400000).toISOString()}&select=id,external_id`) || [];
    const jobByExternal = Object.fromEntries(jobs.map((job) => [job.external_id, job.id]));
    const at = new Date(now).toISOString();
    const rows = history.posts.filter((post) => post.externalId && Date.parse(post.publishedAt)).map((post) => ({
      workspace_id: row.workspace_id, client_id: row.client_id, connection_id: row.id, platform: row.platform, external_id: String(post.externalId),
      url: post.url || null, text: String(post.text || '').slice(0, 5000), media_url: post.mediaUrl || null, media_type: post.mediaType || null,
      published_at: new Date(post.publishedAt).toISOString(), job_id: jobByExternal[post.externalId] || null,
      metrics: finishMetrics(post.metrics || {}), metrics_at: at, updated_at: at
    }));
    await upsertPosts(rows);
    const account = Object.fromEntries(Object.entries(history.account || {}).filter(([, value]) => value !== null && value !== undefined));
    if (Object.keys(account).length) {
      await databaseRequest('account_stats?on_conflict=connection_id,day', {
        method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ connection_id: row.id, workspace_id: row.workspace_id, client_id: row.client_id, platform: row.platform, day: dayKey(new Date(now)), metrics: account, updated_at: at })
      });
    }
    await databaseRequest(`social_connections?id=eq.${row.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ synced_at: at, sync_error: history.note || null }) });
    return { posts: rows.length, linked: rows.filter((item) => item.job_id).length, account };
  } catch (error) {
    const message = String(error.message || error).slice(0, 300);
    await databaseRequest(`social_connections?id=eq.${row.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ synced_at: new Date(now).toISOString(), sync_error: message }) }).catch(() => {});
    if (error instanceof PublishError && error.kind === 'auth') await markNeedsReauth(row.id, message).catch(() => {});
    return { error: message };
  }
}

// Background worker: the accounts that are due, a few per run.
async function syncDueConnections({ encryptionKey, limit = 4, now = Date.now() } = {}) {
  const cutoff = new Date(now - SYNC_EVERY_MS).toISOString();
  const due = await databaseRequest(`social_connections?status=eq.active&or=(synced_at.is.null,synced_at.lt.${cutoff})&select=id,workspace_id,client_id,platform,synced_at&order=synced_at.asc.nullsfirst&limit=${limit}`) || [];
  const results = [];
  for (const row of due) results.push({ platform: row.platform, ...(await syncConnection(row, { encryptionKey, now })) });
  return { synced: results.length, results };
}

// "Sync now" for one client's accounts.
async function syncClient(workspaceId, clientId, { encryptionKey } = {}) {
  const rows = await databaseRequest(`social_connections?workspace_id=eq.${workspaceId}&client_id=eq.${encodeURIComponent(clientId)}&status=eq.active&select=id,workspace_id,client_id,platform,synced_at`) || [];
  const results = [];
  for (const row of rows) results.push({ platform: row.platform, ...(await syncConnection(row, { encryptionKey })) });
  return results;
}

// Posts for the calendar, from every source, in a date range.
async function listNetworkPosts(workspaceId, { from, to, clientId, platform } = {}) {
  const query = new URLSearchParams({ select: 'id,client_id,platform,external_id,url,text,media_url,media_type,published_at,job_id,metrics,metrics_at', workspace_id: `eq.${workspaceId}`, order: 'published_at.asc', limit: '1000' });
  query.append('published_at', `gte.${new Date(from).toISOString()}`);
  query.append('published_at', `lt.${new Date(to).toISOString()}`);
  if (clientId) query.set('client_id', `eq.${clientId}`);
  if (platform) query.set('platform', `eq.${platform}`);
  const rows = await databaseRequest(`network_posts?${query}`) || [];
  return rows.map((row) => ({
    id: row.id, clientId: row.client_id, platform: row.platform, url: row.url, text: row.text || '', mediaUrl: row.media_url, mediaType: row.media_type,
    publishedAt: row.published_at, viaSignalDesk: Boolean(row.job_id), jobId: row.job_id, metrics: row.metrics || {}, metricsAt: row.metrics_at
  }));
}

// Audience numbers for Analytics: latest followers per account, and the change over 30 days.
async function audienceSummary(workspaceId) {
  const since = dayKey(new Date(Date.now() - 31 * 86400000));
  const rows = await databaseRequest(`account_stats?workspace_id=eq.${workspaceId}&day=gte.${since}&select=connection_id,client_id,platform,day,metrics&order=day.asc`) || [];
  const byConnection = {};
  for (const row of rows) (byConnection[row.connection_id] ||= []).push(row);
  return Object.values(byConnection).map((series) => {
    const latest = series[series.length - 1], first = series.find((row) => typeof row.metrics.followers === 'number');
    const followers = latest.metrics.followers ?? null;
    return { clientId: latest.client_id, platform: latest.platform, followers, change: first && followers !== null && first.day !== latest.day ? followers - first.metrics.followers : null, since: first?.day || null, ...latest.metrics };
  });
}

module.exports = { syncConnection, syncDueConnections, syncClient, listNetworkPosts, audienceSummary };
