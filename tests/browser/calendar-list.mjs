// Calendar → List: every upcoming post, soonest first, filtered by client and network, reaching past the
// calendar's own two-month window.
export default async ({ send, evaluate, wait, log, sampleData }) => {
  const fail = (message) => log.push('[exception] ' + message);
  const json = async (expression) => JSON.parse(await evaluate(`JSON.stringify(${expression})`));
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(3000);
  await sampleData();
  await evaluate(`document.querySelector('#auth-dialog')?.open&&document.querySelector('#auth-dialog').close();(()=>{
    cloudFeaturesAvailable=()=>true;activeUser={id:'u1',email:'owner@studio.test'};activeWorkspace={id:'w1',name:'Studio'};currentRole='admin';
    const at=days=>new Date(Date.now()+days*86400000).toISOString();
    const post=(id,clientId,title,days,platforms,status='scheduled')=>({id,clientId,title,text:title,status,source:'composer',scheduledFor:at(days),campaign:'',media:[],platformContent:{},mediaAlt:{},options:{},jobs:platforms.map((platform,i)=>({id:id+i,platform,provider:'direct',status:status==='published'?'published':'queued'}))});
    const pk=clients[0].id,other=clients[1].id;
    serverPosts=[post('p1',pk,'Tomorrow on Facebook',1,['facebook']),post('p2',other,'Instagram for the other client',3,['instagram'],'pending_approval'),post('p0',pk,'Already out',-2,['facebook'],'published')];serverPostsLoadedAt=Date.now();
    window.__far=post('p9',pk,'Far ahead on X',200,['twitter']);window.__calls=[];
    callSocialApi=async(body)=>{__calls.push(body);if(body.action==='posts'){const from=Date.parse(body.from),to=Date.parse(body.to),t=Date.parse(__far.scheduledFor);return{posts:t>=from&&t<to?[__far]:[],now:new Date().toISOString()};}if(body.action==='autopilot')return{feeds:[],items:[]};return{};};
    window.__clients=[pk,other];
  })()`);
  await evaluate(`showView('calendar');document.querySelector('[data-cal-view="list"]').click()`); await wait(600);
  const all = await json(`{titles:[...document.querySelectorAll('.calendar-list-row b')].map(el=>el.textContent),count:document.querySelector('.calendar-list-count')?.textContent,label:document.querySelector('#calendar-month').textContent,arrows:document.querySelector('#prev-month').hidden,timeline:document.querySelector('#calendar-timeline').hidden,pages:__calls.filter(c=>c.action==='posts').length,print:document.querySelector('#print-calendar').hidden}`);
  log.push('list: ' + JSON.stringify(all));
  if (JSON.stringify(all.titles) !== JSON.stringify(['Tomorrow on Facebook', 'Instagram for the other client', 'Far ahead on X'])) fail('the list should show upcoming posts soonest first, including ones months ahead: ' + all.titles);
  if (!/^3 upcoming posts/.test(all.count || '') || all.label !== 'Upcoming posts' || !all.arrows || !all.timeline || !all.print) fail('the list should replace the timeline and hide the date arrows and Print');
  if (all.pages !== 4) fail('a year ahead should load in four 100-day windows: ' + all.pages);
  // Filters: client, then network.
  await evaluate(`(()=>{const s=document.querySelector('#calendar-client');s.value=__clients[1];s.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(200);
  const byClient = await json(`[...document.querySelectorAll('.calendar-list-row b')].map(el=>el.textContent)`);
  if (JSON.stringify(byClient) !== JSON.stringify(['Instagram for the other client'])) fail('the client filter should apply: ' + byClient);
  await evaluate(`(()=>{const c=document.querySelector('#calendar-client');c.value='';c.dispatchEvent(new Event('change',{bubbles:true}));const n=document.querySelector('#calendar-network');n.value='twitter';n.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(200);
  const byNetwork = await json(`[...document.querySelectorAll('.calendar-list-row b')].map(el=>el.textContent)`);
  if (JSON.stringify(byNetwork) !== JSON.stringify(['Far ahead on X'])) fail('the network filter should apply: ' + byNetwork);
  await evaluate(`(()=>{const n=document.querySelector('#calendar-network');n.value='tiktok';n.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(200);
  if (!/No upcoming posts match/.test(await evaluate(`document.querySelector('#calendar-list').textContent`))) fail('an empty result should say so');
  await evaluate(`(()=>{const n=document.querySelector('#calendar-network');n.value='';n.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(200);
  // A row opens the post.
  await evaluate(`window.__opened=null;openPostDialog=id=>{__opened=id;};document.querySelector('.calendar-list-row[data-open-post="p1"]').click()`); await wait(200);
  if (await evaluate(`__opened`) !== 'p1') fail('selecting a row should open the post');
  // Back to Week shows the timeline again.
  await evaluate(`document.querySelector('[data-cal-view="week"]').click()`); await wait(200);
  if (await evaluate(`document.querySelector('#calendar-timeline').hidden||!document.querySelector('#calendar-list').hidden||document.querySelector('#prev-month').hidden`)) fail('switching back to Week should restore the timeline');
  if (process.env.SHOTS) { await evaluate(`document.querySelector('[data-cal-view="list"]').click()`); await wait(300); const { result } = await send('Page.captureScreenshot', { format: 'png' }); (await import('node:fs')).writeFileSync(process.env.SHOTS + 'calendar_list.png', Buffer.from(result.data, 'base64')); }
};
