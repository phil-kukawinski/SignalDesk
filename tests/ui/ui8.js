window.addEventListener('error',e=>{document.body.setAttribute('data-err',(document.body.getAttribute('data-err')||'')+' | '+e.message+' @ '+(e.error&&e.error.stack||'').split('\n').slice(0,2).join(' <- '));});
window.addEventListener('load',()=>setTimeout(async()=>{const log=[];const L=(k,v)=>log.push(k+'='+String(v).replace(/\n/g,' '));const wait=ms=>new Promise(r=>setTimeout(r,ms));const vis=el=>!!(el&&el.offsetParent!==null);const SHOT=location.hash.slice(1);try{
 const calls=[];const at=(days,hour,min=0)=>{const d=new Date();d.setDate(d.getDate()+days);d.setHours(hour,min,0,0);return d.toISOString();};
 const IMG='https://sb.test/storage/v1/object/public/social-media/me/kit.jpg';
 const tomorrow=at(1,0).slice(0,10);
 const posts=[
  {id:'p1',clientId:'pk-works',title:'Fall kits',status:'scheduled',source:'composer',scheduledFor:at(1,10),createdBy:'me',parentId:null,text:'Fall kits are here',media:[IMG],mediaAlt:{[IMG]:'A kit'},platformContent:{},options:{},campaign:'Fall',jobs:[{id:'j1',platform:'facebook',provider:'direct',status:'queued',runAt:at(1,10)},{id:'jm',platform:'tiktok',provider:'manual',status:'queued',runAt:at(1,10)}]},
  ...[11,12,13,14].map(h=>({id:'busy'+h,clientId:'revere-rum',title:'Busy '+h,status:'scheduled',source:'composer',scheduledFor:at(2,h),createdBy:'me',parentId:null,text:'x',media:[],platformContent:{},options:{},jobs:[{id:'jb'+h,platform:'facebook',provider:'direct',status:'queued',runAt:at(2,h)}]})),
  {id:'p2',clientId:'pk-works',title:'Story time',status:'publishing',source:'composer',scheduledFor:at(0,8),createdBy:'me',parentId:null,text:'Story copy',media:[],platformContent:{},options:{},jobs:[{id:'j2',platform:'instagram_story',provider:'manual',status:'manual_due',runAt:at(0,8)}]}
 ];
 cloudFeaturesAvailable=()=>true;activeUser={id:'me',email:'me@x.com'};
 clients.find(c=>c.id==='pk-works').goals={postsPerWeek:4,engagementRate:3};
 const accounts=[{platform:'facebook',linked:true,provider:'direct',status:'active'},{platform:'instagram',linked:true,provider:'direct',status:'active'}];
 callSocialApi=async payload=>{calls.push(payload);switch(payload.action){case 'posts':return{posts};case 'overview':return{engagement:{total:100,previous:80,measured:3,daily:[],byPlatform:{facebook:100}},clients:{'pk-works':{posts:3,engagementRate:2.4}},connections:{active:2,reauth:[],platforms:['facebook'],clients:1},worker:{lastRun:new Date().toISOString(),stale:false}};case 'autopilot':return{feeds:[],items:[],comments:[]};case 'best-times':return{points:[],weeks:0};case 'members':return{members:[],invites:[]};case 'accounts':return{accounts,integrations:{meta:true,linkedin:false,pinterest:false,ayrshare:false}};case 'draft-captions':return{variants:[{platform:'facebook',text:'FB draft'},{platform:'instagram',text:'IG draft #kits'}]};case 'alt-text':return{altText:'Suggested description'};case 'publish':return{status:'scheduled',post:{id:'n',scheduledFor:at(1,9)},queuedComments:0};case 'post-history':return{history:[{id:1,action:'created',actor:'me@x.com',at:at(-1,9),detail:{}},{id:2,action:'edited',actor:'me@x.com',at:at(0,7),detail:{previous:{text:'Old copy v1',media:[],platformContent:{},networks:['facebook'],options:{},campaign:'Fall'}}},{id:3,action:'rescheduled',actor:'me@x.com',at:at(0,7),detail:{from:at(1,9),to:at(1,10)}}]};case 'post-notes':return{notes:[]};case 'save-bio':return{slug:payload.slug,enabled:payload.enabled};case 'export':return{posts:[{scheduled_for:at(1,10),client_id:'pk-works',title:'Fall, "kits"',status:'scheduled',publish_jobs:[{platform:'facebook'}],content:{text:'a,b'}}]};default:return{ok:true};}};
 renderWorkspace();applyRole();await wait(150);
 // Goals and alerts
 L('goals',[...document.querySelectorAll('.goal-row')].map(r=>r.querySelector('b').textContent+':'+[...r.querySelectorAll('small')].map(s=>s.textContent).join('/')).join(' | ')+' visible:'+vis(document.querySelector('#goals-panel')));
 L('alerts',[...document.querySelectorAll('.approval-panel .approval-item b')].map(b=>b.textContent).join(' | '));
 showView('calendar');await wait(80);calCursor=startOfDay(new Date(at(2,9)));timelineKey=null;renderCalendar();
 L('busyDay',[...document.querySelectorAll('.timeline-day-head .overload')].map(o=>o.closest('.timeline-day-head').dataset.openDay+':'+o.textContent).join(','));
 L('manualChannel',serverCalendarPosts().find(p=>p.serverId==='p1').channel);
 if(SHOT==='overview'){showView('overview');await wait(60);document.body.setAttribute('data-log',log.join(' || '));return;}
 // Post dialog: manual reminder, history, duplicate
 openPostDialog('p2');await wait(60);
 L('manualRow',document.querySelector('.job-row').textContent.replace(/\s+/g,' ').trim().slice(0,80)+' buttons:'+[...document.querySelectorAll('.job-row button')].map(b=>b.textContent).join('/'));
 window.prompt=()=>'https://instagram.com/stories/x';document.querySelector('[data-manual-done]').click();await wait(40);L('manualDone',JSON.stringify(calls.filter(c=>c.action==='manual-done').pop()));
 openPostDialog('p1');await wait(60);document.querySelector('.post-history-section').open=true;
 L('history',[...document.querySelectorAll('.history-row b')].map(b=>b.textContent).join(',')+' restore:'+document.querySelectorAll('[data-restore-version]').length);
 if(SHOT==='dialog'){document.body.setAttribute('data-log',log.join(' || '));return;}
 document.querySelector('[data-restore-version]').click();await wait(120);
 L('restored',document.querySelector('.page.active').id+' copy:'+document.querySelector('#post-copy').value+' editing:'+!document.querySelector('#editing-banner').hidden);
 document.querySelector('#cancel-edit').click();
 document.querySelector('#post-copy').value='My own draft';
 openPostDialog('p1');await wait(40);document.querySelector('[data-duplicate-post]').click();await wait(20);L('dupConfirm',document.querySelector('#confirm-dialog')?.open+' '+document.querySelector('#confirm-title')?.textContent);
 document.querySelector('#confirm-dialog [value=yes]').click();await wait(500);
 L('duplicated',document.querySelector('.page.active').id+' copy:'+document.querySelector('#post-copy').value+' date:'+document.querySelector('#schedule-date').value+' manual:'+selectedManual().join(',')+' alt:'+uploadedMedia[0]?.alt+' checked:'+[...document.querySelectorAll('.account-select input:checked')].map(i=>i.value).join(','));
 // Alt text editor
 L('altEditor',vis(document.querySelector('#alt-editor'))+' value:'+document.querySelector('[data-alt-index]')?.value);
 document.querySelector('[data-suggest-alt="0"]').click();await wait(40);L('altSuggested',document.querySelector('[data-alt-index="0"]').value+' stored:'+uploadedMedia[0].alt);
 // Manual reminders and post now
 const manualBox=document.querySelector('#manual-select');L('manualOptions',manualBox.querySelectorAll('input').length+' checked:'+selectedManual().join(','));
 document.querySelectorAll('.account-select input').forEach(i=>i.checked=false);document.querySelector('.account-select').dispatchEvent(new Event('change',{bubbles:true}));
 await publishSocialPost(false,false,true);await wait(20);
 const pub=calls.filter(c=>c.action==='publish').pop();L('postNow','platforms:'+JSON.stringify(pub.platforms)+' manual:'+JSON.stringify(pub.manual)+' date:'+pub.scheduleDate+' alt:'+JSON.stringify(pub.mediaAlt));
 // Monthly repeat
 document.querySelectorAll('.account-select input').forEach(i=>i.checked=i.value==='facebook');document.querySelector('.account-select').dispatchEvent(new Event('change',{bubbles:true}));
 const rs=document.querySelector('#reshare-enabled');rs.checked=true;rs.dispatchEvent(new Event('change',{bubbles:true}));const every=document.querySelector('#reshare-every');every.value='month';every.dispatchEvent(new Event('change',{bubbles:true}));
 L('repeat',document.querySelector('#reshare-summary').textContent+' daysHidden:'+document.querySelector('#reshare-days-field').hidden+' max:'+document.querySelector('#reshare-repeat').max+' payload:'+JSON.stringify(buildPostOptionsPayload(selectedPlatforms()).autoRepost));
 every.value='custom';every.dispatchEvent(new Event('change',{bubbles:true}));L('customDays',document.querySelector('#reshare-days-field').hidden+' '+JSON.stringify(buildPostOptionsPayload(selectedPlatforms()).autoRepost));rs.checked=false;rs.dispatchEvent(new Event('change',{bubbles:true}));
 // AI drafts
 document.querySelector('#ai-draft-button').click();await wait(20);document.querySelector('#caption-idea').value='Fall kits launch';document.querySelector('#caption-generate').click();await wait(60);
 L('aiDrafts',[...document.querySelectorAll('.caption-variant b')].map(b=>b.textContent).join(',')+' payload:'+JSON.stringify(calls.filter(c=>c.action==='draft-captions').pop().platforms));
 if(SHOT==='ai'){document.body.setAttribute('data-log',log.join(' || '));return;}
 document.querySelector('[data-use-shared="0"]').click();L('aiShared',document.querySelector('#post-copy').value);
 document.querySelector('[data-use-variant="1"]').click();L('aiNotSelected',document.querySelector('#toast').textContent);
 document.querySelector('#caption-close').click();
 // Image prep
 const canvas=document.createElement('canvas');canvas.width=3000;canvas.height=2000;const ctx=canvas.getContext('2d');ctx.fillStyle='#c00';ctx.fillRect(0,0,3000,2000);const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',0.9));const file=new File([blob],'big.jpg',{type:'image/jpeg'});
 document.querySelectorAll('.account-select input').forEach(i=>i.checked=i.value==='instagram');document.querySelector('.account-select').dispatchEvent(new Event('change',{bubbles:true}));
 const prepared=prepareImage(file);await wait(150);L('cropOpen',document.querySelector('#crop-dialog').open+' shape:'+document.querySelector('#crop-shape').value+' size:'+document.querySelector('#crop-size').textContent);
 if(SHOT==='crop'){document.body.setAttribute('data-log',log.join(' || '));return;}
 document.querySelector('#crop-use').click();const out=await prepared;const img=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=URL.createObjectURL(out);});L('cropped',out.name+' '+img.naturalWidth+'x'+img.naturalHeight+' type:'+out.type);
 const gif=new File([new Uint8Array([71,73,70])],'a.gif',{type:'image/gif'});L('gifPassthrough',(await prepareImage(gif))===gif);
 // CSV import
 document.querySelector('#csv-open').click();await wait(20);
 const csv=`date,time,client,networks,text,media_url,campaign\n${tomorrow},9:30,PK Works,Facebook;LinkedIn,"Hello, ""world""",,Fall\n${tomorrow},10:00,Nobody,Facebook,Hi,,\n2020-01-01,10:00,PK Works,Instagram,Old,,\n`;
 window.addEventListener('unhandledrejection',e=>L('rejection',e.reason?.message));try{const rows=parseCsv(csv);L('csvParse',rows.length+' header:'+rows[0].join('|'));L('csvValidate',rows.slice(1).map(validateCsvRow).map(r=>r.status+':'+r.errors.join('/')).join(' | '));}catch(e){L('csvErr',e.message);}
 const dt=new DataTransfer();dt.items.add(new File([csv],'posts.csv',{type:'text/csv'}));const input=document.querySelector('#csv-file');input.files=dt.files;input.dispatchEvent(new Event('change'));await wait(400);
 L('csvRows',csvRows.map(r=>r.status+(r.errors.length?'('+r.errors.join('/')+')':'')).join(' | ')+' button:'+document.querySelector('#csv-schedule').textContent);
 if(SHOT==='csv'){document.body.setAttribute('data-log',log.join(' || '));return;}
 document.querySelector('#csv-schedule').click();await wait(80);const csvPub=calls.filter(c=>c.action==='publish').pop();L('csvPublish',csvPub.text+' | '+csvPub.platforms.join(',')+' | '+csvPub.campaign+' | hour:'+new Date(csvPub.scheduleDate).getHours()+':'+new Date(csvPub.scheduleDate).getMinutes()+' msg:'+document.querySelector('#csv-message').textContent);
 document.querySelector('#csv-close').click();
 // Search
 document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}));await wait(20);const si=document.querySelector('#search-input');si.value='fall';si.dispatchEvent(new Event('input'));
 L('search',document.querySelector('#search-dialog').open+' '+[...document.querySelectorAll('#search-results li')].map(li=>li.querySelector('.search-kind')?.textContent+':'+li.querySelector('b')?.textContent).join(','));
 if(SHOT==='search'){document.body.setAttribute('data-log',log.join(' || '));return;}
 const postIndex=searchResults.findIndex(r=>r.kind==='Post');for(let i=0;i<postIndex;i++)si.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));si.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await wait(40);
 L('searchOpen',document.querySelector('#post-dialog').open+' '+document.querySelector('#post-dialog h2')?.textContent);document.querySelector('#post-dialog').close();
 // Link in bio
 showView('clients');await wait(30);document.querySelector('[data-bio-editor="pk-works"]').click();await wait(20);
 L('bioOpen',document.querySelector('#bio-slug').value+' url:'+document.querySelector('#bio-url').value.replace(location.origin,''));
 document.querySelector('[data-bio-label]').value='Shop';document.querySelector('[data-bio-url]').value='pkworks.com';document.querySelector('#bio-form').requestSubmit();await wait(20);L('bioBadLink',document.querySelector('#bio-message').textContent);
 document.querySelector('[data-bio-url]').value='https://pkworks.com/shop';document.querySelector('#bio-add-link').click();document.querySelectorAll('[data-bio-label]')[1].value='Blog';document.querySelectorAll('[data-bio-url]')[1].value='https://pkworks.com/blog';document.querySelector('#bio-form').requestSubmit();await wait(40);
 L('bioSaved',JSON.stringify(calls.filter(c=>c.action==='save-bio').pop())+' links:'+clients.find(c=>c.id==='pk-works').bio.links.map(l=>l.label).join(','));
 // Brand kit goals
 document.querySelector('[data-brand-kit="pk-works"]').click();await wait(20);L('goalFields',document.querySelector('#goal-posts').value+'/'+document.querySelector('#goal-rate').value);document.querySelector('#goal-per-day').value='2';document.querySelector('#report-enabled').checked=true;document.querySelector('#report-emails').value='dana@client.com';document.querySelector('#report-day').value='15';document.querySelector('#brand-form').requestSubmit();await wait(20);
 const pk=clients.find(c=>c.id==='pk-works');L('goalsSaved',JSON.stringify(pk.goals)+' '+JSON.stringify(pk.reports));
 // Calendar print
 showView('calendar');await wait(40);const origOpen=window.open;let printed='';window.open=()=>({document:{write:html=>{printed+=html;},close(){}}});document.querySelector('#print-calendar').click();window.open=origOpen;L('print',printed.includes('Content calendar')+' rows:'+(printed.match(/class="row"/g)||[]).length);
 // Theme
 showView('settings');const theme=document.querySelector('#theme-select');theme.value='dark';theme.dispatchEvent(new Event('change'));L('theme',document.documentElement.dataset.theme+' bg:'+getComputedStyle(document.body).backgroundColor);
 if(SHOT==='dark'){showView('overview');await wait(60);document.body.setAttribute('data-log',log.join(' || '));return;}
 if(SHOT==='darkcal'){showView('calendar');await wait(80);document.body.setAttribute('data-log',log.join(' || '));return;}
 theme.value='system';theme.dispatchEvent(new Event('change'));
 // Export
 const created=[];const origCreate=URL.createObjectURL;URL.createObjectURL=b=>{created.push(b);return origCreate(b);};document.querySelector('#export-data').click();await wait(80);URL.createObjectURL=origCreate;
 const csvText=await created[1]?.text();L('export',created.length+' csv:'+csvText?.split('\n')[1]);
 // Push controls without a service worker
 await renderPushControls();L('push',document.querySelector('#push-toggle').hidden+' '+document.querySelector('#push-note').textContent.slice(0,50));
}catch(e){L('ERR',e.message+' '+(e.stack||'').split('\n')[1]);}document.body.setAttribute('data-log',log.join(' || '));},300));
