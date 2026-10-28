// Undo instead of "Are you sure?". An action either waits a few seconds before it's sent (run),
// or is already done locally and can be put back (onUndo). Starting another one, or leaving the
// page, sends the waiting one right away.
const UNDO_MS=8000;
let undoPending=null;

function undoBar(){let bar=$('#undo-bar');if(!bar){bar=document.createElement('div');bar.id='undo-bar';bar.className='undo-bar';bar.setAttribute('role','status');bar.hidden=true;bar.innerHTML='<span class="undo-text"></span><button type="button" class="undo-button">Undo</button><i class="undo-timer" aria-hidden="true"></i>';document.body.appendChild(bar);bar.querySelector('.undo-button').addEventListener('click',undoNow);}return bar;}
function hideUndoBar(){const bar=$('#undo-bar');if(bar)bar.hidden=true;}

async function finishUndoable(item){if(!item.run)return;try{await item.run();}catch(error){item.onUndo?.();toast(error.message||'That didn’t work. It was put back.');}}
function flushUndo(){const item=undoPending;if(!item)return;undoPending=null;clearTimeout(item.timer);hideUndoBar();finishUndoable(item);}
function undoNow(){const item=undoPending;if(!item)return;undoPending=null;clearTimeout(item.timer);hideUndoBar();item.onUndo?.();toast(item.undoneMessage||'Undone.');}

function showUndo(message,{run=null,onUndo=null,undoneMessage='',delay=UNDO_MS}={}){
  flushUndo();
  const bar=undoBar(),item={run,onUndo,undoneMessage};
  bar.querySelector('.undo-text').textContent=message;
  const timer=bar.querySelector('.undo-timer');timer.style.animation='none';void timer.offsetWidth;timer.style.animation=`undo-countdown ${delay}ms linear forwards`;
  bar.hidden=false;
  item.timer=setTimeout(()=>{if(undoPending===item){undoPending=null;hideUndoBar();finishUndoable(item);}},delay);
  undoPending=item;
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushUndo();});
window.addEventListener('pagehide',flushUndo);
document.addEventListener('keydown',event=>{if(undoPending&&(event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'&&!event.target.closest?.('input,textarea,[contenteditable]')){event.preventDefault();undoNow();}});

// Hides a scheduled post everywhere while its cancel waits, and brings it back on Undo.
const hiddenPosts=new Map();
function refreshPostViews(){['renderUpcoming','renderCalendar','renderApprovals','renderCommandCenter'].forEach(name=>{if(typeof window[name]==='function')window[name]();});}
function hidePostLocally(id){const index=serverPosts.findIndex(post=>post.id===id);if(index<0)return;hiddenPosts.set(id,{post:serverPosts[index],index});serverPosts.splice(index,1);refreshPostViews();}
function restorePostLocally(id){const saved=hiddenPosts.get(id);if(!saved)return;hiddenPosts.delete(id);if(!serverPosts.some(post=>post.id===id))serverPosts.splice(Math.min(saved.index,serverPosts.length),0,saved.post);refreshPostViews();}

// Replacing the Studio draft (duplicating or posting again) can be undone too.
function snapshotDraft(){return{state:JSON.parse(JSON.stringify(collectDraftStateRaw())),client:$('#client-select')?.value,date:$('#schedule-date')?.value,time:$('#schedule-time')?.value};}
function restoreDraft(snapshot){applyDraftState(snapshot.state);if(snapshot.client&&$('#client-select'))$('#client-select').value=snapshot.client;if($('#schedule-date'))$('#schedule-date').value=snapshot.date||'';if($('#schedule-time'))$('#schedule-time').value=snapshot.time||'';editingDuplicatePlatforms=null;updatePreview();scheduleDraftSave();}
function offerDraftUndo(snapshot,message){if(!snapshot.state.draft.trim()&&!snapshot.state.uploadedMedia.length)return;showUndo(message,{onUndo:()=>restoreDraft(snapshot),undoneMessage:'Your earlier draft is back.'});}
