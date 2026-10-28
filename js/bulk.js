// Working on several posts at once: approve, send back, or move a selection of posts waiting
// for approval, and copy a week (or a day) of posts to a later week.
const bulkSelected=new Set(),pendingApproved=new Set();
// A refresh while an Undo is waiting keeps showing the change: canceled posts stay hidden and
// approved ones stay approved until the request goes out.
const loadServerPostsUndoBase=loadServerPosts;
loadServerPosts=async function(...args){const result=await loadServerPostsUndoBase.apply(this,args);if(hiddenPosts.size||pendingApproved.size){serverPosts=serverPosts.filter(post=>!hiddenPosts.has(post.id));serverPosts.forEach(post=>{if(pendingApproved.has(post.id)&&post.status==='pending_approval')post.status='scheduled';});refreshPostViews();}return result;};

function bulkWaitingPosts(){return serverPosts.filter(post=>post.status==='pending_approval');}
function renderBulkBar(){
  const table=$('#approval-table');if(!table)return;
  let bar=$('#approval-bulk');
  const admin=currentRole==='admin'&&cloudFeaturesAvailable(),waiting=bulkWaitingPosts();
  [...bulkSelected].forEach(id=>{if(!waiting.some(post=>post.id===id))bulkSelected.delete(id);});
  if(!admin||waiting.length<2){bar?.remove();$$('.bulk-check',table).forEach(box=>box.remove());return;}
  if(!bar){bar=document.createElement('div');bar.id='approval-bulk';bar.className='approval-bulk';(table.closest('.panel')?.querySelector('.approval-table-head')||table).insertAdjacentElement('beforebegin',bar);}
  const count=bulkSelected.size,all=count===waiting.length;
  bar.innerHTML=`<label class="bulk-all"><input type="checkbox" id="bulk-all" ${all?'checked':''} aria-label="Select every post waiting for approval">${count?`${count} selected`:'Select all'}</label><div class="bulk-actions"${count?'':' hidden'}><button type="button" class="secondary-button bulk-approve" data-bulk="approve">${icon('check')}Approve ${count}</button><button type="button" class="secondary-button" data-bulk="reject">Request changes</button><span class="bulk-move"><input type="date" class="field" id="bulk-date" aria-label="Move the selected posts to this date" min="${localIsoDate(new Date())}"><button type="button" class="secondary-button" data-bulk="move">Move</button></span><button type="button" class="text-button" data-bulk="clear">Clear</button></div>`;
  const allBox=$('#bulk-all');if(allBox)allBox.indeterminate=count>0&&!all;
  $$('.approval-table-row',table).forEach(row=>{const post=bulkRowPost(row);if(!post)return;let box=$('.bulk-check',row);if(!box){box=document.createElement('input');box.type='checkbox';box.className='bulk-check';box.setAttribute('aria-label',`Select “${post.title||'post'}”`);row.querySelector('.approval-post')?.prepend(box);}box.dataset.bulkId=post.id;box.checked=bulkSelected.has(post.id);row.classList.toggle('bulk-selected',box.checked);});
}
// Rows are rendered from serverApprovalRows() in the same order, so the index maps back to the post.
function bulkRowPost(row){const rows=serverApprovalRows(),item=rows[Number(row.dataset.approval)];return item?.serverId?serverPosts.find(post=>post.id===item.serverId):null;}
const renderApprovalsBulkBase=renderApprovals;
renderApprovals=function(){renderApprovalsBulkBase.apply(this,arguments);renderBulkBar();};

document.addEventListener('change',event=>{
  if(event.target.id==='bulk-all'){const on=event.target.checked;bulkWaitingPosts().forEach(post=>on?bulkSelected.add(post.id):bulkSelected.delete(post.id));renderBulkBar();return;}
  const box=event.target.closest?.('.bulk-check');if(box){box.checked?bulkSelected.add(box.dataset.bulkId):bulkSelected.delete(box.dataset.bulkId);renderBulkBar();}
});
document.addEventListener('click',event=>{if(event.target.closest('.bulk-check'))event.stopPropagation();},true);

// Runs one request per post, a few at a time, and reports how many worked.
async function bulkRun(ids,request){const results=[];for(let index=0;index<ids.length;index+=4){const batch=ids.slice(index,index+4);results.push(...await Promise.all(batch.map(id=>callSocialApi(request(id)).then(()=>({id,ok:true})).catch(error=>({id,ok:false,error:error.message})))));}return results;}
function bulkReport(results,verb){const ok=results.filter(item=>item.ok).length,failed=results.filter(item=>!item.ok);toast(failed.length?`${ok} ${verb}. ${failed.length} couldn’t be: ${failed[0].error}`:`${ok} post${ok===1?'':'s'} ${verb}.`);}
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-bulk]');if(!button)return;
  const kind=button.dataset.bulk,ids=[...bulkSelected];
  if(kind==='clear'){bulkSelected.clear();renderBulkBar();return;}
  if(!ids.length)return;
  if(kind==='approve'){const posts=ids.map(id=>serverPosts.find(post=>post.id===id)).filter(Boolean);posts.forEach(post=>{post.status='scheduled';pendingApproved.add(post.id);});bulkSelected.clear();refreshPostViews();showUndo(`${posts.length} post${posts.length===1?'':'s'} approved. Each goes out at its own time.`,{run:async()=>{const results=await bulkRun(ids,id=>({action:'approve',postId:id}));ids.forEach(id=>pendingApproved.delete(id));bulkReport(results,'approved');await loadServerPosts(true);},onUndo:()=>{posts.forEach(post=>{post.status='pending_approval';pendingApproved.delete(post.id);});refreshPostViews();},undoneMessage:'Still waiting for approval.'});return;}
  if(kind==='reject'){const note=prompt(`What should change? This note goes to the author of all ${ids.length} posts. (Optional)`);if(note===null)return;button.disabled=true;const results=await bulkRun(ids,id=>({action:'reject',postId:id,note}));bulkReport(results,'sent back');}
  if(kind==='move'){const day=$('#bulk-date')?.value;if(!day){toast('Choose a date to move the posts to.');$('#bulk-date')?.focus();return;}button.disabled=true;
    // Each post keeps its own time of day.
    const results=await bulkRun(ids,id=>{const post=serverPosts.find(item=>item.id===id),old=new Date(post.scheduledFor),when=new Date(`${day}T00:00:00`);when.setHours(old.getHours(),old.getMinutes(),0,0);return{action:'reschedule-post',postId:id,scheduleDate:when.toISOString()};});
    bulkReport(results,`moved to ${new Date(`${day}T12:00:00`).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}`);}
  bulkSelected.clear();await loadServerPosts(true);
});

// --- Copy a week (or a day) of posts ---
function calendarRange(){const start=startOfDay(calCursor);if(calView==='day')return{start,end:addDays(start,1),label:'day'};const first=addDays(start,-start.getDay());return{start:first,end:addDays(first,7),label:'week'};}
function copyablePosts(){const{start,end}=calendarRange();return serverPosts.filter(post=>post.status!=='canceled'&&post.source!=='autopilot'&&Date.parse(post.scheduledFor)>=start&&Date.parse(post.scheduledFor)<end).sort((a,b)=>Date.parse(a.scheduledFor)-Date.parse(b.scheduledFor));}
function renderCopyWeekButton(){const print=$('#print-calendar');if(!print)return;let button=$('#copy-week');const show=currentRole==='admin'&&cloudFeaturesAvailable()&&['week','day'].includes(calView);if(!show){if(button)button.hidden=true;return;}if(!button){button=document.createElement('button');button.type='button';button.id='copy-week';button.className='secondary-button';print.insertAdjacentElement('beforebegin',button);button.addEventListener('click',openCopyWeek);}button.hidden=false;const{label}=calendarRange();button.innerHTML=`${icon('copy')}Copy ${label}`;button.title=`Copy this ${label}’s posts to a later date`;}
const renderCalendarCopyBase=renderCalendar;
renderCalendar=function(){renderCalendarCopyBase.apply(this,arguments);renderCopyWeekButton();};

function openCopyWeek(){
  const posts=copyablePosts(),{start,label}=calendarRange();
  let dialog=$('#copy-week-dialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='copy-week-dialog';dialog.className='auth-dialog';document.body.appendChild(dialog);dialog.addEventListener('click',event=>{if(event.target===dialog||event.target.closest('[data-copy-cancel]'))dialog.close();});}
  const heading=label==='week'?`Copy the week of ${start.toLocaleDateString('en-US',{month:'short',day:'numeric'})}`:`Copy ${start.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}`;
  const offsets=label==='week'?[[7,'Next week'],[14,'In 2 weeks'],[21,'In 3 weeks'],[28,'In 4 weeks']]:[[1,'Tomorrow'],[7,'Same day next week'],[14,'In 2 weeks']];
  dialog.innerHTML=`<form class="auth-form" id="copy-week-form"><h2>${escapeHtml(heading)}</h2>${posts.length?`<p>Copies keep their networks, media, comments, and time of day. Posts waiting for approval stay that way; the rest are scheduled.</p><label class="field-label" for="copy-offset">Copy to</label><select class="field" id="copy-offset">${offsets.map(([days,name])=>`<option value="${days}">${name} (${addDays(start,days).toLocaleDateString('en-US',{month:'short',day:'numeric'})}${label==='week'?` – ${addDays(start,days+6).toLocaleDateString('en-US',{month:'short',day:'numeric'})}`:''})</option>`).join('')}</select><fieldset class="pref-group copy-list"><legend class="field-label">Posts</legend>${posts.map(post=>{const client=clients.find(item=>item.id===post.clientId);return `<label class="option-toggle"><input type="checkbox" name="copy-post" value="${escapeHtml(post.id)}" checked><span><b>${escapeHtml(post.title||'Untitled post')}</b><small>${escapeHtml(client?.name||'Client')} · ${escapeHtml(new Date(post.scheduledFor).toLocaleString('en-US',{weekday:'short',hour:'numeric',minute:'2-digit'}))} · ${escapeHtml(post.jobs.filter(job=>job.status!=='canceled').map(jobLabel).join(', '))}</small></span></label>`;}).join('')}</fieldset>`:`<p>There are no SignalDesk posts this ${label} to copy. Posts made outside SignalDesk can’t be copied.</p>`}<p class="auth-message" id="copy-week-message" role="status"></p><div class="auth-actions">${posts.length?`<button class="primary-button" type="submit" id="copy-week-go">Copy ${posts.length} post${posts.length===1?'':'s'}</button>`:''}<button class="secondary-button" type="button" data-copy-cancel>${posts.length?'Cancel':'Close'}</button></div></form>`;
  const form=$('#copy-week-form'),go=$('#copy-week-go');
  form.addEventListener('change',()=>{const n=$$('input[name=copy-post]:checked',form).length;if(go){go.textContent=`Copy ${n} post${n===1?'':'s'}`;go.disabled=!n;}});
  form.addEventListener('submit',async event=>{event.preventDefault();const ids=$$('input[name=copy-post]:checked',form).map(input=>input.value),offsetDays=Number($('#copy-offset').value);if(!ids.length)return;go.disabled=true;go.textContent='Copying…';try{const result=await callSocialApi({action:'copy-posts',postIds:ids,offsetDays});dialog.close();await loadServerPosts(true);const made=result.created.length,skipped=result.skipped.length;toast(`${made} post${made===1?'':'s'} copied${skipped?`. ${skipped} skipped: ${result.skipped[0].reason}`:''}.`);if(made){calCursor=addDays(calCursor,offsetDays);renderCalendar();}}catch(error){$('#copy-week-message').textContent=error.message;go.disabled=false;go.textContent=`Copy ${ids.length} post${ids.length===1?'':'s'}`;}});
  dialog.showModal();
}
