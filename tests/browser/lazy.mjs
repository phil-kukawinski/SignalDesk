// The public page stays light: signed-out visitors don't get the app until they start to sign in or
// request an invite, while signed-in visitors and invite links get it right away.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const ROOT = new URL('../..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
export default async ({ send, evaluate, wait, log }) => {
  const server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://x').pathname;
    const file = path.join(ROOT, name === '/' ? 'index.html' : name);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const check = (ok, message) => { if (!ok) log.push('[exception] ' + message); };
  const appLoaded = () => evaluate(`Boolean(window.SIGNALDESK_CONFIG&&document.querySelector('.app-shell'))`);
  try {
    await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
    await send('Page.navigate', { url: base }); await wait(1500);
    await evaluate(`localStorage.clear();sessionStorage.clear()`);
    await send('Page.navigate', { url: base }); await wait(1500);
    check(!await appLoaded(), 'a signed-out visitor should not load the app until they need it');
    const page = JSON.parse(await evaluate(`JSON.stringify({landing:getComputedStyle(document.querySelector('#landing')).display,icons:document.querySelectorAll('.lp-grid article svg').length,left:document.querySelectorAll('.lp-grid i[data-icon]').length,elements:document.querySelectorAll('*').length,font:document.fonts.check('16px Inter')})`));
    log.push('light page: ' + JSON.stringify(page));
    check(page.landing === 'block' && page.icons === 6 && page.left === 0, 'the public page should show with its icons and no app code');
    check(page.elements < 500, 'the public page should stay small, but has ' + page.elements + ' elements');
    // Sign in opens the box once the app arrives, from a single click.
    await evaluate(`document.querySelector('[data-open-signin]').click()`); await wait(6000);
    check(await appLoaded(), 'Sign in should load the app');
    const open = await evaluate(`document.querySelector('#auth-dialog').open`);
    log.push('sign-in opened: ' + open);
    check(open === true, 'one click on Sign in should open the sign-in box');
    // Submitting the invite form before the app has loaded still sends it.
    await send('Page.navigate', { url: base }); await wait(1000);
    await evaluate(`window.__sent=null;const f=window.fetch;window.fetch=(u,o)=>{if(String(u).includes('invite-request')){window.__sent=o.body;return Promise.resolve(new Response('{}',{status:200}));}return f(u,o);};const form=document.querySelector('#invite-request-form');form.elements.name.value='Sam Rivera';form.elements.email.value='sam@studio.test';form.requestSubmit()`); await wait(6000);
    const sent = await evaluate(`window.__sent`);
    log.push('invite request: ' + sent);
    check(String(sent).includes('sam@studio.test') && await evaluate(`location.pathname==='/'&&!location.search`), 'the invite form should send once the app arrives, without leaving the page');
    // Invite links and possible sign-ins load right away.
    await send('Page.navigate', { url: base + '?join=teammate@studio.test' }); await wait(6000);
    check(await appLoaded() && await evaluate(`document.querySelector('#auth-dialog').open`), 'an invite link should load the app and open sign-up');
    await evaluate(`sessionStorage.clear();localStorage.setItem('sb-test-auth-token','{}')`);
    await send('Page.navigate', { url: base }); await wait(6000);
    check(await appLoaded(), 'someone with a saved sign-in should get the app right away');
    await evaluate(`localStorage.clear();sessionStorage.clear()`);
    await send('Page.navigate', { url: 'about:blank' }); await wait(200);
    await send('Page.navigate', { url: base + '#features' }); await wait(1000);
    check(!await appLoaded(), 'a link to a section of the public page should stay light');
  } finally {
    server.close();
  }
};
