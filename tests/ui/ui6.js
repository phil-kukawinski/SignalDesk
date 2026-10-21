window.addEventListener('error',e=>{document.body.setAttribute('data-err',(document.body.getAttribute('data-err')||'')+' | '+e.message+' @ '+(e.error&&e.error.stack||'').split('\n').slice(0,2).join(' <- '));});
window.addEventListener('load',()=>setTimeout(async()=>{const log=[];const L=(k,v)=>log.push(k+'='+v);const wait=ms=>new Promise(r=>setTimeout(r,ms));const SHOT=location.hash.slice(1);try{
 const calls=[];const at=(days,hour,min=0)=>{const d=new Date();d.setDate(d.getDate()+days);d.setHours(hour,min,0,0);return d.toISOString();};
 // Keep the week stable: put fixtures on days inside the current week where possible.
 const today=new Date();const dow=today.getDay();const later=dow<=4?1:0; // a day after today still in this week (or today)
 const posts=[
  {id:'p-sched',clientId:'pk-works',title:'Fall kits are here',status:'scheduled',source:'composer',scheduledFor:at(later,14),createdBy:'me',parentId:null,text:'Fall kits are here!',media:['https://sb.test/storage/v1/object/public/social-media/me/kit.jpg'],platformContent:{instagram:{text:'IG copy'}},options:{instagramOptions:{collaborators:['friend']},followUpComments:[{comment:'Still time',delayMinutes:60}],linkedin:{visibility:'connections'}},jobs:[{id:'j1',platform:'facebook',provider:'direct',status:'queued',attempts:0,runAt:at(later,14)},{id:'j2',platform:'instagram',provider:'direct',status:'queued',attempts:0,runAt:at(later,14)}]},
  {id:'p-fail',clientId:'revere-rum',title:'Meet the makers',status:'partial',source:'composer',scheduledFor:at(-1,10),createdBy:'other',parentId:null,text:'x',media:[],platformContent:{},options:{},jobs:[{id:'j3',platform:'facebook',provider:'direct',status:'published',runAt:at(-1,10)},{id:'j4',platform:'linkedin',provider:'direct',status:'failed',runAt:at(-1,10),error:'Token expired'}]},
  {id:'p-pend',clientId:'bright-school-kits',title:'Classroom setup tips',status:'pending_approval',source:'composer',scheduledFor:at(2,9,30),createdBy:'other',parentId:null,text:'Tips',media:[],platformContent:{},options:{},jobs:[{id:'j6',platform:'linkedin',provider:'direct',status:'held',runAt:at(2,9,30)}]},
  {id:'p-pub',clientId:'pk-works',title:'Already out',status:'published',source:'composer',scheduledFor:at(-2,9),createdBy:'me',parentId:null,text:'x',media:[],platformContent:{},options:{},jobs:[{id:'j7',platform:'facebook',provider:'direct',status:'published',runAt:at(-2,9)}]}
 ];
 const daily=Array.from({length:30},(_,i)=>{const d=new Date();d.setDate(d.getDate()-29+i);return{day:localIsoDate(d),engagements:i%5===0?120:i*3};});
 const summary={engagement:{total:2840,previous:2000,measured:18,daily,byPlatform:{instagram:1700,facebook:900,linkedin:240}},connections:{active:3,reauth:[{platform:'linkedin',clientId:'revere-rum'}],platforms:['facebook','instagram','pinterest'],clients:2},worker:{lastRun:new Date(Date.now()-3*3600000).toISOString(),stale:true}};
 const accounts=[{platform:'facebook',linked:true,provider:'direct',status:'active',directAvailable:true},{platform:'instagram',linked:true,provider:'direct',status:'active',directAvailable:true},{platform:'linkedin',linked:true,provider:'direct',status:'active',directAvailable:true}];
 cloudFeaturesAvailable=()=>true;activeUser={id:'me',email:'me@x.com'};
 callSocialApi=async payload=>{calls.push(payload);if(payload.action==='posts')return{posts};if(payload.action==='overview')return summary;if(payload.action==='autopilot')return{feeds:[],items:[],comments:[]};if(payload.action==='best-times')return{points:[],weeks:0};if(payload.action==='members')return{members:[],invites:[]};if(payload.action==='accounts')return{accounts,integrations:{meta:true,linkedin:true,pinterest:true,ayrshare:false}};if(payload.action==='update-post')return{status:'scheduled',post:{id:'p-new',scheduledFor:at(later,15)},replaced:payload.postId};return{ok:true};};
 // A personal draft in progress before editing
 document.querySelector('#post-copy').value='My unfinished draft';
 renderWorkspace();await wait(150);
 const stats=[...document.querySelectorAll('.stats-grid .stat-card')].map(c=>c.querySelector('.stat-top span').textContent+':'+c.querySelector('.stat-number').textContent+':'+c.querySelector('.stat-foot').textContent.trim());
 L('stats',stats.join(' | '));
 L('bars',[...document.querySelectorAll('.mini-bars i')].length+' spark:'+!!document.querySelector('.sparkline path'));
 L('attention',[...document.querySelectorAll('.approval-panel .approval-item')].map(i=>i.className.replace('approval-item ','')+':'+i.querySelector('b').textContent).join(' | ')+' badge:'+document.querySelector('.approval-panel .count-badge').textContent);
 L('navCounts','overview:'+document.querySelector('.nav-item[data-view="overview"] .nav-count').textContent+' inboxHidden:'+document.querySelector('.nav-item[data-view="inbox"] .nav-count').hidden);
 L('performance',document.querySelectorAll('.chart svg path').length+' ranks:'+[...document.querySelectorAll('.rank-row b')].map(b=>b.textContent).join(',')+' x:'+document.querySelectorAll('.chart-x span').length+' range:'+document.querySelector('.performance-range')?.textContent);
 L('upcoming',[...document.querySelectorAll('#upcoming-list .post-row')].map(r=>r.dataset.openPost).join(','));
 const uc=document.querySelector('#upcoming-client');uc.value='PK Works';uc.dispatchEvent(new Event('change'));L('upcomingFiltered',[...document.querySelectorAll('#upcoming-list .post-row')].map(r=>r.dataset.openPost).join(','));
 const ch=document.querySelector('#upcoming-channel');L('channelOptions',[...ch.options].map(o=>o.value||'all').join(','));uc.value='Revere Rum';uc.dispatchEvent(new Event('change'));L('noMatch',document.querySelector('#upcoming-list').textContent.trim());uc.value='';uc.dispatchEvent(new Event('change'));
 if(SHOT==='overview'){document.body.setAttribute('data-log',log.join(' || '));return;}
 document.querySelector('.approval-panel .approval-item[data-view="social-accounts"]').click();await wait(30);L('reauthClick',document.querySelector('.page.active').id);
 // Drag p-sched on the week timeline to another day at 3:15 PM
 posts[0].scheduledFor=at(4,14);posts[0].jobs.forEach(j=>j.runAt=posts[0].scheduledFor);serverPosts=JSON.parse(JSON.stringify(posts));
 showView('calendar');calCursor=startOfDay(new Date(posts[0].scheduledFor));timelineKey=null;renderCalendar();await wait(150);
 const ev=document.querySelector('.timeline-event[data-open-post="p-sched"]');L('draggable',ev?.dataset.draggable+' pend:'+document.querySelector('[data-open-post="p-pend"]')?.dataset.draggable+' fail:'+document.querySelector('[data-open-post="p-fail"]')?.dataset.draggable);
 const cols=[...document.querySelectorAll('.timeline-col')];const fromIdx=cols.indexOf(ev.closest('.timeline-col'));const target=cols[fromIdx===6?fromIdx-1:fromIdx+1];
 const scroll=document.querySelector('#timeline-scroll');scroll.scrollTop=12*HOUR_HEIGHT;await wait(20);
 const r0=ev.getBoundingClientRect(),tr=target.getBoundingClientRect();const startX=r0.left+10,startY=r0.top+8;const endY=tr.top+(15.25*HOUR_HEIGHT)+8,endX=tr.left+20;
 const fire=(type,x,y,el=document.elementFromPoint(x,y))=>el.dispatchEvent(new PointerEvent(type,{bubbles:true,clientX:x,clientY:y,button:0,pointerId:1,pointerType:'mouse'}));
 fire('pointerdown',startX,startY,ev);fire('pointermove',startX+10,startY+10);fire('pointermove',(startX+endX)/2,(startY+endY)/2);fire('pointermove',endX,endY);
 L('dragGhost',ev.classList.contains('dragging')+' label:'+ev.querySelector('b').textContent+' inTarget:'+(ev.parentElement===target));
 fire('pointerup',endX,endY);ev.dispatchEvent(new MouseEvent('click',{bubbles:true}));await wait(60);
 const move=calls.filter(c=>c.action==='reschedule-post').pop();const moved=new Date(move?.scheduleDate);
 L('dragMove',move?.postId+' '+localIsoDate(moved)+'='+target.dataset.date+' '+moved.getHours()+':'+moved.getMinutes()+' dialogOpened:'+document.querySelector('#post-dialog').open);
 // Edit in Studio
 posts[0].scheduledFor=at(later+1,14);posts[0].jobs.forEach(j=>j.runAt=posts[0].scheduledFor);serverPosts=JSON.parse(JSON.stringify(posts));renderCalendar();
 openPostDialog('p-sched');await wait(20);
 L('editButtons','sched:'+!!document.querySelector('[data-edit-post]'));
 document.querySelector('#post-dialog').close();openPostDialog('p-pub');await wait(20);L('pubEditable',!!document.querySelector('[data-edit-post]'));document.querySelector('#post-dialog').close();
 openPostDialog('p-sched');await wait(20);document.querySelector('[data-edit-post]').click();await wait(150);
 L('editing',document.querySelector('.page.active').id+' banner:'+!document.querySelector('#editing-banner').hidden+' text:'+document.querySelector('#editing-text').textContent.slice(0,40)+' copy:'+document.querySelector('#post-copy').value+' btn:'+document.querySelector('#schedule-post').textContent+' draftHidden:'+document.querySelector('#save-draft').hidden);
 L('editingChecks',[...document.querySelectorAll('.account-select input:checked')].map(i=>i.value).join(',')+' collab:'+document.querySelector('#ig-collaborators').value+' followups:'+postOptions.followUps.length+' media:'+uploadedMedia.map(m=>m.path).join(','));
 L('draftKept',collectDraftState().draft);
 if(SHOT==='editing'){document.body.setAttribute('data-log',log.join(' || '));return;}
 document.querySelector('#post-copy').value='Edited copy';document.querySelector('#post-copy').dispatchEvent(new Event('input'));
 await publishSocialPost(false);await wait(60);
 const upd=calls.filter(c=>c.action==='update-post').pop();L('updatePayload',upd.postId+' text:'+upd.text+' platforms:'+upd.platforms.join(',')+' collab:'+JSON.stringify(upd.options.collaborators)+' variantIG:'+upd.platformContent.instagram?.text);
 L('afterSave',document.querySelector('.page.active').id+' banner:'+document.querySelector('#editing-banner').hidden+' copy:'+document.querySelector('#post-copy').value+' btn:'+document.querySelector('#schedule-post').textContent+' toast:'+document.querySelector('#toast').textContent);
 // Cancel editing restores the draft too
 openPostDialog('p-sched');await wait(20);document.querySelector('[data-edit-post]').click();await wait(80);document.querySelector('#cancel-edit').click();
 L('afterCancel',document.querySelector('#post-copy').value+' banner:'+document.querySelector('#editing-banner').hidden);
}catch(e){L('ERR',e.message+' '+(e.stack||'').split('\n')[1]);}document.body.setAttribute('data-log',log.join(' || '));},300));
