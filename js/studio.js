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
const applyRoleBase=applyRole;
applyRole=function(){applyRoleBase();placeComposerActions();};

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
const showViewStudioBase=showView;
showView=function(name){showViewStudioBase(name);if(name==='composer'){renderSuggestedTimes();loadStudioTimes();placeComposerActions();}};
placeComposerActions();renderSuggestedTimes();
