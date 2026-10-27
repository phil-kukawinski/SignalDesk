// Calendar and Analytics with posts from every source (simulated sign-in, no network access).
import fs from 'node:fs';
const out = process.env.SHOTS || '';
export default async ({ send, evaluate, wait, log, sampleData }) => {
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1200, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(3000);
  await sampleData();
  await evaluate(`document.querySelector('#auth-dialog')?.open&&document.querySelector('#auth-dialog').close()`);
  await evaluate(`(()=>{const at=(days,hour)=>{const d=new Date();d.setDate(d.getDate()+days);d.setHours(hour,0,0,0);return d.toISOString();};
    window.__posts=[{id:'n1',clientId:'pk-works',platform:'facebook',url:'https://facebook.com/1',text:'Posted from the Facebook app\\nSecond line',mediaUrl:'',publishedAt:at(0,9),viaSignalDesk:false,metrics:{likes:12,comments:2,engagements:14,reach:300,engagementRate:4.67},metricsAt:new Date().toISOString()},{id:'n2',clientId:'pk-works',platform:'instagram',url:'https://instagram.com/p/2',text:'Reel from Instagram',mediaUrl:'',publishedAt:at(0,14),viaSignalDesk:false,metrics:{reach:2000,engagements:110,engagementRate:5.5}},{id:'n3',clientId:'pk-works',platform:'facebook',url:'https://facebook.com/3',text:'Scheduled with SignalDesk',publishedAt:at(0,11),viaSignalDesk:true,metrics:{engagements:48}}];
    cloudFeaturesAvailable=()=>true;activeUser={id:'u',email:'owner@pkworks.co'};activeWorkspace={id:'w',name:'PK Works'};currentRole='admin';serverPosts=[];
    overviewSummary={engagement:{total:172,previous:100,measured:3,reach:2300,rate:7.48,daily:[],byPlatform:{facebook:62,instagram:110}},clients:{},connections:{active:2,reauth:[],platforms:[],clients:1},published:{total:3,viaSignalDesk:1,clients:1,synced:true},audience:[{clientId:'pk-works',platform:'instagram',followers:2500,change:40,reach:4000},{clientId:'pk-works',platform:'facebook',followers:1200,change:null}],clicks:null};
    callSocialApi=async(body)=>{if(body.action==='network-posts')return{posts:window.__posts,accounts:[{clientId:'pk-works',platform:'facebook',syncedAt:new Date(Date.now()-3600000).toISOString()},{clientId:'pk-works',platform:'linkedin',syncedAt:new Date().toISOString(),note:'LinkedIn doesn’t let apps read a personal profile’s posts, so only posts made through SignalDesk appear.'}]};throw new Error('offline in this test');};
    calView='day';calCursor=startOfDay(new Date());showView('calendar');})()`); await wait(1200);
  const events = () => evaluate(`[...document.querySelectorAll('#view-calendar [data-network-post]')].map(e=>e.innerText.replace(/\\s+/g,' ').slice(0,60)).join(' | ')`);
  log.push('outside posts on calendar: ' + await events());
  log.push('external styling: ' + await evaluate(`document.querySelectorAll('#view-calendar .calendar-event.is-external').length`) + ' | SignalDesk-made post shown twice: ' + await evaluate(`[...document.querySelectorAll('#view-calendar .calendar-event')].filter(e=>/Scheduled with SignalDesk/.test(e.innerText)).length`));
  log.push('note: ' + await evaluate(`document.querySelector('#network-note')?.innerText.replace(/\\s+/g,' ')`));
  await evaluate(`document.querySelector('#calendar-network').value='instagram';document.querySelector('#calendar-network').dispatchEvent(new Event('change'))`); await wait(300);
  log.push('Instagram only: ' + await events());
  await evaluate(`document.querySelector('#calendar-network').value='';document.querySelector('#calendar-network').dispatchEvent(new Event('change'));document.querySelector('#calendar-source').value='signaldesk';document.querySelector('#calendar-source').dispatchEvent(new Event('change'))`); await wait(300);
  log.push('SignalDesk only, outside posts hidden: ' + (await events() === ''));
  await evaluate(`document.querySelector('#calendar-source').value='';document.querySelector('#calendar-source').dispatchEvent(new Event('change'))`); await wait(300);
  await evaluate(`document.querySelector('[data-network-post="n1"]').click()`); await wait(300);
  log.push('details: ' + await evaluate(`document.querySelector('#network-post-dialog')?.open`) + ' | ' + await evaluate(`document.querySelector('#network-post-body').innerText.replace(/\\s+/g,' ').slice(0,200)`));
  if (out) { const r = JSON.parse(await evaluate(`JSON.stringify(document.querySelector('#network-post-dialog').getBoundingClientRect())`)); const { result } = await send('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 } }); fs.writeFileSync(out + 'network_dialog.png', Buffer.from(result.data, 'base64')); }
  await evaluate(`document.querySelector('#network-post-dialog').close()`);
  if (out) { const r = JSON.parse(await evaluate(`JSON.stringify(document.querySelector('.calendar-panel').getBoundingClientRect())`)); const { result } = await send('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 1100), scale: 0.8 } }); fs.writeFileSync(out + 'network_calendar.png', Buffer.from(result.data, 'base64')); }
  // Analytics
  await evaluate(`showView('analytics');renderAnalyticsOverview()`); await wait(900);
  log.push('published card: ' + await evaluate(`[...document.querySelectorAll('.analytics-stats .stat-card')].pop().innerText.replace(/\\s+/g,' ')`));
  log.push('audience: ' + await evaluate(`document.querySelector('#audience-panel')?.innerText.replace(/\\s+/g,' ').slice(0,200)`));
  log.push('top posts rows: ' + await evaluate(`[...document.querySelectorAll('#all-posts-body tr')].map(r=>r.cells[0].innerText.replace(/\\s+/g,' ').slice(0,30)+' / '+r.cells[2].innerText).join(' | ')`));
  await evaluate(`document.querySelector('#all-posts-sort').value='reach';document.querySelector('#all-posts-sort').dispatchEvent(new Event('change',{bubbles:true}))`); await wait(200);
  log.push('sorted by reach, first: ' + await evaluate(`document.querySelector('#all-posts-body tr').cells[0].innerText.replace(/\\s+/g,' ').slice(0,30)`));
  if (out) { const r = JSON.parse(await evaluate(`(()=>{const a=document.querySelector('#audience-panel').getBoundingClientRect(),b=document.querySelector('#all-posts-panel').getBoundingClientRect();return JSON.stringify({x:a.x,y:a.y+scrollY,width:a.width,height:b.bottom-a.top})})()`)); const { result } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 1200), scale: 0.8 } }); fs.writeFileSync(out + 'network_analytics.png', Buffer.from(result.data, 'base64')); }
};
