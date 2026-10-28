// Plan ahead (Command Center): key dates coming up with how much is planned for each, and the AI
// "What to post next" note per client. Also flags big dates with nothing planned in Needs your attention.
const PLAN_DATE_DAYS=90,PLAN_LOADED_DAYS=60;
let planNotes=new Map(),planNoteLoading='',planNoteBusy='',planClientChoice='',planningPrefs=null;
// "PK Works’ results", "Revere Rum’s results".
function possessive(name){return /s$/i.test(name)?`${name}’`:`${name}’s`;}
function planClient(){return clients.find(client=>client.id===(homeClientId()||planClientChoice))||clients[0]||null;}
function planDayParts(iso){const at=new Date(`${iso}T12:00:00`);return{day:at.getDate(),month:at.toLocaleDateString('en-US',{month:'short'}).toUpperCase(),label:at.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})};}
// Posts going out in the week leading up to a date (and on it), for one client or all.
function plannedFor(iso,clientId){const end=new Date(`${iso}T23:59:59`).getTime(),start=end-7*86400000;return serverPosts.filter(post=>(!clientId||post.clientId===clientId)&&!['canceled','failed'].includes(post.status)&&Date.parse(post.scheduledFor)>=start&&Date.parse(post.scheduledFor)<=end).length;}
let planningPrefsLoading=null;
async function loadPlanningPrefs(){if(planningPrefs||!cloudFeaturesAvailable())return planningPrefs;if(planningPrefsLoading)return planningPrefsLoading;planningPrefsLoading=(async()=>{try{const{data}=await supabaseClient.from('notification_preferences').select('planning_leads,planning_scope').eq('user_id',activeUser.id).maybeSingle();planningPrefs={leads:data?.planning_leads||[30],scope:data?.planning_scope||'major'};}catch{planningPrefs={leads:[30],scope:'major'};}return planningPrefs;})().finally(()=>{planningPrefsLoading=null;});return planningPrefsLoading;}
function planDates(){const scope=planningPrefs?.scope==='all'?'all':'major';return upcomingObservances(localIsoDate(new Date()),PLAN_DATE_DAYS,{scope}).filter(item=>!item.lead||item.daysAway<=14).slice(0,6);}

function planDatesHtml(){const client=planClient(),clientId=homeClientId();const dates=planDates();if(!dates.length)return'<p class="option-hint">No key dates in the next three months.</p>';return dates.map(item=>{const parts=planDayParts(item.date),known=item.daysAway<=PLAN_LOADED_DAYS,count=known?plannedFor(item.date,clientId):null,status=item.lead?'':count===null?'':count?`<span class="plan-count ok">${count} post${count===1?'':'s'} planned</span>`:'<span class="plan-count none">Nothing planned yet</span>';return `<div class="plan-date${item.major?' major':''}"><span class="plan-day" aria-hidden="true"><b>${parts.day}</b><small>${parts.month}</small></span><div class="plan-date-copy"><b>${escapeHtml(item.name)}</b><small>${escapeHtml(parts.label)} · ${escapeHtml(leadPhrase(item.daysAway))}${status?' · ':''}${status}</small><p>${escapeHtml(item.tip)}</p></div>${item.lead||!client?'':`<button type="button" class="secondary-button plan-button" data-plan-date="${item.date}" data-plan-name="${escapeHtml(item.name)}" aria-label="Plan a ${escapeHtml(item.name)} post">Plan a post</button>`}</div>`;}).join('');}

function planNoteHtml(client){
  if(!client)return'<p class="option-hint">Add a client to get ideas for what to post next.</p>';
  const entry=planNotes.get(client.id);
  if(planNoteBusy===client.id)return`<div class="plan-writing" role="status">${icon('sparkles')}<span>Looking at ${escapeHtml(possessive(client.name))} results, schedule, and the dates ahead… This takes up to a minute.</span></div>`;
  if(!entry)return skeletonRows(2);
  if(entry.error)return`<p class="auth-message">${escapeHtml(entry.error)}</p>`;
  const note=entry.note;
  if(!note)return`<div class="plan-empty"><p>Get ideas for ${escapeHtml(client.name)}: what’s worked lately, gaps in the schedule, and posts for the dates ahead. They refresh each week once ${escapeHtml(client.name)} has posts.</p><button type="button" class="primary-button" data-plan-refresh>${icon('sparkles')}Get ideas</button></div>`;
  const networks=list=>(list||[]).map(platformLabel).join(', ');
  return `<div class="plan-note-body">${note.working?`<p class="plan-line"><b>What’s working</b>${escapeHtml(note.working)}</p>`:''}${note.gaps?`<p class="plan-line"><b>Gaps</b>${escapeHtml(note.gaps)}</p>`:''}${(note.dates||[]).length?`<div class="plan-fits"><b>Dates that fit</b>${note.dates.map(item=>`<span class="plan-chip" title="${escapeHtml(item.angle)}">${escapeHtml(item.name)} · ${escapeHtml(planDayParts(item.date).label)}</span>`).join('')}</div>`:''}<ol class="plan-ideas">${(note.ideas||[]).map((idea,index)=>`<li class="plan-idea"><div><b>${escapeHtml(idea.title)}</b><small>${escapeHtml([idea.date?planDayParts(idea.date).label:'',networks(idea.platforms)].filter(Boolean).join(' · '))}</small><p>${escapeHtml(idea.why)}</p>${idea.starter?`<blockquote>${escapeHtml(idea.starter)}</blockquote>`:''}</div><button type="button" class="secondary-button" data-plan-idea="${index}">Draft it</button></li>`).join('')}</ol><p class="plan-meta">${entry.stale?'From over a week ago. ':''}Written ${timeAgo(note.createdAt)} from ${escapeHtml(possessive(client.name))} results, schedule, and upcoming dates. Ideas are suggestions; check facts before posting.</p></div>`;
}

function renderPlanPanel(){
  const view=$('#view-overview');if(!view)return;let panel=$('#plan-panel');
  if(!cloudFeaturesAvailable()||!activeUser){panel?.remove();return;}
  if(!panel){panel=document.createElement('section');panel.id='plan-panel';panel.className='panel plan-panel';panel.setAttribute('aria-label','Plan ahead');$('.content-grid',view)?.insertAdjacentElement('afterend',panel);}
  const client=planClient(),choose=!homeClientId()&&clients.length>1;
  panel.innerHTML=`<div class="panel-header"><div><h2>Plan ahead</h2><p>Key dates coming up and ideas for what to post next. Working a month or two ahead? Set how early you’re reminded.</p></div><button type="button" class="text-button" data-plan-settings>Reminder settings</button></div><div class="plan-layout"><div class="plan-dates"><h3>Coming up</h3>${planDatesHtml()}<button type="button" class="text-button" data-view="calendar">All dates on the calendar →</button></div><div class="plan-note"><div class="plan-note-head"><h3>What to post next</h3>${choose?`<select class="field compact" id="plan-client" aria-label="Client for ideas">${clients.map(item=>`<option value="${escapeHtml(item.id)}"${item.id===client?.id?' selected':''}>${escapeHtml(item.name)}</option>`).join('')}</select>`:client?`<span class="plan-client-name">${escapeHtml(client.name)}</span>`:''}${planNotes.get(client?.id)?.note&&planNoteBusy!==client?.id?`<button type="button" class="text-button" data-plan-refresh>${icon('refresh')}New ideas</button>`:''}</div>${planNoteHtml(client)}</div></div>`;
  if(client&&!planNotes.has(client.id))loadPlanNote(client);
}
async function loadPlanNote(client,refresh=false){
  if(!refresh&&planNoteLoading===client.id)return;planNoteLoading=client.id;if(refresh)planNoteBusy=client.id;renderPlanPanel();
  try{const data=await callSocialApi({action:'planning-note',clientId:client.id,refresh});planNotes.set(client.id,{note:data.note,stale:Boolean(data.stale)});}
  catch(error){planNotes.set(client.id,{...(planNotes.get(client.id)||{}),error:/schema|planning_notes|relation/.test(error.message)?'Ideas need a quick database update. Run supabase/schema.sql in Supabase.':error.message});if(refresh&&planNotes.get(client.id)?.note)toast(error.message);}
  finally{if(planNoteLoading===client.id)planNoteLoading='';if(planNoteBusy===client.id)planNoteBusy='';renderPlanPanel();}
}

// Opens the Studio set up for a date or an idea: client, day, networks, and (if there is one) the draft.
async function startPostFromPlan({client,date,text='',platforms=[],idea=''}){
  const snapshot=text&&!editingPost&&$('#post-copy')?.value.trim()?snapshotDraft():null;if(text&&editingPost)stopEditing();
  showView('composer');
  if(client&&$('#client-select')&&[...$('#client-select').options].some(option=>option.value===client.name)){$('#client-select').value=client.name;$('#client-select').dispatchEvent(new Event('change',{bubbles:true}));}
  await new Promise(done=>setTimeout(done,50));
  if(platforms.length){editingDuplicatePlatforms=platforms;applyDuplicatePlatforms();editingDuplicatePlatforms=platforms;}
  const day=$('#schedule-date');if(day&&date&&date>=localIsoDate(new Date())){day.value=date;['input','change'].forEach(type=>day.dispatchEvent(new Event(type,{bubbles:true})));}
  if(text){const copy=$('#post-copy');copy.value=text;copy.dispatchEvent(new Event('input',{bubbles:true}));selectVariant('all');updatePreview();scheduleDraftSave();if(snapshot)offerDraftUndo(snapshot,'Idea added to the Studio, replacing what was there.');else toast('Idea added to the Studio. Edit it, then schedule.');}
  else if(idea){$('#caption-idea').value=idea.slice(0,3000);openCaptionDialog();}
  renderSuggestedTimes();
}
document.addEventListener('click',event=>{
  if(event.target.closest('[data-plan-settings]')){openNotificationPreferences().then(()=>$('#planning-prefs')?.scrollIntoView({block:'center'}));return;}
  if(event.target.closest('[data-plan-refresh]')){const client=planClient();if(client)loadPlanNote(client,true);return;}
  const date=event.target.closest('[data-plan-date]');
  if(date){const client=planClient(),item=planDates().find(entry=>entry.date===date.dataset.planDate&&entry.name===date.dataset.planName);startPostFromPlan({client,date:date.dataset.planDate,idea:`A ${date.dataset.planName} post${client?` for ${client.name}`:''}, going out on or just before ${planDayParts(date.dataset.planDate).label}.${item?` Ideas: ${item.tip}`:''}`});return;}
  const idea=event.target.closest('[data-plan-idea]');
  if(idea){const client=planClient(),item=planNotes.get(client?.id)?.note?.ideas?.[Number(idea.dataset.planIdea)];if(item)startPostFromPlan({client,date:item.date,text:item.starter,platforms:item.platforms||[]});}
});
document.addEventListener('change',event=>{if(event.target.id==='plan-client'){planClientChoice=event.target.value;renderPlanPanel();}});

// Needs your attention: a major date within two weeks with nothing planned around it.
const attentionItemsPlanBase=attentionItems;
attentionItems=function(){const items=attentionItemsPlanBase.apply(this,arguments);if(!cloudFeaturesAvailable()||!serverPostsLoadedAt)return items;const scope=homeClientId();upcomingObservances(localIsoDate(new Date()),14,{scope:'major'}).filter(item=>!item.lead&&item.kind!=='month'&&item.daysAway>=2).forEach(item=>{if(!plannedFor(item.date,scope))items.push({kind:'view',view:'calendar',title:`Nothing planned for ${item.name}`,detail:`${planDayParts(item.date).label} · ${leadPhrase(item.daysAway)}`,meta:item.tip,tone:'pending'});});return items;};

const renderCommandCenterPlanBase=renderCommandCenter;
renderCommandCenter=function(){renderCommandCenterPlanBase.apply(this,arguments);renderPlanPanel();if(!planningPrefs&&cloudFeaturesAvailable())loadPlanningPrefs().then(renderPlanPanel);};
