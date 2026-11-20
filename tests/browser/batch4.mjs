// Publishing Studio: drag-to-place Instagram tags, Story safe zones, video trimming, A/B captions,
// Send to my phone, and files shared from the phone.
import fs from 'node:fs';
const stub = fs.readFileSync(new URL('../fixtures/workspace-stub.js', import.meta.url), 'utf8');
export default async ({ send, evaluate, wait, sampleData }) => {
  const check = async (ok, message) => { if (!ok) await evaluate(`console.error(${JSON.stringify('batch4: ' + message)})`); };
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(2500);
  await sampleData(); await evaluate(stub); await wait(1200);
  await evaluate(`scheduleWorkspaceSave=()=>{};scheduleDraftSave=()=>{};saveWorkspaceState=async()=>{};currentRole='admin';window.__calls=[];const real=callSocialApi;callSocialApi=async body=>{__calls.push(body);if(body.action==='publish')return{post:{id:'n'+__calls.length,scheduledFor:body.scheduleDate},requiresApproval:false};if(body.action==='send-to-phone')return{sent:1};return real(body);};`);
  await evaluate(`showView('composer')`); await wait(500);

  // Tags: one image and two names show two chips; dragging one saves its spot, and the post uses it.
  const img = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#89a"/></svg>');
  await evaluate(`(()=>{uploadedMedia=[{url:${JSON.stringify(img)},type:'image/svg+xml',name:'a.png'}];platformOverrides={};postOptions.tags='sam.lee, jo';postOptions.tagPositions={};updatePreview();})()`); await wait(300);
  const chips = await evaluate(`[...document.querySelectorAll('#tag-placer .tag-chip')].map(c=>c.textContent+'@'+c.style.left+','+c.style.top).join('|')`);
  await check(chips === '@sam.lee@33%,90%|@jo@67%,90%', 'two chips along the bottom: ' + chips);
  await evaluate(`(()=>{const chip=document.querySelector('#tag-placer .tag-chip');document.querySelector('#tag-stage').getBoundingClientRect=()=>({left:100,top:100,width:400,height:400});const stage=document.querySelector('#tag-stage').getBoundingClientRect(),at=(x,y)=>({clientX:stage.left+stage.width*x,clientY:stage.top+stage.height*y,bubbles:true,pointerId:1});chip.dispatchEvent(new PointerEvent('pointerdown',at(.33,.9)));document.dispatchEvent(new PointerEvent('pointermove',at(.25,.4)));document.dispatchEvent(new PointerEvent('pointerup',at(.25,.4)));})()`); await wait(100);
  const spot = await evaluate(`JSON.stringify(postOptions.tagPositions['sam.lee'])`);
  await check(spot === JSON.stringify({ x: 0.25, y: 0.4 }), 'dragging saves the spot: ' + spot);
  await evaluate(`document.querySelectorAll('#tag-placer .tag-chip')[1].focus();document.querySelectorAll('#tag-placer .tag-chip')[1].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}))`);
  await check(await evaluate(`postOptions.tagPositions.jo.y`) === 0.88, 'arrow keys move a tag');
  const tags = await evaluate(`JSON.stringify(['sam.lee','jo'].map((n,i)=>({username:n,...tagPosition(n,i,2)})))`);
  await check(tags === JSON.stringify([{ username: 'sam.lee', x: 0.25, y: 0.4 }, { username: 'jo', x: 0.67, y: 0.88 }]), 'the post sends the placed spots: ' + tags);
  await check(await evaluate(`JSON.stringify(cleanTagPositions({'ok':{x:.5,y:.5},'bad name!':{x:.5,y:.5},'far':{x:2,y:.5}}))`) === JSON.stringify({ ok: { x: 0.5, y: 0.5 } }), 'saved spots are checked');
  await evaluate(`(()=>{uploadedMedia=[{url:'https://x.example/v.mp4',type:'video/mp4'}];updatePreview();})()`); await wait(150);
  await check(await evaluate(`document.querySelector('#tag-placer').hidden`), 'no placer for a video');

  // Story safe zones show on the Story preview and can be turned off.
  await evaluate(`(()=>{uploadedMedia=[{url:${JSON.stringify(img)},type:'image/svg+xml'}];previewTarget=()=>'instagram_story';updatePreview();})()`); await wait(300);
  const safe = await evaluate(`JSON.stringify({zones:document.querySelectorAll('.pv-story .pv-safe i').length,toggle:Boolean(document.querySelector('[data-story-safe]'))})`);
  await check(JSON.parse(safe).toggle, 'the Story preview shows: ' + safe);
  if (JSON.parse(safe).toggle) {
    await check(JSON.parse(safe).zones === 2, 'the Story preview shades the top and bottom: ' + safe);
    await evaluate(`(()=>{const b=document.querySelector('[data-story-safe]');b.checked=false;b.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(100);
    await check(await evaluate(`!document.querySelector('.pv-story .pv-safe')&&localStorage.getItem('signaldesk-story-safe')==='0'`), 'turning them off hides them and is remembered');
    await evaluate(`localStorage.removeItem('signaldesk-story-safe')`);
  }
  await check(/pv-safe-top/.test(await evaluate(`storySafeHtml()`)), 'safe zones are on by default');

  // Trim: the button opens the dialog, the range is checked, and the trimmed file replaces the original.
  await evaluate(`(()=>{if(typeof selectVariant==='function')selectVariant('all');uploadedMedia=[{url:'https://x.example/v.mp4',type:'video/mp4',name:'clip.mp4',alt:'A clip'}];platformOverrides={};renderMediaTray();})()`); await wait(150);
  await check(await evaluate(`Boolean(document.querySelector('[data-tray-trim="0"]'))`), 'videos get a Trim button');
  await evaluate(`document.querySelector('[data-tray-trim="0"]').click()`); await wait(200);
  await evaluate(`(()=>{const v=document.querySelector('#trim-video');Object.defineProperty(v,'duration',{value:30,configurable:true});document.querySelector('#trim-start').value='2';document.querySelector('#trim-end').value='2.5';updateTrimLength();})()`);
  await check(await evaluate(`document.querySelector('#trim-save').disabled&&/at least 1 second/.test(document.querySelector('#trim-length').textContent)`), 'too short is refused');
  await evaluate(`document.querySelector('#trim-end').value='12';updateTrimLength();`);
  await check(await evaluate(`!document.querySelector('#trim-save').disabled&&/10\\.0 seconds of 30\\.0/.test(document.querySelector('#trim-length').textContent)`), 'a 10-second cut is allowed');
  await evaluate(`(async()=>{trimMimeType=()=>'video/mp4';recordTrim=async(v,s,e,m,progress)=>{window.__trim=[s,e];progress(e-s);return new Blob(['x'],{type:'video/mp4'});};uploadToStorage=async file=>({url:'https://x.example/clip-trimmed.mp4',name:file.name,type:file.type,size:1,path:'p'});await saveTrim();})()`); await wait(300);
  const trimmed = await evaluate(`JSON.stringify({range:__trim,media:uploadedMedia.map(m=>[m.url,m.name,m.alt]),open:document.querySelector('#trim-dialog').open})`);
  await check(trimmed === JSON.stringify({ range: [2, 12], media: [['https://x.example/clip-trimmed.mp4', 'clip-trimmed.mp4', 'A clip']], open: false }), 'the trimmed copy replaces the video and keeps its description: ' + trimmed);

  // A/B: version B is scheduled a week later with the second caption, same networks; the details compare them.
  const ab = await evaluate(`(async()=>{postOptions.ab={enabled:true,text:'Question version?',days:7};const plan=abPlan();const when=await scheduleVersionB(plan,{client:clients[0],text:'Statement version.',platforms:['facebook','instagram'],platformContent:{instagram:{text:'IG A'}},options:{autoRepost:{repeat:2,days:7},utm:true},manual:[],scheduledFor:'2026-12-01T15:00:00.000Z',requiresApproval:false});const call=__calls.filter(c=>c.action==='publish').pop();return JSON.stringify({when:Boolean(when),text:call.text,ig:call.platformContent.instagram.text,platforms:call.platforms,days:Math.round((Date.parse(call.scheduleDate)-Date.parse('2026-12-01T15:00:00.000Z'))/864e5),repeat:'autoRepost' in call.options,test:call.options.abTest.version,group:call.options.abTest.group===plan.group});})()`);
  await check(ab === JSON.stringify({ when: true, text: 'Question version?', ig: 'Question version?', platforms: ['facebook', 'instagram'], days: 7, repeat: false, test: 'B', group: true }), 'version B: ' + ab);
  await check(await evaluate(`(()=>{postOptions.ab={enabled:false,text:'x',days:7};return abPlan()===null;})()`), 'no test when it is off');
  const compare = await evaluate(`(()=>{const base=serverPosts.find(p=>p.status==='published')||serverPosts[0];const mk=(id,v,eng,reach)=>({...base,id,status:'published',text:'Caption '+v,options:{abTest:{group:'g1234567',version:v}},jobs:[{...base.jobs[0],status:'published',metrics:{engagements:eng,reach}}]});serverPosts.push(mk('ab1','A',30,1000),mk('ab2','B',45,1000));return abCompareHtml(serverPosts.find(p=>p.id==='ab1'));})()`);
  await check(/Version A \(this post\)/.test(compare) && /ab-win"><b>Version B · did better/.test(compare) && /4\.5%/.test(compare), 'the details compare A and B and mark the better one');

  // Send to my phone, on a reminder post.
  await evaluate(`(()=>{const base=serverPosts.find(p=>p.status==='scheduled');serverPosts.push({...base,id:'m1',title:'TikTok reminder',status:'scheduled',text:'Caption for TikTok',platformContent:{},jobs:[{...base.jobs[0],id:'m1j',platform:'tiktok',provider:'manual',status:'queued'}]});openPostDialog('m1');})()`); await wait(300);
  await check(await evaluate(`Boolean(document.querySelector('#post-dialog [data-send-phone]'))&&Boolean(document.querySelector('#post-dialog [data-copy-caption="tiktok"]'))`), 'reminder posts offer Copy caption and Send to my phone');
  await evaluate(`document.querySelector('#post-dialog [data-send-phone]').click()`); await wait(200);
  await check(await evaluate(`JSON.stringify(__calls.find(c=>c.action==='send-to-phone'))`) === JSON.stringify({ action: 'send-to-phone', postId: 'm1' }), 'Send to my phone asks the server');
  await evaluate(`document.querySelector('#post-dialog').close()`);

  // Shared from the phone (where the browser has a cache to test with).
  const shared = await evaluate(`(async()=>{if(!('caches' in window))return 'skip';const cache=await caches.open('signaldesk-share');await cache.put('/shared/0',new Response(new Blob(['png'],{type:'image/png'}),{headers:{'content-type':'image/png','x-name':encodeURIComponent('Fall kit.png')}}));await cache.put('/shared/meta',new Response(JSON.stringify({count:1,text:'Look at this',at:Date.now()})));window.__added=[];addMediaFiles=async files=>{__added.push(...[...files].map(f=>f.name));};document.querySelector('#post-copy').value='';history.replaceState(null,'',location.pathname+'?shared=1#composer');await takeSharedItems();return JSON.stringify({files:__added,text:document.querySelector('#post-copy').value,url:location.search,left:(await caches.keys()).includes('signaldesk-share')});})()`).catch(() => 'skip');
  if (shared !== 'skip' && !/scheme 'file' is unsupported/.test(JSON.stringify(shared))) await check(shared === JSON.stringify({ files: ['Fall kit.png'], text: 'Look at this', url: '', left: false }), 'shared files and words start a post: ' + shared);
  const manifest = JSON.parse(fs.readFileSync(new URL('../../manifest.webmanifest', import.meta.url), 'utf8'));
  await check(manifest.share_target?.action === '/share-target' && manifest.share_target.params.files[0].accept.includes('video/*'), 'the app can receive shares');
};
