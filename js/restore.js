// Settings → General → Restore from a copy: brings back what's missing from a copy made with Export.
// Only missing things come back (clients with their brand kits, saved posts, templates, snippets,
// library items, reply templates, and upcoming posts), so nothing current is overwritten. Settings
// are replaced only when asked. Upcoming posts go through the spreadsheet importer, so they're
// checked and scheduled the usual way, and a post that still exists is never doubled.
const RESTORE_LISTS=[['clients','client','clients'],['savedPosts','saved post','saved posts'],['templates','template','templates'],['snippets','snippet','snippets'],['assets','library item','library items'],['replyTemplates','reply template','reply templates']];
const BACKUP_CSV_COLUMNS=[...CSV_COLUMNS,'id','status','title'];
const UPCOMING_STATUSES=new Set(['scheduled','pending_approval']);
let restoreCopy=null;

// Posts from an Export as the importer reads them, plus their status and title for the record.
function backupPostsCsv(posts,clientList=clients){
  const nameOf=id=>clientList.find(item=>item.id===id)?.name||id,quote=value=>{const text=String(value??'');return /[",\n\r]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;};
  const rows=posts.map(post=>{const when=new Date(post.scheduled_for),networks=[...new Set((post.publish_jobs||[]).filter(job=>job.status!=='canceled').map(job=>job.platform))];
    return[localIsoDate(when),csvClock(when),nameOf(post.client_id),networks.map(platformLabel).join(';'),post.content?.text||'',(post.content?.media||[]).join('|'),post.campaign||'',post.options?.cover?.url||'',`post:${post.id}`,post.status||'',post.title||''];});
  return[BACKUP_CSV_COLUMNS,...rows].map(row=>row.map(quote).join(',')).join('\n');
}
function restoreUpcoming(copy,now=Date.now()){return(copy.posts||[]).filter(post=>UPCOMING_STATUSES.has(post.status)&&Date.parse(post.scheduled_for)>now+60000&&!post.parent_id);}
// What the copy has that this workspace doesn't, list by list.
function restoreMissing(copy){const current=collectSharedState(),state=copy.workspace||{};return Object.fromEntries(RESTORE_LISTS.map(([key])=>{const have=new Set((current[key]||[]).map(stateItemKey));return[key,(Array.isArray(state[key])?state[key]:[]).filter(item=>item&&!have.has(stateItemKey(item)))];}));}
async function missingUpcoming(copy){const upcoming=restoreUpcoming(copy);if(!upcoming.length)return[];const found=new Set();for(let index=0;index<upcoming.length;index+=200){const{posts=[]}=await callSocialApi({action:'posts-by-id',ids:upcoming.slice(index,index+200).map(post=>post.id)});posts.forEach(post=>found.add(post.id));}return upcoming.filter(post=>!found.has(post.id));}
function restoreItemName(key,item){return item.name||item.title||item.label||(item.text?String(item.text).slice(0,40):'')||(key==='assets'?'Library item':'Item');}
function restoreOptionHtml(key,one,many,items){const names=items.slice(0,4).map(item=>escapeHtml(restoreItemName(key,item))).join(', ')+(items.length>4?`, and ${items.length-4} more`:'');return`<label class="restore-option"><input type="checkbox" data-restore-key="${key}" checked><span><b>${items.length} ${items.length===1?one:many}</b><small>${names}</small></span></label>`;}
function renderRestorePlan(copy,missing,posts){const made=new Date(copy.exportedAt).toLocaleString('en-US',{month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}),options=RESTORE_LISTS.filter(([key])=>missing[key].length).map(([key,one,many])=>restoreOptionHtml(key,one,many,missing[key]));
  if(posts.length)options.push(`<label class="restore-option"><input type="checkbox" data-restore-key="posts" checked><span><b>${posts.length} upcoming post${posts.length===1?'':'s'}</b><small>You’ll check them in the import window before anything is scheduled.</small></span></label>`);
  options.push(`<label class="restore-option"><input type="checkbox" data-restore-key="settings"><span><b>Replace settings with the copy’s</b><small>Workspace name, time zone, approvals, and the other settings on this page. Off unless you choose it.</small></span></label>`);
  $('#restore-plan').innerHTML=`<p class="restore-summary">This copy was made <b>${escapeHtml(made)}</b>. ${options.length>1?'These are in the copy but not in your workspace now:':'Everything in the copy is already in your workspace.'}</p>${options.join('')}`;$('#restore-go').disabled=false;}
async function openRestoreFile(file){const message=$('#restore-message');message.textContent='';restoreCopy=null;$('#restore-plan').innerHTML='';$('#restore-go').disabled=true;
  let copy;try{copy=JSON.parse(await file.text());}catch{message.textContent='That file couldn’t be read. Choose the .json file that Export downloaded.';return;}
  if(copy?.format!=='signaldesk-export-1'||typeof copy.workspace!=='object'){message.textContent='That isn’t a SignalDesk copy. Choose the signaldesk-….json file that Export downloaded.';return;}
  message.textContent='Comparing with your workspace…';
  try{const missing=restoreMissing(copy),posts=await missingUpcoming(copy);restoreCopy={copy,missing,posts};message.textContent='';renderRestorePlan(copy,missing,posts);}catch(error){message.textContent=error.message;}}
async function runRestore(){if(!restoreCopy)return;const{copy,missing,posts}=restoreCopy,chosen=new Set($$('#restore-plan [data-restore-key]:checked').map(box=>box.dataset.restoreKey)),message=$('#restore-message'),button=$('#restore-go');
  const merged={...collectSharedState()},added=[];
  for(const[key,one,many]of RESTORE_LISTS){if(!chosen.has(key)||!missing[key].length)continue;merged[key]=[...(merged[key]||[]),...missing[key]];added.push(`${missing[key].length} ${missing[key].length===1?one:many}`);}
  if(merged.clients.length>50){message.textContent=`That would make ${merged.clients.length} clients, over the limit of 50. Untick clients, or remove some first.`;return;}
  if(chosen.has('settings')&&copy.workspace.settings)merged.settings=copy.workspace.settings;
  button.disabled=true;button.textContent='Restoring…';
  // If the save fails, the screen goes back to how it was, so nothing looks restored that isn't.
  const previous=JSON.parse(JSON.stringify(collectSharedState()));
  try{if(added.length||chosen.has('settings')){applyWorkspaceState(merged);renderWorkspace();sharedStateDirty=true;await saveWorkspaceState();if(sharedStateDirty){sharedStateDirty=false;applyWorkspaceState(previous);renderWorkspace();throw new Error('Your workspace couldn’t be saved, so nothing was restored. Check your connection and try again.');}}
    const parts=[...added,...(chosen.has('settings')?['the settings']:[])];toast(parts.length?`Restored ${parts.join(', ')}.`:'Nothing else to restore.');
    $('#restore-dialog').close();
    if(chosen.has('posts')&&posts.length)await openCsvWithText(backupPostsCsv(posts,clients),`${posts.length} upcoming post${posts.length===1?'':'s'} from your copy. Check them, then select Schedule.`);
  }catch(error){message.textContent=error.message;}finally{button.disabled=false;button.textContent='Restore';}}
$('#restore-open')?.addEventListener('click',()=>{if(currentRole!=='admin'){toast('Only admins can restore a workspace.');return;}restoreCopy=null;$('#restore-plan').innerHTML='';$('#restore-message').textContent='';$('#restore-go').disabled=true;$('#restore-dialog').showModal();});
$('#restore-file')?.addEventListener('change',event=>{const file=event.target.files[0];event.target.value='';if(file)openRestoreFile(file);});
$('#restore-go')?.addEventListener('click',runRestore);
$('#restore-cancel')?.addEventListener('click',()=>$('#restore-dialog').close());
