// Saved drafts: keep several posts in progress. "Save draft" stores the Studio's current post in a
// list (saved with your account, or in this browser when signed out); More → Saved drafts opens one.
const MAX_SAVED_DRAFTS=30,DRAFTS_LOCAL_KEY='signaldesk.savedDrafts';
let savedDrafts=null,savedDraftsLoading=null;

async function loadSavedDrafts(){if(savedDrafts)return savedDrafts;if(savedDraftsLoading)return savedDraftsLoading;savedDraftsLoading=(async()=>{let list=[];if(cloudFeaturesAvailable()&&supabaseClient&&activeUser){const{data,error}=await supabaseClient.from('user_drafts').select('saved').eq('user_id',activeUser.id).maybeSingle();if(error&&!/saved/.test(error.message))throw error;list=Array.isArray(data?.saved)?data.saved:[];}else{try{list=JSON.parse(localStorage.getItem(DRAFTS_LOCAL_KEY)||'[]');}catch{list=[];}}savedDrafts=list.filter(item=>item&&item.id&&item.state);return savedDrafts;})().finally(()=>{savedDraftsLoading=null;});return savedDraftsLoading;}
async function storeSavedDrafts(){const list=savedDrafts||[];if(cloudFeaturesAvailable()&&supabaseClient&&activeUser){const{error}=await supabaseClient.from('user_drafts').upsert({user_id:activeUser.id,workspace_id:activeWorkspace?.id||null,saved:list,updated_at:new Date().toISOString()});if(error)throw new Error(/saved/.test(error.message)?'Saved drafts need a quick database update. Run supabase/schema.sql in Supabase.':error.message);}else{try{localStorage.setItem(DRAFTS_LOCAL_KEY,JSON.stringify(list));}catch{}}renderDraftsCount();}
function renderDraftsCount(){const item=$('#open-drafts');if(item)item.textContent=savedDrafts?.length?`Saved drafts (${savedDrafts.length})`:'Saved drafts';}

async function saveCurrentDraft(){
  const copy=$('#post-copy').value.trim(),state=collectDraftStateRaw();
  if(!copy&&!state.uploadedMedia.length){toast('Write something or add media before saving a draft.');$('#post-copy').focus();return;}
  try{await loadSavedDrafts();}catch(error){toast(error.message);return;}
  const draft={id:crypto.randomUUID(),title:(copy.split('\n').find(line=>line.trim())||'Untitled draft').slice(0,80),client:$('#client-select')?.value||'',platforms:selectedPlatforms(),manual:selectedManual(),date:$('#schedule-date')?.value||'',time:$('#schedule-time')?.value||'',state:JSON.parse(JSON.stringify(state)),savedAt:new Date().toISOString()};
  // Saving the same post again replaces its earlier copy instead of piling up duplicates.
  const index=savedDrafts.findIndex(item=>item.id===activeSavedDraftId);
  if(index>=0){draft.id=activeSavedDraftId;savedDrafts.splice(index,1);}
  savedDrafts.unshift(draft);savedDrafts=savedDrafts.slice(0,MAX_SAVED_DRAFTS);activeSavedDraftId=draft.id;
  try{await storeSavedDrafts();toast(index>=0?'Draft updated in Saved drafts.':'Saved to your drafts. Find it under More → Saved drafts.');}catch(error){savedDrafts.shift();toast(error.message);}
}
let activeSavedDraftId=null;

function openSavedDraft(id){
  const draft=savedDrafts?.find(item=>item.id===id);if(!draft)return;
  const snapshot=editingPost?null:snapshotDraft();if(editingPost)stopEditing();
  applyDraftState(draft.state);
  if(draft.client&&$('#client-select')&&[...$('#client-select').options].some(option=>option.value===draft.client)){$('#client-select').value=draft.client;$('#client-select').dispatchEvent(new Event('change',{bubbles:true}));}
  if($('#schedule-date'))$('#schedule-date').value=draft.date&&draft.date>=localIsoDate(new Date())?draft.date:'';
  if($('#schedule-time')&&draft.time)$('#schedule-time').value=draft.time;
  editingDuplicatePlatforms=draft.platforms||[];applyDuplicatePlatforms();editingDuplicatePlatforms=draft.platforms||[];
  $$('#manual-select input').forEach(input=>{input.checked=(draft.manual||[]).includes(input.value);});
  activeSavedDraftId=draft.id;selectVariant('all');updatePreview();scheduleDraftSave();
  $('#drafts-dialog')?.close();showView('composer');
  if(snapshot)offerDraftUndo(snapshot,`Opened “${draft.title}”, replacing what was in the Studio.`);else toast(`Opened “${draft.title}”.`);
}
function deleteSavedDraft(id){const index=savedDrafts.findIndex(item=>item.id===id);if(index<0)return;const[removed]=savedDrafts.splice(index,1);if(activeSavedDraftId===id)activeSavedDraftId=null;renderDraftsList();storeSavedDrafts().catch(error=>toast(error.message));showUndo(`“${removed.title}” deleted.`,{onUndo:()=>{savedDrafts.splice(Math.min(index,savedDrafts.length),0,removed);renderDraftsList();storeSavedDrafts().catch(error=>toast(error.message));},undoneMessage:'Draft restored.'});}

function renderDraftsList(){const box=$('#drafts-list');if(!box)return;const list=savedDrafts||[];box.innerHTML=list.length?list.map(draft=>{const media=draft.state?.uploadedMedia?.[0],when=new Date(draft.savedAt);return `<div class="draft-row"><button type="button" class="draft-open" data-open-draft="${escapeHtml(draft.id)}">${media?.url&&!/\.(mp4|mov|m4v|webm)(\?|$)/i.test(media.url)?thumbImgHtml(media.url,120):`<span class="draft-thumb">${icon(media?'image':'edit')}</span>`}<span><b>${escapeHtml(draft.title)}</b><small>${escapeHtml([draft.client,(draft.platforms||[]).map(platformLabel).join(', '),`saved ${timeAgo(when.toISOString())}`].filter(Boolean).join(' · '))}</small></span></button><button type="button" class="icon-button" data-delete-draft="${escapeHtml(draft.id)}" aria-label="Delete “${escapeHtml(draft.title)}”">${icon('trash')}</button></div>`;}).join(''):'<p class="option-hint">No saved drafts yet. Use Save draft in the Publishing Studio to keep a post for later.</p>';}
async function openDraftsDialog(){let dialog=$('#drafts-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='drafts-dialog';dialog.className='auth-dialog';dialog.innerHTML='<div class="auth-form"><h2>Saved drafts</h2><p>Posts you’re still working on. Opening one puts it in the Studio.</p><div id="drafts-list" class="drafts-list"></div><div class="auth-actions"><button type="button" class="secondary-button" data-close-drafts>Close</button></div></div>';document.body.appendChild(dialog);dialog.addEventListener('click',event=>{if(event.target===dialog||event.target.closest('[data-close-drafts]'))dialog.close();const open=event.target.closest('[data-open-draft]');if(open)openSavedDraft(open.dataset.openDraft);const remove=event.target.closest('[data-delete-draft]');if(remove)deleteSavedDraft(remove.dataset.deleteDraft);});}$('#drafts-list').innerHTML=skeletonRows(2);dialog.showModal();try{await loadSavedDrafts();renderDraftsList();renderDraftsCount();}catch(error){$('#drafts-list').innerHTML=`<p class="auth-message">${escapeHtml(error.message)}</p>`;}}

(function(){
  const menu=$('#more-actions-menu');
  if(menu&&!$('#open-drafts')){const item=document.createElement('button');item.className='menu-item';item.id='open-drafts';item.type='button';item.setAttribute('role','menuitem');item.textContent='Saved drafts';menu.appendChild(item);item.addEventListener('click',()=>{menu.hidden=true;$('#more-actions')?.setAttribute('aria-expanded','false');openDraftsDialog();});}
  // Save draft keeps the post in Saved drafts (it used to save to this browser's calendar only).
  const save=$('#save-draft');if(save){const fresh=save.cloneNode(true);save.replaceWith(fresh);fresh.addEventListener('click',saveCurrentDraft);}
  $('#clear-draft')?.addEventListener('click',()=>{activeSavedDraftId=null;});
})();
