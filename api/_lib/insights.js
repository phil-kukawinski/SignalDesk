const { databaseRequest } = require('./core');
const { finishMetrics, reportTotals } = require('./reports');

// What works: from posts on the connected accounts (every source), which hashtags, post types, and
// caption lengths go with more engagement. Averages per post; a hashtag needs at least 2 posts.

const HASHTAG = /#[\p{L}\p{N}_]{2,60}/gu;

function postType(row) {
  const kind = String(row.media_type || '').toLowerCase();
  if (/story/.test(kind) || /_story$/.test(row.platform)) return 'Story';
  if (/carousel|album/.test(kind)) return 'Carousel';
  if (/reel|video/.test(kind)) return 'Video';
  if (/image|photo/.test(kind) || row.media_url) return 'Photo';
  return 'Text only';
}

function lengthBucket(text) {
  const length = String(text || '').trim().length;
  return length < 80 ? 'Short (under 80 characters)' : length <= 300 ? 'Medium (80 to 300)' : 'Long (over 300)';
}

function stats(list) {
  const engaged = list.filter((row) => typeof row.metrics.engagements === 'number');
  const rated = engaged.filter((row) => row.audience);
  const avg = engaged.length ? Math.round(engaged.reduce((sum, row) => sum + row.metrics.engagements, 0) / engaged.length * 10) / 10 : null;
  const rate = rated.length ? Math.round(rated.reduce((sum, row) => sum + row.metrics.engagements, 0) / rated.reduce((sum, row) => sum + row.audience, 0) * 1000) / 10 : null;
  return { posts: list.length, avgEngagements: avg, rate };
}

function contentInsights(rows) {
  const posts = rows.map((row) => {
    const metrics = finishMetrics(row.metrics || {});
    return { ...row, metrics, audience: typeof metrics.reach === 'number' && metrics.reach > 0 ? metrics.reach : typeof metrics.views === 'number' && metrics.views > 0 ? metrics.views : 0 };
  });
  const overall = stats(posts);
  const group = (keyOf) => {
    const map = new Map();
    posts.forEach((row) => { for (const key of [].concat(keyOf(row))) map.set(key, [...(map.get(key) || []), row]); });
    return [...map].map(([key, list]) => ({ key, ...stats(list) }));
  };
  const lift = (value) => (value === null || !overall.avgEngagements ? null : Math.round((value / overall.avgEngagements - 1) * 100));
  const hashtags = group((row) => [...new Set((String(row.text || '').match(HASHTAG) || []).map((tag) => tag.toLowerCase()))])
    .filter((item) => item.posts >= 2 && item.avgEngagements !== null).sort((a, b) => b.avgEngagements - a.avgEngagements || b.posts - a.posts || a.key.localeCompare(b.key)).slice(0, 12)
    .map((item) => ({ tag: item.key, posts: item.posts, avgEngagements: item.avgEngagements, rate: item.rate, lift: lift(item.avgEngagements) }));
  const types = group(postType).sort((a, b) => (b.avgEngagements ?? -1) - (a.avgEngagements ?? -1)).map((item) => ({ type: item.key, posts: item.posts, avgEngagements: item.avgEngagements, rate: item.rate, lift: lift(item.avgEngagements) }));
  const lengths = group((row) => lengthBucket(row.text)).sort((a, b) => (b.avgEngagements ?? -1) - (a.avgEngagements ?? -1)).map((item) => ({ length: item.key, posts: item.posts, avgEngagements: item.avgEngagements, rate: item.rate, lift: lift(item.avgEngagements) }));
  return { posts: posts.length, average: overall, hashtags, types, lengths };
}

async function loadInsights(workspaceId, { clientId = '', days = 90, now = Date.now() } = {}) {
  const query = new URLSearchParams({ select: 'platform,text,media_type,media_url,metrics', workspace_id: `eq.${workspaceId}`, published_at: `gte.${new Date(now - days * 86400000).toISOString()}`, order: 'published_at.desc', limit: '2000' });
  if (clientId) query.set('client_id', `eq.${clientId}`);
  return contentInsights(await databaseRequest(`network_posts?${query}`) || []);
}

// Two time frames side by side, from posts on the connected accounts.
async function periodTotals(workspaceId, { clientId = '', from, to }) {
  const query = new URLSearchParams({ select: 'platform,metrics', workspace_id: `eq.${workspaceId}`, order: 'published_at.desc', limit: '5000' });
  query.append('published_at', `gte.${new Date(from).toISOString()}`);
  query.append('published_at', `lt.${new Date(to).toISOString()}`);
  if (clientId) query.set('client_id', `eq.${clientId}`);
  const rows = (await databaseRequest(`network_posts?${query}`) || []).map((row) => ({ platform: row.platform, metrics: finishMetrics(row.metrics || {}) }));
  const totals = reportTotals(rows);
  const networks = {};
  rows.forEach((row) => { networks[row.platform] = (networks[row.platform] || 0) + 1; });
  return { posts: rows.length, views: totals.views ?? null, reach: totals.reach ?? null, engagements: totals.engagements ?? null, engagementRate: totals.engagementRate ?? null, clicks: totals.clicks ?? null, networks };
}

module.exports = { postType, lengthBucket, contentInsights, loadInsights, periodTotals };
