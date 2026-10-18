const { databaseRequest, ayrshareRequest, ayrshareConfigured, getProfile, getWorkspaceState, WORKSPACE_TIMEZONES, zonedParts, zonedToUtc } = require('./core');

// Ayrshare returns each network's own field names. These map them onto one set of
// metrics; the first path that holds a number wins, and "+" sums several fields.
const METRIC_FIELDS = {
  facebook: { views: ['mediaView', 'totalVideoViews', 'videoViews'], reach: ['totalMediaViewUnique'], likes: ['reactions', 'likeCount'], comments: ['commentsCount'], shares: ['sharesCount'], clicks: ['clicks', 'totalClicks'], videoViews: ['totalVideoViews', 'videoViews'], watchMs: ['totalVideoViewTotalTime', 'postVideoViewTime'], avgWatchMs: ['totalVideoAvgTimeWatched'] },
  instagram: { views: ['viewsCount', 'playsCount'], reach: ['reachCount'], likes: ['likeCount'], comments: ['commentsCount'], shares: ['sharesCount'], saves: ['savedCount'], engagements: ['engagementCount'], videoViews: ['playsCount'], watchMs: ['igReelsVideoViewTotalTimeCount'], avgWatchMs: ['igReelsAvgWatchTimeCount'] },
  linkedin: { views: ['impressionCount'], reach: ['uniqueImpressionsCount'], likes: ['likeCount', 'reactions'], comments: ['commentCount'], shares: ['shareCount'], clicks: ['clickCount'], videoViews: ['videoViews'], watchMs: ['videoWatchTimeMs'] },
  tiktok: { views: ['videoViews'], reach: ['reach'], likes: ['likeCount'], comments: ['commentsCount'], shares: ['shareCount'], videoViews: ['videoViews'], avgWatchSeconds: ['averageTimeWatched'] },
  twitter: { views: ['publicMetrics.impressionCount', 'organicMetrics.impressionCount'], reach: ['organicMetrics.impressionCount'], likes: ['publicMetrics.likeCount'], comments: ['publicMetrics.replyCount'], shares: ['publicMetrics.retweetCount+publicMetrics.quoteCount'], saves: ['publicMetrics.bookmarkCount'], clicks: ['nonPublicMetrics.urlLinkClicks+nonPublicMetrics.userProfileClicks', 'userProfileClicks'], engagements: ['nonPublicMetrics.engagements'], videoViews: ['organicMetrics.video.viewCount'] },
  youtube: { views: ['views'], likes: ['likes'], comments: ['comments'], shares: ['shares'], videoViews: ['views'], watchMinutes: ['estimatedMinutesWatched'], avgWatchSeconds: ['averageViewDuration'] },
  threads: { views: ['views'], likes: ['likes'], comments: ['replies'], shares: ['reposts+quotes+shares'] },
  pinterest: { views: ['impression'], likes: ['totalReactions'], comments: ['totalComments'], saves: ['save'], clicks: ['outboundClick+pinClick'], videoViews: ['video10sView'] },
  bluesky: { likes: ['likeCount'], comments: ['replyCount'], shares: ['repostCount+quoteCount'] },
  reddit: { views: ['viewCount'], likes: ['ups', 'score'], comments: ['numComments'] },
  gmb: { views: ['views'], clicks: ['clicks'] }
};
const METRIC_KEYS = ['views', 'reach', 'engagements', 'engagementRate', 'likes', 'comments', 'shares', 'saves', 'clicks', 'videoViews', 'watchMinutes', 'avgWatchSeconds'];

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  if (value && typeof value === 'object') {
    if (typeof value.total === 'number') return value.total;
    const numbers = Object.values(value).filter((item) => typeof item === 'number');
    return numbers.length ? numbers.reduce((sum, item) => sum + item, 0) : null;
  }
  return null;
}

function readPath(raw, path) {
  return path.split('.').reduce((value, key) => (value && typeof value === 'object' ? value[key] : undefined), raw);
}

function readField(raw, spec) {
  const parts = spec.split('+').map((path) => toNumber(readPath(raw, path)));
  if (parts.every((part) => part === null)) return null;
  return parts.reduce((sum, part) => sum + (part || 0), 0);
}

function normalizeMetrics(platform, raw) {
  const fields = METRIC_FIELDS[platform] || {};
  const pick = (key) => {
    for (const spec of fields[key] || []) {
      const value = readField(raw || {}, spec);
      if (value !== null) return value;
    }
    return null;
  };
  const metrics = {
    views: pick('views'), reach: pick('reach'), likes: pick('likes'), comments: pick('comments'), shares: pick('shares'),
    saves: pick('saves'), clicks: pick('clicks'), videoViews: pick('videoViews'), engagements: pick('engagements')
  };
  const watchMs = pick('watchMs'), avgWatchMs = pick('avgWatchMs');
  metrics.watchMinutes = pick('watchMinutes') ?? (watchMs !== null ? Math.round(watchMs / 6000) / 10 : null);
  metrics.avgWatchSeconds = pick('avgWatchSeconds') ?? (avgWatchMs !== null ? Math.round(avgWatchMs / 100) / 10 : null);
  return finishMetrics(metrics);
}

// Fills in every metric key and derives engagements and engagement rate.
function finishMetrics(input) {
  const metrics = Object.fromEntries(METRIC_KEYS.map((key) => [key, toNumber(input?.[key])]));
  if (metrics.engagements === null) {
    const parts = ['likes', 'comments', 'shares', 'saves', 'clicks'].map((key) => metrics[key]).filter((value) => value !== null);
    metrics.engagements = parts.length ? parts.reduce((sum, value) => sum + value, 0) : null;
  }
  const audience = metrics.reach || metrics.views;
  metrics.engagementRate = metrics.engagements !== null && audience ? Math.round((metrics.engagements / audience) * 10000) / 100 : null;
  return metrics;
}

function publishedAt(post) {
  const value = post.scheduleDate?.utc || (typeof post.scheduleDate === 'string' ? post.scheduleDate : null) || post.created;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

async function buildTopPostsReport({ profile, workspaceId, encryptionKey, clientId, clientName, start, end }) {
  const errors = [];
  let posts = [];
  if (profile && ayrshareConfigured()) {
    // An Ayrshare outage shouldn't hide the posts SignalDesk published directly.
    try {
      const history = await ayrshareRequest('/history', {
        profileKey: profile.profileKey,
        query: { startDate: new Date(start).toISOString(), endDate: new Date(end).toISOString(), status: 'success', limit: '200' }
      });
      posts = (Array.isArray(history.history) ? history.history : Array.isArray(history) ? history : []).filter((post) => post?.id).slice(0, 60);
    } catch (error) {
      if (!workspaceId) throw error;
      errors.push({ postId: null, message: `Couldn't load Ayrshare posts: ${error.message}` });
    }
  }
  const analytics = await mapLimit(posts, 4, (post) => ayrshareRequest('/analytics/post', { method: 'POST', profileKey: profile.profileKey, body: { id: post.id } })
    .catch((error) => { errors.push({ postId: post.id, message: error.message }); return {}; }));
  const rows = [];
  posts.forEach((post, index) => {
    const result = analytics[index] || {};
    const platforms = Array.isArray(post.platforms) ? post.platforms : (post.postIds || []).map((item) => item.platform);
    for (const platform of new Set(platforms)) {
      const entry = result[platform];
      const raw = entry?.analytics || entry;
      const socialPost = (post.postIds || []).find((item) => item.platform === platform) || {};
      rows.push({
        id: `${post.id}:${platform}`,
        providerPostId: post.id,
        platform,
        text: typeof post.post === 'string' ? post.post.slice(0, 500) : '',
        url: socialPost.postUrl || entry?.postUrl || '',
        media: Array.isArray(post.mediaUrls) ? post.mediaUrls[0] || null : null,
        publishedAt: publishedAt(post),
        metrics: normalizeMetrics(platform, raw && typeof raw === 'object' ? raw : {}),
        hasData: Boolean(raw && typeof raw === 'object' && Object.keys(raw).length)
      });
    }
  });
  if (workspaceId) {
    // Posts SignalDesk published directly get their numbers from each network's own API.
    const direct = await require('./publishing').directPostRows({ workspaceId, clientId, start, end, encryptionKey });
    errors.push(...direct.errors);
    direct.rows.forEach(({ raw, ...row }) => rows.push({ ...row, metrics: finishMetrics(raw) }));
  }
  const totals = reportTotals(rows);
  const postCount = posts.length + rows.filter((row) => row.id.startsWith('job:')).length;
  return { clientId, clientName, start: new Date(start).toISOString(), end: new Date(end).toISOString(), generatedAt: new Date().toISOString(), postCount, rows, totals, errors };
}

// Sums each metric across rows; engagement rate is recomputed from the sums.
function reportTotals(rows) {
  const totals = Object.fromEntries(METRIC_KEYS.filter((key) => key !== 'engagementRate' && key !== 'avgWatchSeconds').map((key) => {
    const values = rows.map((row) => row.metrics[key]).filter((value) => value !== null);
    return [key, values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) * 10) / 10 : null];
  }));
  totals.engagementRate = totals.engagements !== null && (totals.reach || totals.views) ? Math.round((totals.engagements / (totals.reach || totals.views)) * 10000) / 100 : null;
  return totals;
}

function weekRange(weekStart, timeZone) {
  const [year, month, day] = weekStart.split('-').map(Number);
  const start = zonedToUtc(year, month, day, 0, 0, timeZone);
  const next = new Date(Date.UTC(year, month - 1, day + 7));
  const end = zonedToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, timeZone) - 1;
  return { start, end };
}

function lastCompletedWeekStart(timeZone, now = new Date()) {
  const parts = zonedParts(now, timeZone);
  const today = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  return new Date(today.getTime() - (daysSinceMonday + 7) * 86400000).toISOString().slice(0, 10);
}

async function saveWeeklyReport(workspaceId, clientId, weekStart, data) {
  await databaseRequest('weekly_reports?on_conflict=workspace_id,client_id,week_start', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ workspace_id: workspaceId, client_id: clientId, week_start: weekStart, data })
  });
}

// Builds last week's report for each connected client once the week is over, then tells admins.
async function runWeeklyReports({ encryptionKey, limit = 3 } = {}) {
  const [profileRows, connectionRows] = await Promise.all([
    databaseRequest('social_profiles?select=workspace_id,client_id'),
    databaseRequest('social_connections?select=workspace_id,client_id')
  ]);
  const seen = new Set();
  const profiles = [...(profileRows || []), ...(connectionRows || [])].filter((row) => {
    const key = `${row.workspace_id}:${row.client_id}`;
    return !seen.has(key) && seen.add(key);
  });
  const built = new Map();
  let count = 0;
  for (const row of profiles) {
    if (count >= limit) break;
    const state = await getWorkspaceState(row.workspace_id);
    const client = (state.clients || []).find((item) => item.id === row.client_id);
    if (!client) continue;
    const timeZone = WORKSPACE_TIMEZONES[state.settings?.timezone] || 'America/New_York';
    const weekStart = lastCompletedWeekStart(timeZone);
    const existing = await databaseRequest(`weekly_reports?workspace_id=eq.${row.workspace_id}&client_id=eq.${encodeURIComponent(row.client_id)}&week_start=eq.${weekStart}&select=id`);
    if (existing?.length) continue;
    try {
      const profile = await getProfile(row.workspace_id, row.client_id, encryptionKey);
      const { start, end } = weekRange(weekStart, timeZone);
      const report = await buildTopPostsReport({ profile, workspaceId: row.workspace_id, encryptionKey, clientId: client.id, clientName: client.name, start, end });
      await saveWeeklyReport(row.workspace_id, row.client_id, weekStart, report);
      count += 1;
      if (!built.has(row.workspace_id)) built.set(row.workspace_id, []);
      built.get(row.workspace_id).push({ client, report, weekStart });
    } catch (error) {
      console.error('Weekly report failed:', row.client_id, error.message);
    }
  }
  const { notify } = require('./notify');
  for (const [workspaceId, reports] of built) {
    const best = reports.flatMap(({ client, report }) => report.rows.map((item) => ({ ...item, clientName: client.name })))
      .sort((a, b) => (b.metrics.engagements || 0) - (a.metrics.engagements || 0))[0];
    await notify({
      workspaceId, audience: 'admins', type: 'weekly_report', category: 'reports',
      title: `Weekly Top Posts ready for ${reports.map(({ client }) => client.name).join(', ')}`,
      body: best ? `Top post: ${best.clientName} on ${best.platform} with ${best.metrics.engagements ?? 0} engagements.` : 'No published posts were found for last week.',
      view: 'analytics', data: { weekStart: reports[0].weekStart }
    });
  }
  return { built: count };
}

module.exports = { METRIC_KEYS, normalizeMetrics, finishMetrics, reportTotals, buildTopPostsReport, weekRange, lastCompletedWeekStart, saveWeeklyReport, runWeeklyReports };
