// Command Center client picker: one client or all of them (simulated sign-in, no network access).
import fs from 'node:fs';
const out = process.env.SHOTS || '';
export default async ({ send, evaluate, wait, log, sampleData }) => {
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(3000);
  await sampleData();
  await evaluate(`document.querySelector('#auth-dialog')?.open&&document.querySelector('#auth-dialog').close();try{localStorage.removeItem('signaldesk.homeClient')}catch{}`);
  await evaluate(`(()=>{const at=(days,hour)=>{const d=new Date();d.setDate(d.getDate()+days);d.setHours(hour,0,0,0);return d.toISOString();};
    const post=(id,clientId,title,status,days)=>({id,clientId,title,text:title,status,scheduledFor:at(days,10),createdBy:'u',media:[],mediaAlt:{},platformContent:{},options:{},jobs:[{id:id+'j',platform:'facebook',provider:'direct',status:'queued',runAt:at(days,10)}]});
    cloudFeaturesAvailable=()=>true;activeUser={id:'u',email:'owner@pkworks.co'};activeWorkspace={id:'w',name:'PK Works'};currentRole='admin';
    serverPosts=[post('p1','pk-works','PK launch','scheduled',1),post('p2','pk-works','PK approval','pending_approval',2),post('p3','bright-school-kits','Kits sale','scheduled',1)];
    const summary=(total,active,reauth)=>({engagement:{total,previous:0,measured:3,reach:1000,rate:5,daily:Array.from({length:30},(_,i)=>({day:new Date(Date.now()-(29-i)*864e5).toISOString().slice(0,10),engagements:i%5})),byPlatform:{facebook:total}},clients:{},connections:{active,reauth,platforms:['facebook'],clients:1},published:{total:3,viaSignalDesk:1,clients:1,synced:true},audience:[],clicks:null,worker:{lastRun:new Date().toISOString(),stale:false}});
    window.__calls=[];callSocialApi=async(body)=>{__calls.push(body.action+':'+(body.clientId||'all'));if(body.action==='overview')return body.clientId==='pk-works'?summary(120,3,[]):body.clientId?summary(40,1,[{platform:'instagram',clientId:body.clientId}]):summary(160,4,[{platform:'instagram',clientId:'bright-school-kits'}]);if(body.action==='network-posts')return{posts:[{id:'n1',clientId:'pk-works',platform:'facebook',text:'PK outside post',publishedAt:at(-1,9),viaSignalDesk:false,metrics:{engagements:5}},{id:'n2',clientId:'bright-school-kits',platform:'instagram',text:'Kits outside post',publishedAt:at(-2,9),viaSignalDesk:false,metrics:{engagements:9}}],accounts:[]};throw new Error('offline in this test');};
    window.setPicker=id=>{const s=document.querySelector('#overview-client');s.value=id;s.dispatchEvent(new Event('change'));};
    showView('overview');renderUpcoming();})()`); await wait(800);
  const stats = () => evaluate(`[...document.querySelectorAll('#view-overview .stats-grid .stat-number')].map(e=>e.innerText.replace(/\\s+/g,'')).join(' ')`);
  const upcoming = () => evaluate(`[...document.querySelectorAll('#upcoming-list .post-title')].map(e=>e.innerText).join(', ')`);
  log.push('picker options: ' + await evaluate(`[...document.querySelectorAll('#overview-client option')].map(o=>o.textContent).slice(0,3).join(', ')`));
  log.push('all clients → stats: ' + await stats() + ' | upcoming: ' + await upcoming());
  await evaluate(`setPicker('pk-works')`); await wait(500);
  log.push('PK Works → stats: ' + await stats() + ' | upcoming: ' + await upcoming() + ' | attention: ' + await evaluate(`document.querySelector('.approval-panel .count-badge').textContent`));
  log.push('subheading: ' + await evaluate(`document.querySelector('#view-overview .subheading').textContent`) + ' | upcoming client select hidden: ' + await evaluate(`document.querySelector('#upcoming-client').hidden`));
  log.push('remembered: ' + await evaluate(`localStorage.getItem('signaldesk.homeClient')`) + ' | calls: ' + await evaluate(`__calls.join(' ')`));
  if (out) { const { result } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1400, height: 1000, scale: 0.7 } }); fs.writeFileSync(out + 'home_client.png', Buffer.from(result.data, 'base64')); }
  // Analytics follows the same choice.
  await evaluate(`showView('analytics')`); await wait(800);
  const posts = () => evaluate(`[...document.querySelectorAll('#all-posts-body tr b')].map(e=>e.innerText).join(', ')`);
  log.push('Analytics PK Works → picker: ' + await evaluate(`document.querySelector('#analytics-client').value`) + ' | engagements: ' + await evaluate(`document.querySelectorAll('.analytics-stats .stat-number')[1].innerText`) + ' | posts: ' + await posts() + ' | ' + await evaluate(`document.querySelector('#view-analytics .subheading').textContent`));
  await evaluate(`(()=>{const s=document.querySelector('#analytics-client');s.value='';s.dispatchEvent(new Event('change'));})()`); await wait(400);
  log.push('Analytics all → engagements: ' + await evaluate(`document.querySelectorAll('.analytics-stats .stat-number')[1].innerText`) + ' | posts: ' + await posts() + ' | home picker follows: ' + JSON.stringify(await evaluate(`document.querySelector('#overview-client').value`)));
  await evaluate(`showView('overview')`); await wait(500);
  log.push('back to all → stats: ' + await stats() + ' | upcoming: ' + await upcoming());
  // Beta feedback goes to the server with the page attached.
  await evaluate(`window.__fb=null;const base=callSocialApi;callSocialApi=async(b)=>{if(b.action==='send-feedback'){__fb=b;return{sent:true};}return base(b);};document.querySelector('[data-open-feedback]').click()`); await wait(300);
  await evaluate(`document.querySelector('#feedback-dialog [data-kind="idea"]').click();document.querySelector('#feedback-message').value='A bulk upload would help';document.querySelector('#feedback-form').requestSubmit()`); await wait(400);
  const fb = JSON.parse(await evaluate(`JSON.stringify({kind:__fb?.kind,message:__fb?.message,view:__fb?.context?.view,open:document.querySelector('#feedback-dialog').open})`));
  log.push('feedback: ' + JSON.stringify(fb));
  if (fb.kind !== 'idea' || fb.message !== 'A bulk upload would help' || !fb.view || fb.open) log.push('[exception] feedback should send the kind, message and page, then close');
  // Analytics time frames: a year asks the server for 365 days and shows weekly points.
  await evaluate(`(()=>{window.__days=[];const base=callSocialApi;callSocialApi=async(b)=>{if(b.action==='overview'&&b.days){__days.push(b.days+':'+(b.clientId||'all'));const weeks=Array.from({length:53},(_,i)=>({day:new Date(Date.now()-(52-i)*7*864e5).toISOString().slice(0,10),engagements:i%4}));return{range:b.days,step:7,engagement:{total:900,previous:600,measured:40,reach:9000,rate:10,daily:weeks,byPlatform:{facebook:900}},clients:{},connections:{active:1,reauth:[],platforms:['facebook'],clients:1},published:{total:80,viaSignalDesk:5,clients:1,synced:true},audience:[],clicks:null};}if(b.action==='network-posts'){__days.push('posts:'+Math.round((Date.parse(b.to)-Date.parse(b.from))/864e5));return{posts:[],accounts:[]};}return base(b);};showView('analytics');})()`); await wait(500);
  const options = await evaluate(`[...document.querySelectorAll('#analytics-range option')].map(o=>o.textContent).join(', ')`);
  log.push('time frames: ' + options);
  if (options !== 'Last 7 days, Last 14 days, Last 30 days, Last 60 days, Last 90 days, Last 12 months') log.push('[exception] the time frame picker should list 7 days to 12 months');
  await evaluate(`(()=>{const s=document.querySelector('#analytics-range');s.value='365';s.dispatchEvent(new Event('change'));})()`); await wait(800);
  const year = JSON.parse(await evaluate(`JSON.stringify({calls:__days,engagements:document.querySelectorAll('.analytics-stats .stat-number')[1]?.innerText,foot:document.querySelectorAll('.analytics-stats .stat-foot')[1]?.innerText,range:document.querySelector('#analytics-trend-panel .performance-range')?.textContent,labels:[...document.querySelectorAll('#analytics-trend-panel .chart-x span')].map(e=>e.textContent),remembered:localStorage.getItem('signaldesk.analyticsDays')})`));
  log.push('12 months: ' + JSON.stringify(year));
  if (!year.calls.includes('365:all') || year.engagements !== '900' || !/previous 12 months/.test(year.foot) || year.range !== 'Last 12 months' || year.labels.length !== 7 || year.remembered !== '365' || !year.calls.includes('posts:366')) log.push('[exception] picking 12 months should load and label a year of results');
  if (out) { const { result } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1400, height: 1000, scale: 0.7 } }); fs.writeFileSync(out + 'analytics_year.png', Buffer.from(result.data, 'base64')); }
  // Explainer bubbles float above the page and stay on screen, even in the top-left card.
  const tipBox = JSON.parse(await evaluate(`(()=>{const t=document.querySelector('.analytics-stats .tip');t.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));const b=document.querySelector('.tip-float').getBoundingClientRect();return JSON.stringify({top:b.top,left:b.left,right:b.right,visible:document.querySelector('.tip-float').classList.contains('visible'),inBody:document.querySelector('.tip-float').parentNode===document.body});})()`));
  log.push('tooltip: ' + JSON.stringify(tipBox));
  if (!tipBox.visible || tipBox.top < 0 || tipBox.left < 0 || tipBox.right > 1400 || !tipBox.inBody) log.push('[exception] the explainer bubble should be fully on screen');
  await evaluate(`document.querySelector('.analytics-stats .tip').dispatchEvent(new MouseEvent('mouseout',{bubbles:true}));(()=>{const s=document.querySelector('#analytics-range');s.value='30';s.dispatchEvent(new Event('change'));})();try{localStorage.removeItem('signaldesk.analyticsDays')}catch{}`);
  await evaluate(`try{localStorage.removeItem('signaldesk.homeClient')}catch{}`);
};
