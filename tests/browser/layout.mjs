// Layout helpers across the app (simulated signed-in workspace, no network access): the Studio's pinned action bar
// and its status, Analytics tabs, Settings one section at a time, calendar hover cards, Social Accounts' compact
// "Add a network" row, the post panel card, Approvals snippets, client search and sort, and Home on a phone.
import fs from 'node:fs';
const stub = fs.readFileSync(new URL('../fixtures/workspace-stub.js', import.meta.url), 'utf8');
export default async ({ send, evaluate, wait, log, sampleData }) => {
  const fail = (message) => log.push('[exception] ' + message);
  const json = async (expression) => JSON.parse(await evaluate(`JSON.stringify(${expression})`));
  const setup = async (width, height, mobile) => {
    await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(2500);
    await sampleData(); await evaluate(stub);
    // Saving the workspace needs the database; the simulated one has none.
    await evaluate(`scheduleWorkspaceSave=()=>{};`); await wait(400);
  };
  await setup(1400, 900, false);

  // Studio: the action bar stays on screen part-way down the form, and sums up the checklist.
  await evaluate(`showView('composer')`); await wait(1000); await evaluate(`window.scrollTo(0,600)`); await wait(300);
  const bar = await json(`(()=>{const b=document.querySelector('#composer-actions').getBoundingClientRect();return{bottom:Math.round(b.bottom),top:Math.round(b.top),height:innerHeight,status:document.querySelector('#composer-status').textContent}})()`);
  log.push('studio bar: ' + JSON.stringify(bar));
  if (bar.bottom > bar.height || bar.top < bar.height - 120 || !/steps? left|Ready|problem/.test(bar.status)) fail('the Studio action bar should stay at the bottom of the screen with a status: ' + JSON.stringify(bar));

  // Analytics: three tabs, each with its own panels.
  await evaluate(`showView('analytics')`); await wait(1200);
  const tabs = {};
  for (const tab of ['overview', 'posts', 'reports']) {
    await evaluate(`document.querySelector('[data-analytics-tab="${tab}"]').click()`); await wait(200);
    tabs[tab] = await json(`[...document.querySelectorAll('#view-analytics > [data-tab-group]')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.id||'stats')`);
  }
  log.push('analytics tabs: ' + JSON.stringify(tabs));
  if (JSON.stringify(tabs.overview) !== JSON.stringify(['stats', 'analytics-trend-panel']) || !tabs.posts.includes('all-posts-panel') || tabs.posts.includes('client-report-panel') || !tabs.reports.includes('client-report-panel') || !tabs.reports.includes('top-posts-panel')) fail('Analytics tabs should split the panels into Overview, Posts, and Reports: ' + JSON.stringify(tabs));

  // Settings: one section at a time.
  await evaluate(`showView('settings')`); await wait(800);
  const sections = {};
  for (const go of ['team', 'account', 'general']) {
    await evaluate(`document.querySelector('[data-settings-go="${go}"]').click()`); await wait(200);
    sections[go] = await json(`[...document.querySelectorAll('.settings-sections > .panel')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.id)`);
  }
  log.push('settings: ' + JSON.stringify(sections));
  if (JSON.stringify(sections) !== JSON.stringify({ team: ['team-panel'], account: ['account-panel'], general: ['settings-general'] })) fail('Settings should show one section at a time: ' + JSON.stringify(sections));

  // Calendar: a hover card with the full title; side-by-side posts use a short time.
  await evaluate(`showView('calendar')`); await wait(1000);
  const hover = await evaluate(`(()=>{const e=document.querySelector('#calendar-timeline .timeline-event');showCalendarHover(e);const c=document.querySelector('.calendar-hovercard');return c&&!c.hidden?c.innerText.replace(/\\n/g,' | '):'';})()`);
  log.push('hover: ' + hover + ' | short time: ' + await evaluate(`compactTime('11:00 AM')+' '+compactTime('2:30 PM')`));
  if (!/·/.test(hover) || await evaluate(`compactTime('11:00 AM')+' '+compactTime('2:30 PM')`) !== '11a 2:30p') fail('calendar posts should have a hover card and a short time when narrow');
  await evaluate(`showView('overview')`); await wait(200);
  if (!(await evaluate(`document.querySelector('.calendar-hovercard').hidden`))) fail('the hover card should close when the page changes');

  // Social Accounts: networks not connected sit in a compact row.
  await evaluate(`renderSocialAccountCards([{platform:'facebook',provider:'direct',status:'active',linked:true,displayName:'Page'},{platform:'pinterest',directAvailable:true}])`);
  const accounts = await json(`{cards:[...document.querySelectorAll('#social-account-grid > .social-account-card b')].map(e=>e.textContent),add:[...document.querySelectorAll('.social-add-item b')].map(e=>e.textContent)}`);
  log.push('accounts: ' + JSON.stringify(accounts));
  if (JSON.stringify(accounts.cards) !== JSON.stringify(['Facebook']) || !accounts.add.includes('Pinterest')) fail('connected accounts should be cards and the rest a compact Add a network row: ' + JSON.stringify(accounts));

  // Approvals show the post's first lines; the post panel shows the post as a card.
  await evaluate(`showView('approvals')`); await wait(600);
  if (!(await evaluate(`document.querySelectorAll('.approval-snippet').length`))) fail('Approvals should show the start of each post');
  await evaluate(`openPostDialog(serverPosts.find(p=>p.media.length&&p.status==='scheduled').id)`); await wait(600);
  const card = await json(`{head:document.querySelector('.post-dialog-card .pdc-head b')?.textContent||'',img:Boolean(document.querySelector('.post-dialog-card .pdc-media img'))}`);
  if (!card.head || !card.img) fail('the post panel should show the post as a card with its image: ' + JSON.stringify(card));
  await evaluate(`document.querySelector('#post-dialog').close()`);

  // Clients: search and sort once there are more than 8.
  await evaluate(`showView('clients')`); await wait(300);
  if (await evaluate(`Boolean(document.querySelector('#client-tools'))`)) fail('search should stay hidden with 8 or fewer clients');
  await evaluate(`['Zephyr Bikes','Acme Dental','Maple Bakery','Harbor Coffee','Nova Yoga','Lumen Studio'].forEach((name,i)=>clients.push({id:'extra-'+i,name,initials:'X'+i,color:'blue-art',logo:'#e8f1ff',text:'#5078c6',desc:'Sample client',channels:[]}));drawClients()`); await wait(200);
  await evaluate(`(()=>{const s=document.querySelector('#client-search');s.value='bak';s.dispatchEvent(new Event('input'));})()`); await wait(200);
  const found = await evaluate(`[...document.querySelectorAll('.client-card-name')].map(e=>e.textContent).join(', ')`);
  await evaluate(`(()=>{const s=document.querySelector('#client-search');s.value='';s.dispatchEvent(new Event('input'));const o=document.querySelector('#client-sort');o.value='name';o.dispatchEvent(new Event('change'));})()`); await wait(200);
  const first = await evaluate(`document.querySelector('.client-card-name').textContent`);
  log.push('clients: search bak → ' + found + ' | first by name: ' + first);
  if (found !== 'Maple Bakery' || first !== 'Acme Dental') fail('client search and sort should work: ' + found + ' / ' + first);

  // Home on a phone: what needs action first, Plan ahead and Performance folded until tapped.
  await setup(390, 844, true);
  await evaluate(`showView('overview')`); await wait(1200);
  const phone = await json(`{first:[...document.querySelectorAll('#view-overview .content-grid > *')].sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top)[0].classList.contains('approval-panel'),folded:getComputedStyle(document.querySelector('#view-overview .performance-panel > :not(.panel-header)')).display}`);
  await evaluate(`document.querySelector('#view-overview .performance-panel > .panel-header h2').click()`); await wait(200);
  const opened = await evaluate(`getComputedStyle(document.querySelector('#view-overview .performance-panel > :not(.panel-header)')).display`);
  log.push('phone home: ' + JSON.stringify(phone) + ' opened: ' + opened);
  if (!phone.first || phone.folded !== 'none' || opened === 'none') fail('on a phone, Needs your attention should come first and Performance should fold: ' + JSON.stringify(phone) + ' ' + opened);
};
