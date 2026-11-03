// Everyday workflows: several files at once and reordering, bulk approvals, copying a week,
// cropping a photo for one network, Analytics extras, and client report highlights.
export default async ({ send, evaluate, wait, log, sampleData }) => {
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(3000);
  await sampleData();
  const fail = (message) => log.push('[exception] ' + message);
  await evaluate(`document.querySelector('#auth-dialog')?.open&&document.querySelector('#auth-dialog').close();(()=>{
    const at=(days,hour)=>{const d=new Date();d.setDate(d.getDate()+days);d.setHours(hour,0,0,0);return d.toISOString();};
    const post=(id,status,days,title)=>({id,clientId:'pk-works',title,text:title,status,scheduledFor:at(days,10),createdBy:'u',media:[],mediaAlt:{},platformContent:{},options:{},jobs:[{id:id+'j',platform:'facebook',provider:'direct',status:status==='pending_approval'?'held':'queued',runAt:at(days,10)}]});
    cloudFeaturesAvailable=()=>true;activeUser={id:'u',email:'owner@pkworks.co'};activeWorkspace={id:'w',name:'PK Works'};currentRole='admin';
    serverPosts=[post('11111111-0000-4000-8000-000000000001','pending_approval',2,'Held one'),post('11111111-0000-4000-8000-000000000002','pending_approval',3,'Held two'),post('11111111-0000-4000-8000-000000000003','pending_approval',4,'Held three'),post('11111111-0000-4000-8000-000000000004','scheduled',1,'Week post')];
    window.__calls=[];callSocialApi=async(body)=>{__calls.push(body);if(body.action==='posts')return{posts:serverPosts};if(['approve','reject','reschedule-post'].includes(body.action))return{ok:true};if(body.action==='copy-posts')return{created:body.postIds.map(id=>({id:id+'c',from:id})),skipped:[]};throw new Error('offline in this test');};
    window.__up=0;uploadToStorage=async(file,prefix)=>{__up++;window.__lastUpload=file;return{path:'u/'+__up,url:'https://media.test/'+prefix+'-'+__up+(file.type.startsWith('video/')?'.mp4':'.jpg'),name:file.name,type:file.type};};
    scheduleDraftSave=()=>{};
  })()`);

  // Several photos at once, then reorder and remove.
  await evaluate(`showView('composer')`); await wait(400);
  await evaluate(`void addMediaFiles([new File(['a'],'one.jpg',{type:'image/jpeg'}),new File(['b'],'two.jpg',{type:'image/jpeg'}),new File(['c'],'three.jpg',{type:'image/jpeg'})])`); await wait(600);
  const tray = () => evaluate(`JSON.stringify({names:uploadedMedia.map(m=>m.name),thumbs:document.querySelectorAll('#media-tray .tray-item:not(.uploading)').length,label:document.querySelector('#upload-zone b').textContent})`);
  let state = JSON.parse(await tray());
  log.push('tray: ' + JSON.stringify(state));
  if (state.names.join() !== 'one.jpg,two.jpg,three.jpg' || state.thumbs !== 3 || !/3 attached/.test(state.label)) fail('three photos should be attached in order');
  await evaluate(`(()=>{const items=document.querySelectorAll('#media-tray .tray-item');const dt=new DataTransfer();items[2].dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));const box=items[0].getBoundingClientRect();items[0].dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:box.left+2,clientY:box.top+5}));items[0].dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:box.left+2,clientY:box.top+5}));items[2].dispatchEvent(new DragEvent('dragend',{bubbles:true}));})()`); await wait(200);
  state = JSON.parse(await tray());
  if (state.names.join() !== 'three.jpg,one.jpg,two.jpg') fail('dragging the third photo to the front should reorder: ' + state.names);
  await evaluate(`document.querySelector('[data-tray-remove="1"]').click()`); await wait(200);
  state = JSON.parse(await tray());
  if (state.names.join() !== 'three.jpg,two.jpg') fail('removing should drop one photo: ' + state.names);
  // Dropping files from the computer onto the composer adds them too.
  await evaluate(`(()=>{const dt=new DataTransfer();dt.items.add(new File(['d'],'four.jpg',{type:'image/jpeg'}));const zone=document.querySelector('#upload-zone');zone.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt}));zone.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));})()`); await wait(500);
  state = JSON.parse(await tray());
  log.push('after drop: ' + state.names.join(', '));
  if (state.names.join() !== 'three.jpg,two.jpg,four.jpg') fail('a dropped photo should be added at the end');

  // A tall photo: Instagram gets a warning and a one-click crop that gives it its own copy.
  await evaluate(`(()=>{uploadedMedia=[{path:'',url:'https://media.test/tall.jpg',name:'tall.jpg',type:'image/jpeg'}];mediaInfo.set('https://media.test/tall.jpg',{width:600,height:1200});document.querySelector('.account-select').innerHTML=['facebook','instagram'].map(p=>'<label><input type="checkbox" value="'+p+'" checked>'+p+'</label>').join('');document.querySelector('#post-copy').value='Tall photo';updatePreview();})()`); await wait(300);
  const shape = await evaluate(`document.querySelector('#format-alert')?.innerText||''`);
  log.push('shape alert: ' + shape.replace(/\s+/g, ' '));
  if (!/taller than 4:5/.test(shape) || !/Crop for Instagram/.test(shape) || /Facebook:/.test(shape)) fail('a tall photo should get an Instagram crop offer only');
  await evaluate(`(()=>{const c=document.createElement('canvas');c.width=600;c.height=1200;c.getContext('2d').fillRect(0,0,600,1200);window.__tall=c.toDataURL('image/jpeg');const realFetch=window.fetch;window.fetch=(url,...rest)=>String(url)==='https://media.test/tall.jpg'?realFetch(__tall):realFetch(url,...rest);})()`);
  await evaluate(`document.querySelector('[data-crop-fix]').click()`); await wait(900);
  const cropShape = await evaluate(`document.querySelector('#crop-dialog').open?document.querySelector('#crop-shape').value:'closed'`);
  if (cropShape !== '4:5') fail('the crop should open at 4:5, got ' + cropShape);
  await evaluate(`document.querySelector('#crop-use').click()`); await wait(900);
  const cropped = JSON.parse(await evaluate(`JSON.stringify({ig:platformOverrides.instagram?.media?.map(m=>m.url),shared:uploadedMedia.map(m=>m.url),type:__lastUpload?.type})`));
  log.push('cropped: ' + JSON.stringify(cropped));
  if (!cropped.ig?.[0]?.startsWith('https://media.test/media-') || cropped.shared[0] !== 'https://media.test/tall.jpg' || cropped.type !== 'image/jpeg') fail('Instagram should get its own cropped photo and the others keep the original');
  await evaluate(`delete platformOverrides.instagram;uploadedMedia=[];updatePreview()`);

  // Bulk approvals.
  await evaluate(`showView('approvals');renderApprovals()`); await wait(300);
  const bar = await evaluate(`document.querySelector('#approval-bulk')?.innerText||''`);
  if (!/Select all/.test(bar) || (await evaluate(`document.querySelectorAll('.bulk-check').length`)) !== 3) fail('Approvals should offer select all and a box per post');
  await evaluate(`(()=>{const all=document.querySelector('#bulk-all');all.checked=true;all.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(200);
  await evaluate(`document.querySelector('[data-bulk="approve"]').click()`); await wait(300);
  const undoText = await evaluate(`document.querySelector('#undo-bar')?.hidden?'':document.querySelector('#undo-bar .undo-text')?.textContent`);
  if (!/3 posts approved/.test(undoText) || (await evaluate(`__calls.filter(c=>c.action==='approve').length`)) !== 0) fail('bulk approve should wait with an Undo bar before sending: ' + undoText);
  await evaluate(`flushUndo()`); await wait(600);
  const approved = await evaluate(`__calls.filter(c=>c.action==='approve').map(c=>c.postId.slice(-1)).sort().join(',')`);
  log.push('bulk approved: ' + approved);
  if (approved !== '1,2,3') fail('approving all should approve each post');
  await evaluate(`serverPosts.slice(0,3).forEach(p=>{p.status='pending_approval';});renderApprovals()`); await wait(100);
  // Canceling a post waits too, and Undo brings it back without sending anything.
  await evaluate(`openPostDialog('11111111-0000-4000-8000-000000000004')`); await wait(300);
  await evaluate(`document.querySelector('.post-dialog-x').click()`); await wait(200);
  if (await evaluate(`document.querySelector('#post-dialog').open`)) fail('the × should close the post dialog');
  await evaluate(`openPostDialog('11111111-0000-4000-8000-000000000004')`); await wait(300);
  await evaluate(`document.querySelector('[data-cancel-post]')?.click()`); await wait(200);
  const hidden = await evaluate(`!serverPosts.some(p=>p.id.endsWith('04'))`);
  await evaluate(`undoNow()`); await wait(100);
  const back = await evaluate(`serverPosts.some(p=>p.id.endsWith('04'))&&!__calls.some(c=>c.action==='cancel-post')`);
  if (!hidden || !back) fail('cancel should hide the post, and Undo should bring it back without canceling');
  await evaluate(`(()=>{const boxes=document.querySelectorAll('.bulk-check');[0,1].forEach(i=>{boxes[i].checked=true;boxes[i].dispatchEvent(new Event('change',{bubbles:true}));});const d=new Date();d.setDate(d.getDate()+10);document.querySelector('#bulk-date').value=localIsoDate(d);document.querySelector('[data-bulk="move"]').click();})()`); await wait(600);
  const moved = JSON.parse(await evaluate(`JSON.stringify(__calls.filter(c=>c.action==='reschedule-post').map(c=>new Date(c.scheduleDate).getHours()+':'+new Date(c.scheduleDate).getDate()))`));
  log.push('moved: ' + moved.join(' '));
  if (moved.length !== 2 || !moved.every((item) => item.startsWith('10:'))) fail('moving should keep each post’s time');

  // Copy the week.
  await evaluate(`showView('calendar');calView='week';calCursor=startOfDay(new Date());renderCalendar()`); await wait(400);
  const copyLabel = await evaluate(`document.querySelector('#copy-week')?.textContent||''`);
  if (!/Copy week/.test(copyLabel)) fail('week view should have a Copy week button');
  await evaluate(`document.querySelector('#copy-week').click()`); await wait(300);
  const listed = await evaluate(`document.querySelectorAll('#copy-week-dialog input[name=copy-post]').length`);
  await evaluate(`document.querySelector('#copy-week-form').requestSubmit()`); await wait(600);
  const copied = JSON.parse(await evaluate(`JSON.stringify(__calls.filter(c=>c.action==='copy-posts').map(c=>({n:c.postIds.length,days:c.offsetDays})))`));
  log.push(`copy week: ${listed} listed, sent ${JSON.stringify(copied)}`);
  if (!listed || copied[0]?.n !== listed || copied[0]?.days !== 7) fail('copying should send every listed post one week later');

  // Analytics: previous-period line, big changes, the heat map, and a post's comparison.
  const chart = await evaluate(`(()=>{const daily=Array.from({length:30},(_,i)=>({day:new Date(Date.now()-(29-i)*864e5).toISOString().slice(0,10),engagements:i,previous:i%3}));const box=document.createElement('div');box.innerHTML=performanceHtml({measured:5,daily,byPlatform:{facebook:10}});return JSON.stringify({earlier:!!box.querySelector('.chart-earlier'),legend:box.querySelector('.chart-legend')?.textContent,tip:box.querySelector('.chart-hit').dataset.tip,ticks:[...box.querySelectorAll('.chart-y span')].map(s=>s.textContent).join(' ')});})()`);
  log.push('chart: ' + chart);
  const c = JSON.parse(chart);
  if (!c.earlier || !/Previous 30 days/.test(c.legend) || !/previous period: 0/.test(c.tip) || c.ticks !== '32 24 16 8 0') fail('the chart should show the previous period with round steps');
  const change = await evaluate(`periodChangeHtml(5000,500,'30 days')+' | '+periodChangeHtml(120,100,'30 days')`);
  if (!/up from 500/.test(change) || !/20%/.test(change)) fail('big jumps should read as “up from”: ' + change);
  const heat = await evaluate(`(()=>{const posts=Array.from({length:20},(_,i)=>{const d=new Date();d.setDate(d.getDate()-i);d.setHours(i%2?9:19,0,0,0);return{id:'h'+i,clientId:'pk-works',platform:'instagram',publishedAt:d.toISOString(),metrics:{engagements:i%2?10:50}};});const data=bestTimesData(posts);return data.counted+' '+data.best.map(b=>HEATMAP_BLOCKS[b.block][1]).join('/');})()`);
  log.push('heat map: ' + heat);
  if (!/^20 6–9 PM/.test(heat)) fail('evenings should rank best in the heat map data');
  // A post's details show how its numbers grew day by day.
  const growth = await evaluate(`(async()=>{const base=callSocialApi;callSocialApi=async b=>b.action==='post-metrics-history'?{publishedAt:new Date(Date.now()-3*864e5).toISOString(),days:[0,1,2,3].map(i=>({day:localIsoDate(new Date(Date.now()-(3-i)*864e5)),metrics:{engagements:[10,40,55,60][i],views:[100,300,420,450][i]}}))}:base(b);analyticsPosts=[{id:'22222222-0000-4000-8000-000000000001',clientId:'pk-works',platform:'instagram',text:'Growth post',publishedAt:new Date(Date.now()-3*864e5).toISOString(),metrics:{engagements:60,views:450}}];openNetworkPost('22222222-0000-4000-8000-000000000001');await new Promise(r=>setTimeout(r,400));const box=document.querySelector('#network-post-growth');const before=box.querySelector('.option-hint')?.textContent;box.querySelector('[data-growth-metric="views"]')?.click();return JSON.stringify({before,after:box.querySelector('.option-hint')?.textContent,tips:box.querySelectorAll('.chart-hit').length,labels:box.querySelector('.chart-x')?.textContent});})()`);
  log.push('growth: ' + growth);
  const g = JSON.parse(growth);
  if (!/10 → 60 engagements over 4 days, \+5 since the day before/.test(g.before) || !/100 → 450 views/.test(g.after) || g.tips !== 4 || !/Day 1Day 4/.test(g.labels)) fail('a post should show how it grew');
  await evaluate(`document.querySelector('#network-post-dialog')?.close()`);
  // Saved drafts (signed out, so they're kept in this browser): save, clear, open again, delete with Undo.
  const drafts = await evaluate(`(async()=>{const cloud=cloudFeaturesAvailable;await savedDraftsLoading?.catch(()=>{});cloudFeaturesAvailable=()=>false;try{localStorage.removeItem('signaldesk.savedDrafts')}catch{}savedDrafts=null;showView('composer');document.querySelector('#post-copy').value='Holiday hours post\\nOpen 9 to 5';uploadedMedia=[];updatePreview();await saveCurrentDraft();document.querySelector('#post-copy').value='Something else';activeSavedDraftId=null;await saveCurrentDraft();document.querySelector('#clear-draft').click();await openDraftsDialog();const titles=[...document.querySelectorAll('#drafts-list b')].map(b=>b.textContent);document.querySelector('[data-open-draft="'+savedDrafts.find(d=>d.title==='Holiday hours post').id+'"]').click();const copy=document.querySelector('#post-copy').value;flushUndo();await openDraftsDialog();document.querySelector('[data-delete-draft]').click();const afterDelete=savedDrafts.length;undoNow();const restored=savedDrafts.length;document.querySelector('#drafts-dialog').close();cloudFeaturesAvailable=cloud;return JSON.stringify({titles,copy,afterDelete,restored,menu:document.querySelector('#open-drafts')?.textContent});})()`);
  log.push('drafts: ' + drafts);
  const d = JSON.parse(drafts);
  if (d.titles.join('|') !== 'Something else|Holiday hours post' || d.copy !== 'Holiday hours post\nOpen 9 to 5' || d.afterDelete !== 1 || d.restored !== 2 || d.menu !== 'Saved drafts (2)') fail('saved drafts should save, open, delete, and undo');
  // Upcoming posts beside the draft: follows the client, can show everyone, notes the chosen date, and opens a post.
  const upcoming = JSON.parse(await evaluate(`(async()=>{
    const when=(days,hour)=>{const d=new Date();d.setDate(d.getDate()+days);d.setHours(hour,0,0,0);return d.toISOString();};
    const other=clients.find(c=>c.id!=='pk-works'),make=(id,clientId,status,days,hour,title)=>({id,clientId,title,text:title,status,scheduledFor:when(days,hour),createdBy:'u',media:[],mediaAlt:{},platformContent:{},options:{},jobs:[{id:id+'j',platform:'facebook',provider:'direct',status:'queued',runAt:when(days,hour)}]});
    try{localStorage.removeItem('signaldesk-studio-upcoming')}catch{}
    serverPosts=[make('22222222-0000-4000-8000-000000000001','pk-works','scheduled',3,10,'Later <post>'),make('22222222-0000-4000-8000-000000000002','pk-works','pending_approval',2,9,'Sooner post'),make('22222222-0000-4000-8000-000000000003','pk-works','published',-1,9,'Old post'),make('22222222-0000-4000-8000-000000000004','pk-works','canceled',4,9,'Canceled post'),make('22222222-0000-4000-8000-000000000005',other.id,'scheduled',2,11,'Other client post')];
    serverPostsLoadedAt=Date.now();window.__fresh=fetchServerPosts;fetchServerPosts=async()=>{};
    showView('composer');const select=document.querySelector('#client-select');select.value=clients.find(c=>c.id==='pk-works').name;select.dispatchEvent(new Event('change',{bubbles:true}));
    const titles=()=>[...document.querySelectorAll('.studio-upcoming-row b')].map(el=>el.textContent);
    const date=document.querySelector('#schedule-date'),iso=localIsoDate(new Date(when(2,12))),free=localIsoDate(new Date(when(5,12)));
    const panel=document.querySelector('#studio-upcoming'),result={hidden:panel.hidden,mine:titles(),count:document.querySelector('#studio-upcoming-count').textContent,tag:document.querySelector('.studio-upcoming-row .status')?.textContent};
    date.value=iso;date.dispatchEvent(new Event('change',{bubbles:true}));result.day=document.querySelector('#studio-upcoming-day').textContent;result.chosen=document.querySelector('.studio-upcoming-heading.chosen')?.nextElementSibling?.querySelector('b')?.textContent;
    date.value=free;date.dispatchEvent(new Event('change',{bubbles:true}));result.freeDay=document.querySelector('#studio-upcoming-day').textContent;
    const scope=document.querySelector('#studio-upcoming-scope');scope.value='all';scope.dispatchEvent(new Event('change',{bubbles:true}));result.all=titles();
    result.remembered=JSON.parse(localStorage.getItem('signaldesk-studio-upcoming')).all;
    scope.value='client';scope.dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelector('.studio-upcoming-row').click();await new Promise(r=>setTimeout(r,100));result.opened=openPostId;const dialog=document.querySelector('#post-dialog');result.dialog=dialog.open;dialog.close();
    fetchServerPosts=window.__fresh;return JSON.stringify(result);
  })()`));
  log.push('studio upcoming: ' + JSON.stringify(upcoming));
  if (upcoming.hidden || upcoming.mine.join('|') !== 'Sooner post|Later <post>' || upcoming.count !== '2 coming up' || upcoming.tag !== 'In Review') fail('Studio upcoming should list this client\'s waiting posts, soonest first');
  if (!/^1 post already on /.test(upcoming.day) || upcoming.chosen !== 'Sooner post' || !/^Nothing else on /.test(upcoming.freeDay)) fail('Studio upcoming should say what is on the chosen date');
  if (upcoming.all.join('|') !== 'Sooner post|Other client post|Later <post>' || upcoming.remembered !== true) fail('Studio upcoming should show and remember all clients');
  if (upcoming.opened !== '22222222-0000-4000-8000-000000000002' || !upcoming.dialog) fail('Selecting an upcoming post should open it');
  // The logo goes back to the Command Center.
  const logo = await evaluate(`(()=>{showView('composer');const away=document.querySelector('#view-composer').classList.contains('active');document.querySelector('.sidebar .brand').click();return away&&document.querySelector('#view-overview').classList.contains('active');})()`);
  if (logo !== true) fail('The logo should open the Command Center');
};
