// A check from outside the platform, meant to run weekly in GitHub Actions (docs/github-live-check.yml is the
// workflow; add it to the repository at .github/workflows/live-check.yml).
// It catches what the app can't report about itself: the whole site, or its server functions, being down.
// A failure fails the workflow, and GitHub emails the repository owner. usage: node scripts/live-check.mjs [address]
const base = (process.argv[2] || 'https://socialsignaldesk.com').replace(/\/+$/, '');
const problems = [];

async function get(path, init) {
  try {
    return await fetch(`${base}${path}`, { redirect: 'follow', signal: AbortSignal.timeout(20000), ...init });
  } catch (error) {
    problems.push(`${path}: couldn't connect (${error.message})`);
    return null;
  }
}

// Vercel's bot checkpoint sometimes challenges cloud addresses like GitHub's, which says nothing about the site.
const challenged = (response) => response?.status === 403 && (response.headers.get('x-vercel-mitigated') || /checkpoint/i.test(response.headers.get('server') || ''));

const page = await get('/');
if (challenged(page)) {
  console.log(`${base} answered with Vercel's bot checkpoint, so this run can't tell. The app's own weekly check still runs from inside.`);
  process.exit(0);
}
if (page) {
  const html = await page.text();
  if (!page.ok) problems.push(`/: HTTP ${page.status}`);
  else if (!html.includes('SignalDesk')) problems.push('/: loaded, but isn’t the SignalDesk page');
  const script = /js\/app\.min\.js\?v=[a-z0-9]+/.exec(html)?.[0];
  if (page.ok && !script) problems.push('/: the app’s script is missing from the page');
  if (script) {
    const bundle = await get(`/${script}`);
    if (bundle && !bundle.ok) problems.push(`/${script}: HTTP ${bundle.status}`);
  }
}
for (const path of ['/privacy', '/terms', '/review.html', '/icons/icon.svg']) {
  const response = await get(path);
  if (response && !response.ok) problems.push(`${path}: HTTP ${response.status}`);
}
// Server functions answer without credentials by refusing, which shows they're running.
const cron = await get('/api/cron');
if (cron && cron.status !== 401) problems.push(`/api/cron: expected a refusal (401), got HTTP ${cron.status}`);
const api = await get('/api/social', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
if (api && api.status >= 500) problems.push(`/api/social: HTTP ${api.status}`);

if (problems.length) {
  console.error(`Problems at ${base}:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`${base} looks healthy.`);
