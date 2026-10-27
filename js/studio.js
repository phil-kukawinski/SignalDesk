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

// Suggested times: the next few good slots from this client's own history (or common times until
// there's enough history), shown as one-tap chips under the date and time.
function suggestedSlots(count=3){
  const windows=(typeof bestTimes!=='undefined'&&bestTimes.windows)||STARTER_WINDOWS,slots=[],soonest=Date.now()+30*60000;
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
  const fromHistory=typeof bestTimes!=='undefined'&&bestTimes.source==='history';
  const label=(at)=>`${dayHeading(localIsoDate(at))} · ${at.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}`;
  box.innerHTML=`<span class="suggested-label" title="${fromHistory?'Based on when this workspace’s posts have done best':'Common good times until there’s enough history to learn from'}">${icon('sparkles')}${fromHistory?'Best times':'Suggested'}</span>${suggestedSlots().map(at=>`<button type="button" class="time-chip" data-suggest-at="${at.toISOString()}">${escapeHtml(label(at))}</button>`).join('')}`;
}
$('#suggested-times')?.addEventListener('click',event=>{
  const chip=event.target.closest('[data-suggest-at]');if(!chip)return;
  const at=new Date(chip.dataset.suggestAt),date=$('#schedule-date'),time=$('#schedule-time');
  date.value=localIsoDate(at);time.value=`${String(at.getHours()).padStart(2,'0')}:${String(at.getMinutes()).padStart(2,'0')}`;
  [date,time].forEach(field=>{field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));});
  $$('#suggested-times .time-chip').forEach(item=>item.classList.toggle('active',item===chip));
});
const showViewStudioBase=showView;
showView=function(name){showViewStudioBase(name);if(name==='composer'){renderSuggestedTimes();placeComposerActions();}};
placeComposerActions();renderSuggestedTimes();
