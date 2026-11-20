// Clients: the review page portal (Posts, Results, Send files, calendar link), files from clients in the
// Content Library, and content pillars (brand kit, Studio, calendar Color by → Pillar).
import fs from 'node:fs';
const stub = fs.readFileSync(new URL('../fixtures/workspace-stub.js', import.meta.url), 'utf8');
export default async ({ send, evaluate, wait, sampleData }) => {
  const check = async (ok, message) => { if (!ok) await evaluate(`console.error(${JSON.stringify('batch5: ' + message)})`); };
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 1000, deviceScaleFactor: 1, mobile: false });

  // --- The client portal ---
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.pathname.endsWith('review.html')){window.__review=[];window.__puts=[];window.fetch=async(url,init)=>{if(init?.method==='PUT'){__puts.push({url:String(url),type:init.headers['content-type']});return{ok:true,json:async()=>({})};}const body=JSON.parse(init.body);__review.push(body);const reply=p=>({ok:true,json:async()=>p});
    if(body.action==='load')return reply({client:{name:'Revere Rum',initials:'RR',color:'#336699',logo:''},workspace:'PK Works',expiresAt:new Date(Date.now()+864e6).toISOString(),campaign:'',posts:[{id:'0'.repeat(36),title:'Barrel day',scheduledFor:new Date(Date.now()+864e5).toISOString(),status:'waiting',clientStatus:null,campaign:'',versions:[{platform:'instagram',label:'Instagram',text:'Barrel day!',media:[]}],notes:[]}]});
    if(body.action==='results')return reply({days:30,posts:12,views:15400,reach:9100,engagements:640,networks:[{network:'Instagram',count:8},{network:'Facebook',count:4}],top:[{network:'Instagram',text:'Best one',url:'https://instagram.com/p/x',engagements:210,at:new Date().toISOString()}]});
    if(body.action==='upload-start')return reply({uploads:body.files.map((f,i)=>({path:'c-ws/'+i+'.jpg',uploadUrl:'https://sb.test/storage/v1/object/upload/sign/social-media/c-ws/'+i+'.jpg?token=t'}))});
    if(body.action==='upload-done')return reply({ok:true,arrived:body.paths.length});
    return reply({ok:true});};}` });
  const token = 'a'.repeat(43);
  await send('Page.navigate', { url: new URL('../../review.html', import.meta.url).href + '#t=' + token }); await wait(800);
  for (let i = 0; i < 30 && !(await evaluate(`Boolean(document.querySelector('#review-list')?.children.length)`)); i++) await wait(150);
  const portal = await evaluate(`JSON.stringify({tabs:!document.querySelector('#portal-tabs').hidden,cal:document.querySelector('#portal-calendar-link').getAttribute('href'),calShown:!document.querySelector('#portal-calendar').hidden})`);
  const p = JSON.parse(portal);
  await check(p.tabs && p.calShown && /api\/review\?format=ics&t=a{43}$/.test(p.cal), 'the portal shows its tabs and a calendar link: ' + portal);
  await evaluate(`document.querySelector('[data-portal="results"]').click()`); await wait(300);
  const results = await evaluate(`JSON.stringify({shown:!document.querySelector('#portal-results').hidden,posts:document.querySelector('#portal-posts').hidden,cards:[...document.querySelectorAll('.results-card b')].map(b=>b.textContent),top:document.querySelector('.results-post p')?.textContent})`);
  await check(results === JSON.stringify({ shown: true, posts: true, cards: ['12', '15.4k', '9,100', '640'], top: 'Best one' }), 'Results tab: ' + results);
  await evaluate(`document.querySelector('[data-portal="files"]').click()`); await wait(150);
  await evaluate(`(()=>{document.querySelector('#review-name').value='Jane';const dt=new DataTransfer();dt.items.add(new File(['x'],'kit.jpg',{type:'image/jpeg'}));dt.items.add(new File(['y'],'clip.mp4',{type:'video/mp4'}));const input=document.querySelector('#files-input');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#files-note').value='For the launch';document.querySelector('#files-form').requestSubmit();})()`); await wait(500);
  const sent = await evaluate(`JSON.stringify({start:__review.find(b=>b.action==='upload-start'),puts:__puts.map(p=>p.type),done:__review.find(b=>b.action==='upload-done')?.paths,status:document.querySelector('#files-status').textContent})`);
  const s = JSON.parse(sent);
  await check(s.start?.name === 'Jane' && s.start.note === 'For the launch' && s.start.files.map((f) => f.name).join() === 'kit.jpg,clip.mp4' && s.puts.join() === 'image/jpeg,video/mp4' && s.done.length === 2 && s.status === 'Sent 2 files. Thank you!', 'sending files: ' + sent);

  // --- The app: From clients, and pillars ---
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(2500);
  await sampleData(); await evaluate(stub); await wait(1200);
  await evaluate(`scheduleWorkspaceSave=()=>{};scheduleDraftSave=()=>{};currentRole='admin';window.__calls=[];const real=callSocialApi;callSocialApi=async body=>{__calls.push(body);if(body.action==='client-uploads')return{uploads:[{id:'u1',clientId:clients[0].id,path:'c-ws/a.jpg',url:'https://x.example/a.jpg',name:'Fall kit.jpg',type:'image/jpeg',size:10,sender:'Jane',note:'For the launch',at:new Date().toISOString()},{id:'u2',clientId:clients[0].id,path:'c-ws/b.jpg',url:'https://x.example/b.jpg',name:'Other.jpg',type:'image/jpeg',size:10,sender:'Jane',note:'',at:new Date().toISOString()}]};if(body.action==='client-upload-dismiss')return{ok:true};return real(body);};`);
  await evaluate(`showView('library')`); await wait(500);
  await check(await evaluate(`!document.querySelector('#client-files-panel').hidden&&document.querySelectorAll('.client-file').length===2&&/Jane/.test(document.querySelector('.client-file small').textContent)`), 'From clients lists the files');
  await evaluate(`document.querySelector('[data-client-file-keep="u1"]').click()`); await wait(300);
  await check(await evaluate(`libraryAssets[0].name==='Fall kit.jpg'&&libraryAssets[0].tags.includes('From client')&&document.querySelectorAll('.client-file').length===1&&__calls.some(c=>c.action==='client-upload-dismiss'&&c.id==='u1')`), 'Add to library keeps it and clears it from the list');
  await evaluate(`uploadedMedia=[];document.querySelector('[data-client-file-use="u2"]').click()`); await wait(400);
  await check(await evaluate(`uploadedMedia.some(m=>m.url==='https://x.example/b.jpg')&&document.querySelector('#view-composer').classList.contains('active')&&document.querySelector('#client-files-panel').hidden`), 'Use in post adds it to the Studio');

  // Pillars: parsing, the Studio picker, and the calendar mix.
  const parsed = await evaluate(`JSON.stringify(parsePillars('Education 40\\nPromotion: 30%\\nCommunity\\neducation 10\\n'))`);
  await check(parsed === JSON.stringify([{ name: 'Education', target: 40 }, { name: 'Promotion', target: 30 }, { name: 'Community', target: 0 }]), 'pillar lines: ' + parsed);
  await evaluate(`(()=>{clients[0].pillars=[{name:'Education',target:40},{name:'Promotion',target:60}];const s=document.querySelector('#client-select');s.value=clients[0].name;s.dispatchEvent(new Event('change',{bubbles:true}));renderPublishExtras();})()`); await wait(150);
  await check(await evaluate(`!document.querySelector('#pillar-pick').hidden&&[...document.querySelectorAll('#post-pillar option')].map(o=>o.textContent).join('|')==='No pillar|Education|Promotion'`), 'the Studio offers the client’s pillars');
  await evaluate(`(()=>{const s=document.querySelector('#post-pillar');s.value='Education';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await check(await evaluate(`postOptions.pillar`) === 'Education', 'the pick is kept with the draft');
  const mix = await evaluate(`(()=>{const mine=serverPosts.filter(p=>p.clientId===clients[0].id&&p.status!=='canceled');mine.forEach((p,i)=>{p.options={...(p.options||{}),pillar:i%2?'Promotion':'Education'};});showView('calendar');calView='month';const f=document.querySelector('#calendar-client');f.value=clients[0].id;f.dispatchEvent(new Event('change',{bubbles:true}));const s=document.querySelector('#cal-color-by');s.value='pillar';s.dispatchEvent(new Event('change',{bubbles:true}));return JSON.stringify({legend:document.querySelector('#calendar-legend').textContent,cls:[...new Set([...document.querySelectorAll('#calendar-grid .calendar-event')].map(e=>[...e.classList].find(c=>c.startsWith('event-'))))]});})()`);
  const m = JSON.parse(mix);
  await check(/Education · \d+ \(\d+%, goal 40%\)/.test(m.legend) && /Promotion · \d+ \(\d+%, goal 60%\)/.test(m.legend) && m.cls.every((c) => /^event-(c[01]|pl-none)$/.test(c)), 'pillar colors and the mix against the goals: ' + mix);
  await evaluate(`(()=>{const s=document.querySelector('#cal-color-by');s.value='client';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
};
