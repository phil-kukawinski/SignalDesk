// Analytics: What works (Posts tab), Compare (time frames and campaigns), notes on the chart, the pillar
// mix in the Command Center goals, and the report's Download PDF button.
import fs from 'node:fs';
const stub = fs.readFileSync(new URL('../fixtures/workspace-stub.js', import.meta.url), 'utf8');
export default async ({ send, evaluate, wait, sampleData }) => {
  const check = async (ok, message) => { if (!ok) await evaluate(`console.error(${JSON.stringify('batch6: ' + message)})`); };
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(2500);
  await sampleData(); await evaluate(stub); await wait(1200);
  await evaluate(`scheduleWorkspaceSave=()=>{};currentRole='admin';window.__calls=[];const real=callSocialApi;callSocialApi=async body=>{__calls.push(body);
    if(body.action==='content-insights')return{days:body.days,posts:12,average:{posts:12,avgEngagements:40,rate:4.1},types:[{type:'Video',posts:4,avgEngagements:80,rate:6,lift:100},{type:'Photo',posts:8,avgEngagements:20,rate:2,lift:-50}],lengths:[{length:'Short (under 80 characters)',posts:5,avgEngagements:50,rate:5,lift:25}],hashtags:[{tag:'#rum',posts:3,avgEngagements:70,rate:5,lift:75}]};
    if(body.action==='compare-periods')return{a:{posts:10,views:2000,reach:1500,engagements:120,engagementRate:8,clicks:30},b:{posts:8,views:1000,reach:1200,engagements:100,engagementRate:8.3,clicks:null}};
    if(body.action==='campaigns')return{campaigns:[{clientId:clients[0].id,campaign:'Fall',posts:6,published:6,views:900,reach:800,engagements:90,engagementRate:11.25,clicks:12,best:{title:'Barrel day'}},{clientId:clients[0].id,campaign:'Spring',posts:4,published:4,views:600,reach:500,engagements:30,engagementRate:6,clicks:4,best:{title:'Bloom'}}]};
    return real(body);};`);

  // What works.
  await evaluate(`showView('analytics');setAnalyticsTab('posts')`); await wait(500);
  const works = await evaluate(`JSON.stringify({shown:getComputedStyle(document.querySelector('#works-panel')).display!=='none',rows:[...document.querySelectorAll('#works-body .works-row b')].map(b=>b.textContent),lift:document.querySelector('#works-body .lift.up')?.textContent,call:__calls.find(c=>c.action==='content-insights')})`);
  const w = JSON.parse(works);
  await check(w.shown && w.rows.join('|') === 'Video|Photo|Short (under 80 characters)|#rum' && w.lift === '+100% vs. average' && w.call.days === 90, 'What works: ' + works);
  await check(await evaluate(`getComputedStyle(document.querySelector('#compare-panel')).display`) === 'none', 'Compare stays on its own tab');

  // Compare: time frames, then campaigns.
  await evaluate(`setAnalyticsTab('compare')`); await wait(500);
  const periods = await evaluate(`JSON.stringify({head:[...document.querySelectorAll('.compare-table thead th')].map(t=>t.textContent),views:[...document.querySelectorAll('.compare-table tbody tr')][1]?.textContent,rate:[...document.querySelectorAll('.compare-table tbody tr')][4]?.textContent,call:__calls.filter(c=>c.action==='compare-periods').pop()})`);
  const p = JSON.parse(periods);
  await check(p.head.join('|') === '|This month|Last month|Change' && p.views === 'Views2,0001,000+100%' && p.rate === 'Engagement rate8%8.3%-0.3 pts' && Date.parse(p.call.a.from) > Date.parse(p.call.b.from), 'Compare time frames: ' + periods);
  await evaluate(`document.querySelector('[data-compare-mode="campaigns"]').click()`); await wait(400);
  const camps = await evaluate(`JSON.stringify({head:[...document.querySelectorAll('.compare-table thead th')].map(t=>t.textContent),eng:[...document.querySelectorAll('.compare-table tbody tr')][4]?.textContent})`);
  await check(JSON.parse(camps).head.join('|') === '|Fall|Spring|Change' && JSON.parse(camps).eng === 'Engagements9030+200%', 'Compare campaigns: ' + camps);

  // Notes on the chart: add one dated in range, it marks the chart; remove it.
  await evaluate(`showView('overview')`); await wait(800);
  const hasChart = await evaluate(`Boolean(document.querySelector('[data-add-chart-note]'))`);
  await check(hasChart, 'the chart offers Add a note');
  if (hasChart) {
    await evaluate(`(()=>{document.querySelector('[data-add-chart-note]').click();const form=document.querySelector('.chart-note-form');form.date.value=localIsoDate(addDays(new Date(),-2));form.text.value='Launched the fall sale';form.requestSubmit();})()`); await wait(800);
    const marked = await evaluate(`JSON.stringify({notes:chartNotes.length,chip:document.querySelector('.chart-note-chip')?.textContent||'',line:document.querySelectorAll('.chart-note-line').length,tip:document.querySelector('.chart-note-hit')?.dataset.tip||''})`);
    const m = JSON.parse(marked);
    await check(m.notes === 1 && /Launched the fall sale/.test(m.chip) && m.line >= 1 && /^Note, .*: Launched the fall sale$/.test(m.tip), 'the note marks the chart: ' + marked);
    await evaluate(`document.querySelector('[data-remove-chart-note]').click()`); await wait(800);
    await check(await evaluate(`chartNotes[0].removed===true&&!document.querySelector('.chart-note-chip')&&collectSharedState().chartNotes.length===1`), 'removing hides it and keeps a removed marker');
  }
  await check(await evaluate(`chartNoteIndex([{day:'2026-11-02'},{day:'2026-11-09'}],'2026-11-11',true)===1&&chartNoteIndex([{day:'2026-11-02'}],'2026-10-01',true)===-1`), 'weekly charts put a note in its week');

  // Pillar mix in the goals panel.
  const mix = await evaluate(`(()=>{const c=clients[0];c.pillars=[{name:'Education',target:50},{name:'Promotion',target:50}];const now=new Date();serverPosts.filter(p=>p.clientId===c.id).forEach((p,i)=>{p.status='scheduled';p.scheduledFor=new Date(now.getFullYear(),now.getMonth(),Math.min(27,1+i),10).toISOString();p.options={...(p.options||{}),pillar:i===0?'Promotion':'Education'};});renderGoals();return JSON.stringify([...document.querySelectorAll('.pillar-bar')].map(b=>b.textContent));})()`);
  await check(/Education\d+% · goal 50%/.test(mix) && /Promotion\d+% · goal 50%/.test(mix), 'pillar mix in the goals: ' + mix);

  // The report page has a real PDF download next to Print.
  await check(await evaluate(`/data-pdf>Download PDF</.test(reportHtml({client:clients[0],period:{label:'October 2026'},campaign:'',data:{report:{postCount:0,totals:{},rows:[]},highlights:[],scheduled:0,previous:null}}))`), 'reports offer Download PDF');
  const pdf = await evaluate(`(async()=>{const blob=reportPdfBlob({client:clients[0],period:{label:'October 2026'},campaign:'',data:{report:{postCount:2,totals:{views:100,engagements:9,engagementRate:9},rows:[{platform:'instagram',text:'One',publishedAt:new Date().toISOString(),metrics:{views:60,engagements:5}},{platform:'facebook',text:'Two',publishedAt:new Date().toISOString(),metrics:{views:40,engagements:4}}]},highlights:['Instagram led.'],scheduled:1,previous:null}});const text=await blob.text();return blob.type+'|'+text.slice(0,8)+'|'+/Top posts/.test(text);})()`);
  await check(pdf === 'application/pdf|%PDF-1.4|true', 'the PDF builds in the browser: ' + pdf);
};
