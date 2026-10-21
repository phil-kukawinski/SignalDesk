const { send, getConfig, databaseRequest, getWorkspaceState } = require('./_lib/core');

// Public data for a client's link-in-bio page (/b/<slug>): its links plus recent posts.
const RECENT_DAYS = 90;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed.' });
  res.setHeader('cache-control', 'public, max-age=60, s-maxage=300');
  if (getConfig().missing.length) return send(res, 503, { error: 'This page isn’t available right now.' });
  const slug = String(new URL(req.url, 'http://localhost').searchParams.get('slug') || '').toLowerCase();
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return send(res, 404, { error: 'Page not found.' });
  try {
    const page = (await databaseRequest(`bio_pages?slug=eq.${slug}&enabled=eq.true&select=workspace_id,client_id`))?.[0];
    if (!page) return send(res, 404, { error: 'Page not found.' });
    const client = ((await getWorkspaceState(page.workspace_id)).clients || []).find((item) => item.id === page.client_id);
    if (!client || client.bio?.enabled === false) return send(res, 404, { error: 'Page not found.' });
    const bio = client.bio || {};
    const links = (Array.isArray(bio.links) ? bio.links : []).filter((link) => typeof link?.label === 'string' && /^https?:\/\/\S+$/i.test(link?.url || '')).slice(0, 12).map((link) => ({ label: link.label.slice(0, 80), url: link.url }));
    let recent = [];
    if (bio.showRecent !== false) {
      const since = new Date(Date.now() - RECENT_DAYS * 86400000).toISOString();
      const jobs = await databaseRequest(`publish_jobs?workspace_id=eq.${page.workspace_id}&client_id=eq.${encodeURIComponent(page.client_id)}&status=eq.published&published_at=gte.${since}&external_url=not.is.null&select=platform,external_url,published_at,scheduled_posts(title,content)&order=published_at.desc&limit=30`) || [];
      const seen = new Set();
      recent = jobs.filter((job) => /^https:\/\//.test(job.external_url) && !seen.has(job.scheduled_posts?.title) && seen.add(job.scheduled_posts?.title)).slice(0, 9).map((job) => ({
        url: job.external_url, platform: job.platform, title: job.scheduled_posts?.title || '',
        image: (job.scheduled_posts?.content?.media || []).find((url) => !/\.(mp4|mov|m4v|webm)(\?|$)/i.test(url)) || ''
      }));
    }
    return send(res, 200, {
      name: client.name, initials: client.initials || client.name.slice(0, 2), headline: typeof bio.headline === 'string' ? bio.headline.slice(0, 160) : '',
      color: /^#[0-9a-f]{6}$/i.test(client.brand?.colors?.[0] || '') ? client.brand.colors[0] : '#5b8db8',
      logo: /^https:\/\//.test(client.brand?.logo || '') ? client.brand.logo : '', links, recent
    });
  } catch (error) {
    console.error('Bio page failed:', error.message);
    require('./_lib/platform').recordAppError('api/bio', error);
    return send(res, 500, { error: 'Something went wrong.' });
  }
};
