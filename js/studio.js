// Publishing Studio: the More menu next to Schedule, and suggested posting times.

// Admins schedule; "Send for approval" and "Post now" live in the More menu. People with User
// access can only submit for approval, so that becomes their main button.
function placeComposerActions(){
  const bar=$('#composer-actions'),menu=$('#more-actions-menu'),submit=$('#submit-review'),schedule=$('#schedule-post');
  if(!bar||!menu||!submit||!schedule)return;
  if(currentRole==='admin'){menu.prepend(submit);submit.className='menu-item';submit.setAttribute('role','menuitem');}
  else{bar.insertBefore(submit,schedule);submit.className='primary-button';submit.removeAttribute('role');}
  const visible=[...menu.children].some(item=>!item.hidden);
  $('.action-menu',bar).hidden=!visible;
}

function closeMoreActions(){const menu=$('#more-actions-menu');if(menu&&!menu.hidden){menu.hidden=true;$('#more-actions')?.setAttribute('aria-expanded','false');}}
$('#more-actions')?.addEventListener('click',event=>{event.stopPropagation();const menu=$('#more-actions-menu'),open=menu.hidden;menu.hidden=!open;event.currentTarget.setAttribute('aria-expanded',String(open));if(open)menu.querySelector('button:not([hidden])')?.focus();});
document.addEventListener('click',event=>{if(!event.target.closest('.action-menu'))closeMoreActions();else if(event.target.closest('.menu-item'))setTimeout(closeMoreActions,0);});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMoreActions();});

// Suggested times: the next few good slots, learned from this client's own posts on the networks
// picked (then all of its posts, then the workspace's), with common good times until there's enough history.
let studioTimes={key:'',loading:'',points:[],weeks:0};
async function loadStudioTimes(){const client=selectedClient('#client-select');if(!client||!cloudFeaturesAvailable()||currentRole!=='admin'||studioTimes.key===client.id||studioTimes.loading===client.id)return;studioTimes.loading=client.id;try{const data=await callSocialApi({action:'best-times',clientId:client.id});studioTimes={key:client.id,loading:'',points:data.points||[],weeks:data.weeks||0};}catch(error){console.error('Best times failed:',error);studioTimes={key:client.id,loading:'',points:[],weeks:0};}renderSuggestedTimes();}
function studioTimeSource(){
  const client=selectedClient('#client-select'),points=client&&studioTimes.key===client.id?studioTimes.points:[],networks=[...new Set(selectedPlatforms().map(platform=>platform==='instagram_story'?'instagram':platform))];
  const own=networks.length?points.filter(point=>networks.includes(point.platform)):[];
  let result=own.length?computeBestTimes(own):{enough:false};
  if(result.enough)return{windows:result.windows,kind:'network',sample:result.sample,networks:[...new Set(own.map(point=>point.platform))],client};
  result=computeBestTimes(points);
  if(result.enough)return{windows:result.windows,kind:'client',sample:result.sample,client};
  if(typeof bestTimes!=='undefined'&&bestTimes.enough)return{windows:bestTimes.windows,kind:'workspace',sample:bestTimes.sample};
  return{windows:STARTER_WINDOWS,kind:'starter'};
}
function suggestedSlots(count=3,windows=studioTimeSource().windows){
  const slots=[],soonest=Date.now()+30*60000;
  for(let offset=0;offset<8&&slots.length<count;offset++){
    const day=addDays(startOfDay(new Date()),offset);
    for(const band of (windows[day.getDay()]||[]).slice().sort((a,b)=>a.start-b.start)){
      const at=new Date(day);at.setHours(band.start,0,0,0);
      if(at.getTime()>=soonest&&slots.length<count)slots.push(at);
    }
  }
  return slots;
}
function renderSuggestedTimes(){
  const box=$('#suggested-times');if(!box)return;
  const source=studioTimeSource(),weeks=studioTimes.weeks?` over the last ${studioTimes.weeks} week${studioTimes.weeks===1?'':'s'}`:'';
  const names=list=>list.map(platformLabel).join(' & ');
  const label=source.kind==='network'?`Best for ${names(source.networks)}`:source.kind==='client'?`Best for ${source.client.name}`:source.kind==='workspace'?'Best times':'Suggested';
  const why=source.kind==='network'?`From ${source.sample} of ${possessive(source.client.name)} ${names(source.networks)} posts${weeks}, ranked by engagement rate`:source.kind==='client'?`From ${source.sample} of ${possessive(source.client.name)} posts${weeks}, ranked by engagement rate. Not enough posts on the networks picked yet to rank them on their own.`:source.kind==='workspace'?'Based on when this workspace’s posts have done best':'Common good times until there’s enough history to learn from';
  const at=(date)=>`${dayHeading(localIsoDate(date))} · ${date.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}`;
  const slots=suggestedSlots(3,source.windows);if(!slots.length){box.innerHTML='';return;}
  box.innerHTML=`<span class="suggested-label" title="${escapeHtml(why)}">${icon('sparkles')}${escapeHtml(label)}</span>${slots.map(date=>`<button type="button" class="time-chip" data-suggest-at="${date.toISOString()}">${escapeHtml(at(date))}</button>`).join('')}`;
}
$('#view-composer')?.addEventListener('change',event=>{if(event.target.id==='client-select')loadStudioTimes();if(event.target.id==='client-select'||event.target.closest('.account-select'))renderSuggestedTimes();});
$('#suggested-times')?.addEventListener('click',event=>{
  const chip=event.target.closest('[data-suggest-at]');if(!chip)return;
  const at=new Date(chip.dataset.suggestAt),date=$('#schedule-date'),time=$('#schedule-time');
  date.value=localIsoDate(at);time.value=`${String(at.getHours()).padStart(2,'0')}:${String(at.getMinutes()).padStart(2,'0')}`;
  [date,time].forEach(field=>{field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));});
  $$('#suggested-times .time-chip').forEach(item=>item.classList.toggle('active',item===chip));
});
placeComposerActions();renderSuggestedTimes();

// Upcoming posts beside the draft, so the schedule stays in view while writing: the client being
// written for, or every client. Picking a date also says what's already on that day.
const STUDIO_UPCOMING_KEY='signaldesk-studio-upcoming',STUDIO_UPCOMING_MAX=30,STUDIO_UPCOMING_DAYS=60;
function studioUpcomingPrefs(){try{return JSON.parse(localStorage.getItem(STUDIO_UPCOMING_KEY))||{};}catch{return{};}}
function saveStudioUpcomingPrefs(patch){try{localStorage.setItem(STUDIO_UPCOMING_KEY,JSON.stringify({...studioUpcomingPrefs(),...patch}));}catch{}}
function studioUpcomingPosts(client){
  const waiting=new Set(serverPosts.filter(post=>['pending_approval','scheduled','publishing'].includes(post.status)).map(post=>post.id)),now=Date.now();
  return serverCalendarPosts().filter(post=>waiting.has(post.serverId)&&(post.at>=now||post.status==='Publishing')&&(!client||post.client===client.name)).sort((a,b)=>a.at-b.at);
}
function studioUpcomingDayNote(posts,chosen){
  const days=Math.round((startOfDay(new Date(`${chosen}T12:00:00`))-startOfDay(new Date()))/86400000);
  if(!chosen||days<0||days>STUDIO_UPCOMING_DAYS)return '';
  const name=dayHeading(chosen),when=['Today','Tomorrow'].includes(name)?name.toLowerCase():`on ${name}`,count=posts.filter(post=>post.date===chosen&&post.serverId!==editingPost?.id).length;
  return count?`${count} post${count===1?'':'s'} already ${when}`:`Nothing else ${when}`;
}
function renderStudioUpcoming(){
  const panel=$('#studio-upcoming'),list=$('#studio-upcoming-list'),scope=$('#studio-upcoming-scope'),count=$('#studio-upcoming-count'),day=$('#studio-upcoming-day');if(!panel||!list||!scope)return;
  panel.hidden=!cloudFeaturesAvailable();if(panel.hidden)return;
  const client=selectedClient('#client-select'),name=client?.name||'';
  if(scope.dataset.client!==name||!scope.options.length){scope.dataset.client=name;scope.innerHTML=`${client?`<option value="client">${escapeHtml(name)}</option>`:''}<option value="all">All clients</option>`;}
  const everyone=!client||studioUpcomingPrefs().all===true;scope.value=everyone?'all':'client';
  if(!serverPostsLoadedAt){count.textContent='';day.hidden=true;list.innerHTML=serverPostsError?errorHtml(serverPostsError,'posts'):skeletonRows(3);return;}
  const posts=studioUpcomingPosts(everyone?null:client),chosen=$('#schedule-date')?.value||'',note=studioUpcomingDayNote(posts,chosen),top=list.scrollTop;
  count.textContent=posts.length?`${posts.length} coming up`:'';day.textContent=note;day.hidden=!note;
  let lastDay='';
  list.innerHTML=posts.length?posts.slice(0,STUDIO_UPCOMING_MAX).map(post=>{
    const heading=post.date!==lastDay?`<div class="studio-upcoming-heading${post.date===chosen?' chosen':''}">${escapeHtml(dayHeading(post.date))}</div>`:'';lastDay=post.date;
    const meta=[everyone?post.client:'',post.channel].filter(Boolean).join(' · '),tag=post.serverId===editingPost?.id?'<span class="status">Editing</span>':post.status==='Scheduled'?'':`<span class="status ${statusClass(post.status)}">${escapeHtml(post.status)}</span>`;
    return `${heading}<button type="button" class="studio-upcoming-row" data-open-post="${post.serverId}"><span class="studio-upcoming-time">${escapeHtml(post.time)}</span><span class="studio-upcoming-text"><b>${escapeHtml(post.title)}</b><small>${escapeHtml(meta)}</small>${tag}</span></button>`;
  }).join('')+(posts.length>STUDIO_UPCOMING_MAX?`<button type="button" class="text-button studio-upcoming-more" data-view="calendar">See all ${posts.length} on the calendar</button>`:''):`<p class="option-hint">Nothing coming up${everyone?'':` for ${escapeHtml(name)}`}.</p>`;
  list.scrollTop=top;
}
$('#view-composer')?.addEventListener('change',event=>{if(event.target.id==='studio-upcoming-scope')saveStudioUpcomingPrefs({all:event.target.value==='all'});if(['client-select','schedule-date','studio-upcoming-scope'].includes(event.target.id))renderStudioUpcoming();});
$('#studio-upcoming')?.addEventListener('toggle',event=>saveStudioUpcomingPrefs({closed:!event.currentTarget.open}));
if(studioUpcomingPrefs().closed&&$('#studio-upcoming'))$('#studio-upcoming').open=false;
