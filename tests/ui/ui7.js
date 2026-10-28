window.addEventListener('error',e=>{document.body.setAttribute('data-err',(document.body.getAttribute('data-err')||'')+' | '+e.message+' @ '+(e.error&&e.error.stack||'').split('\n').slice(0,2).join(' <- '));});
window.addEventListener('load',()=>setTimeout(async()=>{const log=[];const L=(k,v)=>log.push(k+'='+v);const wait=ms=>new Promise(r=>setTimeout(r,ms));const vis=el=>!!(el&&el.offsetParent!==null);const SHOT=location.hash.slice(1);try{
 const calls=[];const at=(days,hour,min=0)=>{const d=new Date();d.setDate(d.getDate()+days);d.setHours(hour,min,0,0);return d.toISOString();};
 const IMG='https://sb.test/storage/v1/object/public/social-media/me/kit.jpg';
 const posts=[
  {id:'p1',clientId:'pk-works',title:'Fall kits',status:'scheduled',source:'composer',scheduledFor:at(2,10),createdBy:'me',parentId:null,text:'Fall kits!',media:[IMG],platformContent:{},options:{utm:true},campaign:'Fall Launch',evergreen:true,clientStatus:'approved',jobs:[{id:'j1',platform:'instagram',provider:'direct',status:'queued',runAt:at(2,10)}]},
  {id:'p2',clientId:'pk-works',title:'Launch day',status:'published',source:'composer',scheduledFor:at(-3,9),createdBy:'me',parentId:null,text:'Launch',media:[IMG],platformContent:{},options:{},campaign:'Fall Launch',jobs:[{id:'j2',platform:'instagram',provider:'direct',status:'published',runAt:at(-3,9),publishedAt:at(-3,9),url:'https://instagram.com/p/1'},{id:'j3',platform:'facebook',provider:'direct',status:'published',runAt:at(-3,9),publishedAt:at(-3,9)}]},
  {id:'p3',clientId:'revere-rum',title:'Makers',status:'pending_approval',source:'composer',scheduledFor:at(3,15),createdBy:'other',parentId:null,text:'Makers',media:[],platformContent:{},options:{},campaign:'',clientStatus:'changes_requested',jobs:[{id:'j4',platform:'linkedin',provider:'direct',status:'held',runAt:at(3,15)}]}
 ];
 cloudFeaturesAvailable=()=>true;activeUser={id:'me',email:'me@x.com'};
 const accounts=[{platform:'facebook',linked:true,provider:'direct',status:'active'},{platform:'instagram',linked:true,provider:'direct',status:'active'}];
 callSocialApi=async payload=>{calls.push(payload);switch(payload.action){case 'posts':return{posts};case 'overview':return{engagement:{total:0,previous:0,measured:0,daily:[],byPlatform:{}},connections:{active:2,reauth:[],platforms:['facebook'],clients:1},worker:{lastRun:new Date().toISOString(),stale:false}};case 'autopilot':return{feeds:[],items:[],comments:[]};case 'best-times':return{points:[],weeks:0};case 'members':return{members:[],invites:[]};case 'accounts':return{accounts,integrations:{meta:true,linkedin:true,pinterest:true,ayrshare:false}};case 'next-slot':return{slot:at(1,9)};case 'publish':return{status:'scheduled',post:{id:'n1',scheduledFor:at(1,9)},queuedComments:0};case 'post-notes':return{notes:[{id:'n',postId:payload.postId,author:'Dana',kind:'client',body:'Looks great',decision:'approved',at:new Date().toISOString()},{id:'m',postId:payload.postId,author:'me@x.com',kind:'team',body:'Check price',at:new Date().toISOString()}]};case 'add-note':return{note:{}};case 'job-comments':return{comments:[{id:'c1',author:'@fan',text:'Love it <b>',at:new Date().toISOString(),replies:[{id:'c2',author:'@pkworks',text:'Thanks'}]}]};case 'reply-comment':return{reply:{id:'r'}};case 'review-links':return{links:[{id:'l1',label:'Dana',created_at:new Date().toISOString(),expires_at:at(20,0),last_used_at:null}]};case 'create-review-link':return{link:{id:'l2'},token:'tok_'+'x'.repeat(40)};case 'client-report':return{report:{postCount:2,totals:{views:1200,reach:900,engagements:80,engagementRate:8.89,likes:60,comments:10,shares:5,clicks:5},rows:[{platform:'instagram',text:'Launch',publishedAt:at(-3,9),metrics:{views:1000,engagements:70},url:'https://instagram.com/p/1'},{platform:'facebook',text:'Launch',publishedAt:at(-3,9),metrics:{views:200,engagements:10}}],errors:[]},scheduled:1};default:return{ok:true};}};
 renderWorkspace();applyRole();await wait(150);
 // Brand kit
 showView('clients');await wait(30);
 L('clientButtons',document.querySelectorAll('[data-brand-kit]').length+'/'+document.querySelectorAll('[data-review-links]').length);
 document.querySelector('[data-brand-kit="pk-works"]').click();await wait(20);
 const set=(sel,val,ev='input')=>{const el=document.querySelector(sel);el.value=val;el.dispatchEvent(new Event(ev,{bubbles:true}));};
 set('#brand-voice','Warm and practical');set('#brand-hashtags','#pkworks');set('#brand-banned','cheap, guarantee');set('#brand-watch','PK Works');set('#brand-queue-times','15:30, 9:00');
 document.querySelector('#brand-queue-days input[value="1"]').checked=true;document.querySelector('#brand-queue-days input[value="3"]').checked=true;document.querySelector('#brand-utm').checked=true;
 if(SHOT==='brand'){document.body.setAttribute('data-log',log.join(' || '));return;}
 document.querySelector('#brand-form').requestSubmit();await wait(20);L('badTime',document.querySelector('#brand-message').textContent+' open:'+document.querySelector('#brand-dialog').open);
 set('#brand-queue-times','15:30, 09:00');document.querySelector('#brand-form').requestSubmit();await wait(20);
 const pk=clients.find(c=>c.id==='pk-works');L('brandSaved',JSON.stringify(pk.brand.requiredHashtags)+' '+JSON.stringify(pk.queue)+' swatches:'+document.querySelectorAll('.brand-swatches i').length);
 // Review links
 document.querySelector('[data-review-links="pk-works"]').click();await wait(40);
 L('reviewList',document.querySelector('#review-links').textContent.replace(/\s+/g,' ').trim().slice(0,60));
 document.querySelector('#review-create').click();await wait(40);L('reviewUrl',document.querySelector('#review-url').value.replace(/^.*\//,'')+' shown:'+!document.querySelector('#review-new-link').hidden);
 if(SHOT==='review'){document.body.setAttribute('data-log',log.join(' || '));return;}
 document.querySelector('#review-close').click();
 // Composer: brand check, templates, campaign, queue
 showView('composer');await wait(80);
 L('utmDefault',document.querySelector('#post-utm').checked+' queueVisible:'+vis(document.querySelector('#queue-post'))+' hint:'+document.querySelector('#queue-hint').textContent);
 const box=document.querySelector('.account-select');box.querySelectorAll('input').forEach(i=>i.checked=true);box.dispatchEvent(new Event('change',{bubbles:true}));
 set('#post-copy','Our cheap kits are here {x}');await wait(20);
 const brandItem=[...document.querySelectorAll('#checklist .check-item')].find(i=>i.querySelector('.check-title').textContent.startsWith('On brand'));
 L('onBrand',brandItem.className.replace('check-item ','')+':'+brandItem.querySelector('.check-title').textContent+' | '+[...brandItem.querySelectorAll('li')].map(li=>li.textContent).join(' / '));
 set('#post-copy','');document.querySelector('#templates-button').click();await wait(10);L('menuEmpty',document.querySelector('#composer-menu').textContent.includes('No templates yet'));
 window.prompt=()=>'Weekly tip';set('#post-copy','Tip for {client} on {date}: plan ahead #pkworks');document.querySelector('#templates-button').click();document.querySelector('[data-save-item="client"]').click();
 set('#post-copy','');document.querySelector('#templates-button').click();await wait(10);document.querySelector('#composer-menu [data-insert]').click();
 L('templateInserted',document.querySelector('#post-copy').value+' saved:'+templates.length+' client:'+templates[0].clientId);
 const ed=document.querySelector('#post-copy');ed.setSelectionRange(0,3);window.prompt=()=>'Tip prefix';document.querySelector('#snippets-button').click();document.querySelector('[data-save-item="all"]').click();
 L('snippet',JSON.stringify(snippets.map(s=>[s.name,s.text,s.clientId])));
 document.querySelector('#templates-button').click();document.querySelector('[data-delete-item]').click();L('templateDeleted',templates[0].deleted+' listed:'+libraryItems(templates).length);document.querySelector('#composer-menu').hidden=true;
 const brandAfter=[...document.querySelectorAll('#checklist .check-item')].find(i=>i.querySelector('.check-title').textContent.startsWith('On brand'));L('onBrandOk',brandAfter.className.replace('check-item ',''));
 set('#post-campaign','Fall Launch');document.querySelector('#post-evergreen').click();
 L('campaignOptions',[...document.querySelectorAll('#campaign-list option')].map(o=>o.value).join(','));
 const queued=publishSocialPost(false,true);await wait(30);L('askedFirst',document.querySelector('#confirm-dialog')?.open?document.querySelector('#confirm-title').textContent:'no');if(document.querySelector('#confirm-dialog')?.open)document.querySelector('#confirm-dialog button[value="yes"]').click();await queued;await wait(30);
 const pub=calls.filter(c=>c.action==='publish').pop();L('queuePublish','queue:'+pub.queue+' date:'+pub.scheduleDate+' campaign:'+pub.campaign+' evergreen:'+pub.evergreen+' utm:'+pub.options.utm);
 // AI proofread includes brand notes
 await runProofread();L('proofBrand',calls.filter(c=>c.action==='proofread').pop()?.brand?.replace(/\n/g,' | '));
 // Calendar: campaign filter, holidays, grid
 showView('calendar');await wait(80);
 L('campaignFilter',[...document.querySelectorAll('#calendar-campaign option')].map(o=>o.value||'all').join(',')+' hidden:'+document.querySelector('#calendar-campaign').hidden);
 calView='month';calCursor=new Date(2026,10,1);renderCalendar();await wait(20);
 L('holidaysNov',[...document.querySelectorAll('#calendar-grid .holiday')].map(h=>h.textContent).join(' | '));
 document.querySelector('#calendar-holidays').click();L('holidaysOff',document.querySelectorAll('#calendar-grid .holiday').length);document.querySelector('#calendar-holidays').click();
 calCursor=startOfDay(new Date());document.querySelector('[data-cal-view="grid"]').click();await wait(20);L('gridNoClient',document.querySelector('#calendar-gridview').textContent.trim().slice(0,40)+' prevHidden:'+document.querySelector('#prev-month').hidden+' label:'+document.querySelector('#calendar-month').textContent);
 const cs=document.querySelector('#calendar-client');cs.value='pk-works';cs.dispatchEvent(new Event('change'));await wait(20);
 L('grid',[...document.querySelectorAll('.ig-tile')].map(t=>t.dataset.openPost+(t.classList.contains('upcoming')?'(upcoming)':'')).join(','));
 if(SHOT==='grid'){document.body.setAttribute('data-log',log.join(' || '));return;}
 document.querySelector('[data-cal-view="week"]').click();cs.value='';cs.dispatchEvent(new Event('change'));
 // Post dialog: tags, notes, comments
 openPostDialog('p2');await wait(40);
 L('dialogTags',[...document.querySelectorAll('.post-dialog-tags span')].map(s=>s.textContent).join(',')+' notes:'+[...document.querySelectorAll('.post-note')].map(n=>n.className.replace('post-note ','')).join(',')+' commentsButtons:'+document.querySelectorAll('[data-job-comments]').length);
 if(SHOT==='dialog'){document.body.setAttribute('data-log',log.join(' || '));return;}
 document.querySelector('#post-note-input').value='Nice work';document.querySelector('#post-note-form').requestSubmit();await wait(30);L('notePayload',JSON.stringify(calls.filter(c=>c.action==='add-note').pop()));
 document.querySelector('[data-job-comments="j2"]').click();await wait(60);
 L('inbox',document.querySelector('.page.active').id+' panel:'+vis(document.querySelector('#post-comments-panel'))+' sampleHidden:'+document.querySelector('#view-inbox .inbox-panel').hidden+' posts:'+document.querySelectorAll('.comment-post').length+' comment:'+document.querySelector('.comment-item p')?.textContent+' reply:'+document.querySelector('.comment-reply b')?.textContent);
 const form=document.querySelector('.comment-reply-form');form.querySelector('input').value='Thank you!';form.requestSubmit();await wait(40);L('replyPayload',JSON.stringify(calls.filter(c=>c.action==='reply-comment').pop()));
 if(SHOT==='inbox'){document.body.setAttribute('data-log',log.join(' || '));return;}
 // Approvals show client verdicts
 showView('approvals');await wait(40);L('approvalVerdict',document.querySelector('.client-verdict')?.textContent);
 // Report HTML
 const html=reportHtml({client:pk,period:reportPeriod('last-month'),campaign:'Fall Launch',data:await callSocialApi({action:'client-report'})});
 L('report',['Posts published','Fall Launch','Save as PDF','By network','#336699'].map(t=>html.includes(t)?'y':'n').join('')+' color:'+html.includes(pk.brand.colors[0]));
 showView('analytics');await wait(30);L('reportControls',document.querySelectorAll('#report-client option').length+' campaigns:'+[...document.querySelectorAll('#report-campaign option')].map(o=>o.value||'all').join(','));
 // Library
 libraryAssets=[{id:'a1',name:'kit.jpg',url:IMG,path:'me/kit.jpg',type:'image/jpeg',clientId:'pk-works',tags:['fall'],uses:0},{id:'a2',name:'rum.mp4',url:IMG.replace('kit.jpg','rum.mp4'),path:'me/rum.mp4',type:'video/mp4',clientId:'revere-rum',tags:[],uses:0}];
 showView('library');await wait(30);L('library',document.querySelectorAll('.real-asset').length+' typeFilter:');const lt=document.querySelector('#library-type');lt.value='video/';lt.dispatchEvent(new Event('change'));L('videoOnly',[...document.querySelectorAll('.real-asset h3')].map(h=>h.textContent).join(','));lt.value='';lt.dispatchEvent(new Event('change'));
 set('#library-search','fall');L('tagSearch',[...document.querySelectorAll('.real-asset h3')].map(h=>h.textContent).join(','));set('#library-search','');
 uploadedMedia=[];document.querySelector('[data-use-asset="a1"]').click();await wait(30);L('useAsset',document.querySelector('.page.active').id+' media:'+uploadedMedia.map(m=>m.path).join(',')+' uses:'+libraryAssets[0].uses);
 // Shared state carries the new lists
 const shared=collectSharedState();L('shared',['templates','snippets','assets'].map(k=>k+':'+shared[k].length).join(' '));
 // Personal mode keeps the inbox
 showView('settings');const pm=document.querySelector('#personal-mode');pm.checked=true;pm.dispatchEvent(new Event('change',{bubbles:true}));L('personalInbox',!document.querySelector('.nav-item[data-view="inbox"]').hidden);pm.checked=false;pm.dispatchEvent(new Event('change',{bubbles:true}));
}catch(e){L('ERR',e.message+' '+(e.stack||'').split('\n')[1]);}document.body.setAttribute('data-log',log.join(' || '));},300));
