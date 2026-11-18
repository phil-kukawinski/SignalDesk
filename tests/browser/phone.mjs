// Every page on a phone (390 px wide): nothing makes the page scroll sideways, and nothing visible
// sticks out past the screen edge. Saves phone-<view>.png for a visual look.
import fs from 'node:fs';
const out = process.env.SHOTS || new URL('.', import.meta.url).pathname;
const stub = fs.readFileSync(new URL('../fixtures/workspace-stub.js', import.meta.url), 'utf8');
const VIEWS = ['overview', 'calendar', 'composer', 'campaigns', 'library', 'approvals', 'inbox', 'analytics', 'clients', 'social-accounts', 'settings'];
export default async ({ send, evaluate, wait, log, sampleData }) => {
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(2500);
  await sampleData(); await evaluate(stub); await evaluate(`scheduleWorkspaceSave=()=>{};`); await wait(400);
  await evaluate(`localStorage.setItem('signaldesk-theme',${JSON.stringify(process.env.THEME || 'light')});applyTheme()`);
  for (const view of VIEWS) {
    await evaluate(`showView(${JSON.stringify(view)});window.scrollTo(0,0)`); await wait(900);
    // Elements that stick out past the right edge, ignoring ones inside their own scrolling strip.
    const result = JSON.parse(await evaluate(`(()=>{
      const width=document.documentElement.clientWidth,page=document.documentElement.scrollWidth;
      const scrolls=el=>{for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p);if(/(auto|scroll|hidden)/.test(s.overflowX)&&p.clientWidth<p.scrollWidth+1&&p.getBoundingClientRect().right<=width+1)return true;}return false;};
      const wide=[...document.querySelectorAll('.page.active *, .topbar *')].filter(el=>{const r=el.getBoundingClientRect();if(!r.width||!r.height||r.right<=width+1)return false;const s=getComputedStyle(el);if(s.visibility==='hidden'||s.position==='fixed')return false;return !scrolls(el);})
        .filter((el,i,list)=>!list.some(other=>other!==el&&other.contains(el)))
        .slice(0,5).map(el=>(el.id?'#'+el.id:el.tagName.toLowerCase()+(el.className&&typeof el.className==='string'?'.'+el.className.trim().split(/\\s+/).slice(0,2).join('.'):''))+' → '+Math.round(el.getBoundingClientRect().right)+'px');
      return JSON.stringify({page,width,wide});})()`));
    log.push(`${view}: page ${result.page}px${result.wide.length ? ', past the edge: ' + result.wide.join(', ') : ''}`);
    if (result.page > result.width + 1 || result.wide.length) await evaluate(`console.error(${JSON.stringify(`phone: ${view} is wider than the screen: ${result.page}px; ${result.wide.join(', ')}`)})`);
    const { result: shot } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(`${out}phone-${view}.png`, Buffer.from(shot.data, 'base64'));
  }
};
