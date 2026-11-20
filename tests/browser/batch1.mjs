// Calendar color-by (client, network, status), the gaps overlay, calendar keyboard shortcuts, and the
// Motion setting.
import fs from 'node:fs';
const stub = fs.readFileSync(new URL('../fixtures/workspace-stub.js', import.meta.url), 'utf8');
export default async ({ send, evaluate, wait, sampleData }) => {
  const check = async (ok, message) => { if (!ok) await evaluate(`console.error(${JSON.stringify('batch1: ' + message)})`); };
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(2500);
  await sampleData(); await evaluate(stub); await evaluate(`scheduleWorkspaceSave=()=>{};currentRole='admin';`); await wait(1200);
  await evaluate(`showView('calendar')`); await wait(800);

  // Color by: the picker sits in the legend; network and status swap the item colors and the legend.
  await check(await evaluate(`document.querySelector('#cal-color-by')?.value`) === 'client', 'the calendar starts colored by client');
  const pick = (mode) => evaluate(`(()=>{const s=document.querySelector('#cal-color-by');s.value='${mode}';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await pick('network'); await wait(300);
  const net = JSON.parse(await evaluate(`JSON.stringify({items:[...document.querySelectorAll('#calendar-timeline .calendar-event')].map(e=>[...e.classList].find(c=>c.startsWith('event-'))),legend:document.querySelectorAll('#calendar-legend .legend-dot[class*="net-"]').length,saved:localStorage.getItem('signaldesk-cal-color')})`));
  await check(net.items.length && net.items.every((c) => /^event-net-/.test(c)) && net.legend > 0 && net.saved === 'network', 'colored by network: ' + JSON.stringify(net));
  await pick('status'); await wait(300);
  const st = JSON.parse(await evaluate(`JSON.stringify({items:[...document.querySelectorAll('#calendar-timeline .calendar-event')].map(e=>[...e.classList].find(c=>c.startsWith('event-'))),legend:[...document.querySelectorAll('#calendar-legend span')].map(s=>s.textContent.trim()).filter(Boolean)})`));
  await check(st.items.every((c) => /^event-st-/.test(c)) && ['Scheduled', 'In review', 'Published', 'Failed', 'Draft'].every((l) => st.legend.includes(l)), 'colored by status: ' + JSON.stringify(st));
  const keys = await evaluate(`(()=>{calColorBy='network';const a=[calEventColorKey({platforms:['instagram_story','facebook']}),calEventColorKey({platforms:['twitter']}),calEventColorKey({platforms:['linkedin_page']}),calEventColorKey({platforms:['reddit']})];calColorBy='status';a.push(calEventColorKey({status:'Partly published'}),calEventColorKey({status:'In Review'}),calEventColorKey({draftId:'d',status:'Scheduled'}),calEventColorKey({status:'Published'}),calEventColorKey({status:'Scheduled'}));return JSON.stringify(a);})()`);
  await check(keys === JSON.stringify(['net-several', 'net-x', 'net-linkedin', 'net-other', 'st-failed', 'st-review', 'st-draft', 'st-published', 'st-scheduled']), 'color keys: ' + keys);
  await pick('client'); await wait(300);
  await check(await evaluate(`[...document.querySelectorAll('#calendar-timeline .calendar-event')].every(e=>[...e.classList].some(c=>/^event-(c\\d|autopilot)$/.test(c)))`), 'back to client colors');

  // Gaps: with a 3-day limit, posts today and in 4 days leave days 1–3 as a gap; the open stretch after
  // day 4 is a gap too. A 2-day stretch isn't. Clients without posts are left out.
  const gaps = JSON.parse(await evaluate(`(()=>{const c=clients[0],day=n=>{const d=addDays(startOfDay(new Date()),n);d.setHours(10);return d;};
    c.goals={...(c.goals||{}),maxGapDays:3};window.__keepPosts=serverPosts;const base=__keepPosts[0]||{platforms:['instagram'],media:[],results:[],text:'Gap test'};serverPosts=[0,4,7].map((n,i)=>({...base,id:'g'+i,clientId:c.id,status:'scheduled',scheduledFor:day(n).toISOString()}));
    calView='month';calCursor=startOfDay(new Date());document.querySelector('#calendar-gaps').checked=true;gapCache=null;const map=gapDaysMap(),end=visibleRange().end;
    const at=n=>{const d=day(n);return d<end?(map[localIsoDate(d)]||[]).includes(c.name):null;};
    return JSON.stringify({today:at(0),d1:at(1),d3:at(3),d4:at(4),d5:at(5),d6:at(6),d8:at(8),others:Object.values(map).flat().every(n=>n===c.name)});})()`));
  await check(gaps.today === false && gaps.d1 !== false && gaps.d3 !== false && gaps.d4 !== true && gaps.d5 !== true && gaps.d6 !== true && gaps.d8 !== false && gaps.others, 'gap days: ' + JSON.stringify(gaps));
  await evaluate(`(()=>{const b=document.querySelector('#calendar-gaps');b.checked=true;b.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(300);
  await check(await evaluate(`localStorage.getItem('signaldesk-gaps')==='1'&&(document.querySelectorAll('.gap-note').length>0||addDays(startOfDay(new Date()),1)>=visibleRange().end)`), 'gap notes show on the calendar and the switch is remembered');
  await evaluate(`(()=>{const b=document.querySelector('#calendar-gaps');b.checked=false;b.dispatchEvent(new Event('change',{bubbles:true}));serverPosts=__keepPosts;})()`); await wait(300);
  await check(await evaluate(`document.querySelectorAll('.gap-note').length`) === 0, 'turning Gaps off removes them');

  // Calendar keys.
  const press = (key) => evaluate(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true}))`);
  await press('w'); await wait(200);
  await check(await evaluate(`calView`) === 'week', 'W switches to week');
  await press('m'); await wait(200);
  await check(await evaluate(`calView`) === 'month', 'M switches to month');
  await press('d'); await wait(200); await press('t'); await wait(200);
  const before = await evaluate(`calCursor.getTime()`);
  await press('ArrowRight'); await wait(200);
  await check(await evaluate(`calView`) === 'day' && await evaluate(`calCursor.getTime()`) > before && await evaluate(`localIsoDate(calCursor)`) !== await evaluate(`localIsoDate(new Date())`), 'D, T, and → move through days');
  await press('j'); await wait(200);
  await check(await evaluate(`localIsoDate(calCursor)===localIsoDate(new Date())`), 'J goes back');
  await press('?'); await wait(200);
  await check(/In the calendar/i.test(await evaluate(`document.querySelector('#shortcuts-dialog')?.textContent||''`)), 'the shortcut list shows the calendar keys');
  await evaluate(`document.querySelector('#shortcuts-dialog')?.close()`);

  // Motion.
  await evaluate(`(()=>{const s=document.querySelector('#motion-select');s.value='reduce';s.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(200);
  await check(await evaluate(`document.documentElement.dataset.motion==='reduce'&&prefersLessMotion()&&localStorage.getItem('signaldesk-motion')==='reduce'`), 'Motion → Reduce is applied and saved');
  await check(await evaluate(`getComputedStyle(document.body).transitionDuration`) !== undefined, 'styles still compute');
  await evaluate(`(()=>{const s=document.querySelector('#motion-select');s.value='device';s.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(200);
  await check(await evaluate(`document.documentElement.dataset.motion`) === 'device', 'Motion → Follow device');
};
