// The security headers from vercel.json don't block anything the app needs: the page is served
// over HTTP with those headers, every view and the main dialogs are opened, and any blocked script,
// style, image, or connection is reported.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
export default async ({ send, evaluate, wait, log }) => {
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const pageHeaders = vercel.headers.find((rule) => rule.source.startsWith('/((?!api/)')).headers;
  const server = http.createServer((req, res) => {
    let file = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (file === '/') file = '/index.html';
    const full = path.join(ROOT, file);
    if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.statusCode = 404; res.end(); return; }
    // upgrade-insecure-requests would send this local test page's requests to https, so it's left out here.
    for (const { key, value } of pageHeaders) res.setHeader(key, key === 'Content-Security-Policy' ? value.replace('; upgrade-insecure-requests', '') : value);
    res.setHeader('content-type', TYPES[path.extname(full)] || 'application/octet-stream');
    res.end(fs.readFileSync(full));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+(e.blockedURI||'inline')+' '+(e.sourceFile||'').split('/').pop()+':'+e.lineNumber));` });
    await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: origin + '/' }); await wait(3500);
    const sample = fs.readFileSync(path.join(ROOT, 'tests/fixtures/sample.js'), 'utf8');
    await evaluate(sample);
    await evaluate(`document.querySelector('#auth-dialog')?.open&&document.querySelector('#auth-dialog').close();cloudFeaturesAvailable=()=>true;activeUser={id:'u',email:'owner@pkworks.co'};currentRole='admin';callSocialApi=async()=>{throw new Error('offline in this test')};`);
    for (const view of ['overview', 'calendar', 'composer', 'library', 'inbox', 'analytics', 'clients', 'social-accounts', 'approvals', 'settings']) { await evaluate(`showView('${view}')`); await wait(400); }
    await evaluate(`showView('composer');document.querySelector('#post-copy').value='Hello';uploadedMedia=[{path:'',url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',name:'a.png',type:'image/png'}];updatePreview();`); await wait(400);
    await evaluate(`document.querySelector('[data-open-feedback]')?.click()`); await wait(300);
    await evaluate(`document.querySelectorAll('dialog[open]').forEach(d=>d.close());openNotificationPreferences?.()`); await wait(300);
    const theme = await evaluate(`document.documentElement.dataset.theme||''`);
    const violations = JSON.parse(await evaluate(`JSON.stringify(window.__csp)`));
    log.push(`theme script ran: ${Boolean(theme)} · violations: ${violations.length}`);
    if (!theme) log.push('[exception] the inline theme script should run under the policy');
    violations.slice(0, 5).forEach((item) => log.push('[exception] blocked by the security policy: ' + item));
    // The client review page and link-in-bio pages run under the same policy.
    for (const page of ['/review.html#t=test', '/bio.html']) {
      await send('Page.navigate', { url: origin + page }); await wait(1500);
      const blocked = JSON.parse(await evaluate(`JSON.stringify(window.__csp||[])`));
      blocked.slice(0, 3).forEach((item) => log.push(`[exception] ${page} blocked by the security policy: ${item}`));
    }
  } finally {
    server.close();
  }
};
