window.addEventListener('error',e=>{document.body.setAttribute('data-err',(document.body.getAttribute('data-err')||'')+' | '+e.message+' @ '+(e.error&&e.error.stack||'').split('\n').slice(0,3).join(' <- '));});
window.addEventListener('load',()=>setTimeout(async()=>{const log=[];const L=(k,v)=>log.push(k+'='+v);const vis=el=>!!(el&&el.offsetParent!==null);const wait=ms=>new Promise(r=>setTimeout(r,ms));try{
 const calls=[];const at=(days,hour,min=0)=>{const d=new Date();d.setDate(d.getDate()+days);d.setHours(hour,min,0,0);return d.toISOString();};
 const SHOT=location.hash.slice(1);
 const posts=[
  {id:'p-sched',clientId:'pk-works',title:'Fall kits are here',status:'scheduled',source:'composer',scheduledFor:at(0,14),createdBy:'me',parentId:null,text:'Fall kits are here! https://pkworks.com',media:['https://cdn.example.com/kit.jpg'],platformContent:{instagram:{text:'IG copy'}},options:{},jobs:[{id:'j1',platform:'facebook',provider:'direct',status:'queued',attempts:0,runAt:at(0,14)},{id:'j2',platform:'instagram',provider:'direct',status:'queued',attempts:0,runAt:at(0,14)}]},
  {id:'p-fail',clientId:'revere-rum',title:'Meet the makers',status:'partial',source:'composer',scheduledFor:at(-1,10),createdBy:'other',parentId:null,text:'Meet the makers',media:[],platformContent:{},options:{},jobs:[{id:'j3',platform:'facebook',provider:'direct',status:'published',attempts:1,runAt:at(-1,10),url:'https://facebook.com/1',publishedAt:at(-1,10,1)},{id:'j4',platform:'linkedin',provider:'direct',status:'failed',attempts:1,runAt:at(-1,10),error:'The LinkedIn sign-in expired. Reconnect the account.'},{id:'j5',platform:'pinterest',provider:'direct',status:'unknown',attempts:1,runAt:at(-1,10)}]},
  {id:'p-pend',clientId:'bright-school-kits',title:'Classroom setup tips',status:'pending_approval',source:'composer',scheduledFor:at(1,9,30),createdBy:'other',parentId:null,text:'Five tips',media:[],platformContent:{},options:{},jobs:[{id:'j6',platform:'linkedin',provider:'direct',status:'held',attempts:0,runAt:at(1,9,30)}]},
  {id:'p-auto',clientId:'pk-works',title:'New blog article',status:'scheduled',source:'autopilot',scheduledFor:at(2,13),createdBy:null,parentId:null,text:'Article',media:[],platformContent:{},options:{},jobs:[{id:'j7',platform:'facebook',provider:'direct',status:'queued',attempts:0,runAt:at(2,13)}]}
 ];
 const accounts=[{platform:'facebook',linked:true,provider:'direct',status:'active',directAvailable:true,displayName:'PK Works Page'},{platform:'instagram',linked:true,provider:'direct',status:'active',directAvailable:true,displayName:'pkworks'},{platform:'linkedin',linked:false,provider:'direct',status:'needs_reauth',directAvailable:true,error:'The LinkedIn sign-in expired.'},{platform:'pinterest',linked:true,provider:'direct',status:'active',directAvailable:true,displayName:'pkworks',boards:[{id:'b1',name:'Ideas'},{id:'b2',name:'Kits'}],boardId:'b2',expiresAt:new Date(Date.now()+5*86400000).toISOString()},{platform:'tiktok',linked:false,provider:null,directAvailable:false,ayrshareAvailable:false}];
 cloudFeaturesAvailable=()=>true;activeUser={id:'me',email:'me@x.com'};
 callSocialApi=async payload=>{calls.push(payload);if(payload.action==='posts')return{posts};if(payload.action==='autopilot')return{feeds:[],items:[],comments:[]};if(payload.action==='best-times')return{points:[],weeks:0};if(payload.action==='members')return{members:[],invites:[]};if(payload.action==='accounts')return{accounts,integrations:{meta:true,linkedin:true,pinterest:true,ayrshare:false}};if(payload.action==='publish')return{status:'scheduled',post:{id:'new',scheduledFor:at(3,10),reposts:1},queuedComments:2};if(payload.action==='oauth-finish')return{connected:payload.selections.map(s=>s.key.split(':')[0])};return{ok:true,late:false};};
 renderWorkspace();
 showView('calendar');await wait(80);
 L('weekEvents',[...document.querySelectorAll('.timeline-event[data-open-post]')].map(e=>e.dataset.openPost+(e.classList.contains('is-failed')?'!':'')).sort().join(','));
 L('sampleHidden',![...document.querySelectorAll('.timeline-event')].some(e=>!e.dataset.openPost&&!e.classList.contains('event-autopilot')));
 L('autopilotBolt',document.querySelector('[data-open-post="p-auto"] b')?.textContent.includes('⚡'));
 const st=document.querySelector('#calendar-status');st.value='Failed';st.dispatchEvent(new Event('change'));L('failedFilter',[...document.querySelectorAll('.timeline-event[data-open-post]')].map(e=>e.dataset.openPost).join(','));st.value='';st.dispatchEvent(new Event('change'));
 document.querySelector('[data-open-post="p-fail"]').click();await wait(20);
 L('dialogOpen',document.querySelector('#post-dialog').open+' title:'+document.querySelector('#post-dialog h2').textContent+' status:'+document.querySelector('.post-dialog-head .status').textContent);
 L('jobRows',[...document.querySelectorAll('.job-row')].map(r=>r.className.replace('job-row ','')+':'+r.querySelector('small').textContent).join(' | '));
 L('jobButtons',[...document.querySelectorAll('[data-retry-job]')].map(b=>b.dataset.retryJob+'/'+(b.dataset.confirmed||'')+'/'+b.textContent).join(' | '));
 L('viewLink',document.querySelector('.job-row.published a')?.href);
 L('noMoveForPartial',!document.querySelector('[data-reschedule-post]'));
 if(SHOT==='dialog'){document.body.setAttribute('data-log',log.join(' || '));return;}
 document.querySelector('[data-retry-job="j5"]').click();await wait(20);
 L('retryPayload',JSON.stringify(calls.filter(c=>c.action==='retry-job').pop()));
 document.querySelector('[data-close-post]').click();
 document.querySelector('[data-open-post="p-sched"]').click();await wait(20);
 L('schedDialog','move:'+!!document.querySelector('[data-reschedule-post]')+' cancel:'+document.querySelector('[data-cancel-post]')?.textContent+' custom:'+document.querySelector('#post-dialog .option-hint')?.textContent+' media:'+document.querySelectorAll('.post-dialog-media img').length);
 document.querySelector('[data-cancel-post]').click();await wait(10);L('cancelArmed',document.querySelector('[data-cancel-post]').textContent);
 document.querySelector('[data-cancel-post]').click();await wait(20);L('cancelPayload',JSON.stringify(calls.filter(c=>c.action==='cancel-post').pop())+' closed:'+!document.querySelector('#post-dialog').open);
 document.querySelector('[data-open-post="p-sched"]').click();await wait(20);
 const input=document.querySelector('#post-dialog-time');input.value=input.value.replace(/T\d\d/,'T16');document.querySelector('[data-reschedule-post]').click();await wait(20);
 const move=calls.filter(c=>c.action==='reschedule-post').pop();L('reschedule',move.postId+' hour:'+new Date(move.scheduleDate).getHours());
 document.querySelector('#post-dialog').close();
 // Command Center
 showView('overview');await wait(20);
 L('upcoming',[...document.querySelectorAll('#upcoming-list .post-row')].map(r=>(r.dataset.openPost||'sample')+':'+r.querySelector('.status').textContent).join(','));
 // Approvals
 showView('approvals');await wait(40);
 L('approvals',[...document.querySelectorAll('#approval-table .approval-table-row')].map(r=>r.querySelector('b').textContent+' / '+r.querySelector('.submitted-by').textContent).join(',')+' nav:'+document.querySelector('.nav-item[data-view="approvals"] .nav-count').textContent);
 document.querySelector('#approval-table [data-approve="0"]').click();await wait(30);
 L('approvePayload',JSON.stringify(calls.filter(c=>c.action==='approve').pop()));
 // Social accounts
 showView('social-accounts');await wait(60);
 L('accountCards',[...document.querySelectorAll('.social-account-card')].map(c=>c.querySelector('b').textContent+':'+c.querySelector('.social-account-state').textContent+':'+[...c.querySelectorAll('.social-account-buttons button')].map(b=>b.textContent).join('+')).join(' | '));
 L('pinDetail',[...document.querySelectorAll('.social-account-card')].find(c=>c.querySelector('b').textContent==='Pinterest').querySelector('small').textContent);
 L('ayrshareHidden',document.querySelector('#connect-social-accounts').hidden+' note:'+document.querySelector('.integration-note').textContent.slice(0,60));
 if(SHOT==='accounts'){document.body.setAttribute('data-log',log.join(' || '));return;}
 openConnectChooser('sess-1',{clientId:'pk-works',candidates:[{key:'facebook:page1',platform:'facebook',displayName:'PK Works Page'},{key:'instagram:ig1',platform:'instagram',displayName:'pkworks',note:'Linked to the PK Works Page'},{key:'facebook:page2',platform:'facebook',displayName:'Other Page'},{key:'pinterest:pk',platform:'pinterest',displayName:'pkworks',boards:[{id:'b1',name:'Ideas'},{id:'b2',name:'Kits'}]}]});
 L('chooser',[...document.querySelectorAll('#connect-options fieldset')].map(f=>f.querySelector('legend').textContent+':'+f.querySelectorAll('input').length).join(','));
 if(SHOT==='chooser'){document.body.setAttribute('data-log',log.join(' || '));return;}
 document.querySelector('#connect-options input[value="facebook:page2"]').checked=true;document.querySelector('#connect-options input[name="pick-instagram"][value=""]').checked=true;document.querySelector('[data-board-for="pinterest:pk"]').value='b1';
 document.querySelector('#connect-form').requestSubmit();await wait(40);
 L('finishPayload',JSON.stringify(calls.filter(c=>c.action==='oauth-finish').pop())+' closed:'+!document.querySelector('#connect-dialog').open);
 // Composer: Pinterest options and publishing
 socialAccountCache.set('pk-works',accounts);
 showView('composer');await wait(60);
 const box=document.querySelector('.account-select');
 L('composerAccounts',[...box.querySelectorAll('input')].map(i=>i.value).join(','));
 box.querySelectorAll('input').forEach(i=>{i.checked=['facebook','pinterest'].includes(i.value);});box.dispatchEvent(new Event('change',{bubbles:true}));
 const pin=document.querySelector('#pinterest-options');pin.open=true;
 L('pinOptions','visible:'+vis(pin)+' boards:'+[...document.querySelectorAll('#pin-board option')].map(o=>o.textContent).join('/'));
 const set=(sel,val,ev='input')=>{const el=document.querySelector(sel);el.value=val;el.dispatchEvent(new Event(ev,{bubbles:true}));};
 set('#pin-title','Fall kits');set('#pin-board','b1','change');set('#pin-link','pkworks.com');
 L('badLink',buildPostOptionsPayload(selectedPlatforms())===null);
 set('#pin-link','https://pkworks.com/fall');
 L('pinPayload',JSON.stringify(buildPostOptionsPayload(selectedPlatforms()).pinterest)+' summary:'+document.querySelector('#pinterest-summary').textContent);
 set('#post-copy','Fall kits are here!');const d=new Date(Date.now()+3*86400000);document.querySelector('#schedule-date').value=localIsoDate(d);document.querySelector('#schedule-time').value='10:00';
 const toastEl=document.querySelector('#toast');await publishSocialPost(false);await wait(30);
 const pub=calls.filter(c=>c.action==='publish').pop();L('publish',pub.platforms.join(',')+' pin:'+JSON.stringify(pub.options.pinterest)+' toast:'+toastEl.textContent);
 L('savedPostsUnchanged',savedPosts.filter(p=>p.status==='Scheduled').length);
 // Personal mode
 showView('settings');const pm=document.querySelector('#personal-mode');pm.checked=true;pm.dispatchEvent(new Event('change',{bubbles:true}));
 L('personal','inboxHidden:'+document.querySelector('.nav-item[data-view="inbox"]').hidden+' team:'+document.querySelector('#team-panel').hidden+' nav:'+document.querySelector('.nav-item[data-view="approvals"]').textContent.replace(/\s+/g,' ').trim()+' saved:'+collectSettings().personalMode);
 pm.checked=false;pm.dispatchEvent(new Event('change',{bubbles:true}));
 L('personalOff','inboxHidden:'+document.querySelector('.nav-item[data-view="inbox"]').hidden+' nav:'+document.querySelector('.nav-item[data-view="approvals"]').textContent.replace(/\s+/g,' ').trim());
 if(SHOT==='calendar'){showView('calendar');await wait(80);}
}catch(e){L('ERR',e.message+' '+e.stack.split('\n')[1]);}document.body.setAttribute('data-log',log.join(' || '));},300));
