// Composer media: add several files at once, drop files on the composer or on a calendar day,
// and reorder or remove attached media by dragging thumbnails.
const MAX_POST_MEDIA=10;
const trayIsVideoFile=file=>file.type.startsWith('video/');
const trayIsVideo=media=>media.type?.startsWith('video/')||/\.(mp4|mov|m4v|webm)(\?|$)/i.test(media.url||'');
let mediaUploadsInFlight=0;

function mediaListFor(target){return target==='all'?uploadedMedia:(platformOverrides[target]?.media||[]);}
function setMediaList(target,list){if(target==='all'){uploadedMedia=list;if(list.length)sharedMediaPreview=null;}else platformOverrides[target]={...platformOverrides[target],media:list,preview:list.length?null:platformOverrides[target]?.preview};}

// One file into an empty post keeps the original flow (crop step and an instant local preview).
// More files, or files added to existing media, are uploaded and appended in order.
async function addMediaFiles(fileList){
  const files=[...fileList].filter(file=>file.type.startsWith('image/')||trayIsVideoFile(file));
  if(!files.length){toast('Choose image or video files.');return;}
  const target=activeVariant,existing=mediaListFor(target);
  if(files.length===1&&!existing.length){const input=$('#media-input'),transfer=new DataTransfer();transfer.items.add(files[0]);input.files=transfer.files;input.dispatchEvent(new Event('change'));return;}
  if(!supabaseClient||!activeUser){toast('Sign in to upload several files at once.');return;}
  // A video goes out on its own on most networks, so adding one replaces what's there.
  const video=files.find(trayIsVideoFile);
  let base=video||existing.some(trayIsVideo)?[]:[...existing],queue=video?[video]:files;
  if(video&&files.length>1)toast('A video is posted on its own, so only the video was added.');
  const room=MAX_POST_MEDIA-base.length;
  if(queue.length>room){toast(`Posts can include up to ${MAX_POST_MEDIA} files, so only the first ${Math.max(0,room)} were added.`);queue=queue.slice(0,Math.max(0,room));}
  if(!queue.length)return;
  const oversized=queue.filter(file=>file.size>50*1024*1024);
  if(oversized.length){toast(`${oversized.map(file=>file.name).join(', ')} ${oversized.length===1?'is':'are'} over 50 MB and ${oversized.length===1?'was':'were'} skipped.`);queue=queue.filter(file=>!oversized.includes(file));if(!queue.length)return;}
  setMediaList(target,base);mediaUploadsInFlight+=queue.length;updatePreview();
  let done=0;
  for(const file of queue){const media=await uploadToStorage(file,'media');mediaUploadsInFlight-=1;if(!media)continue;done+=1;setMediaList(target,[...mediaListFor(target),media]);updatePreview();}
  scheduleDraftSave();
  if(done)toast(`${done} file${done===1?'':'s'} uploaded${target==='all'?'':` for ${platformLabel(target)}`}.`);
}

function renderMediaTray(){
  const zone=$('#upload-zone');if(!zone)return;
  let tray=$('#media-tray');
  if(!tray){tray=document.createElement('div');tray.id='media-tray';tray.className='media-tray';tray.setAttribute('aria-label','Attached media');zone.insertAdjacentElement('afterend',tray);}
  const list=currentMediaList(),pending=mediaUploadsInFlight;
  tray.hidden=!list.length&&!pending;
  if(tray.hidden){tray.innerHTML='';return;}
  tray.innerHTML=`${list.map((media,index)=>`<div class="tray-item" tabindex="0" draggable="${list.length>1}" data-tray-index="${index}" title="${escapeHtml(media.name||'')}">${trayIsVideo(media)?`<video src="${escapeHtml(media.url)}" muted preload="metadata"></video><span class="tray-badge">Video</span>`:thumbImgHtml(media.url,160)}<span class="tray-order">${index+1}</span><button type="button" class="tray-remove" data-tray-remove="${index}" aria-label="Remove ${escapeHtml(media.name||`item ${index+1}`)}">×</button></div>`).join('')}${Array.from({length:pending},()=>'<div class="tray-item uploading"><span class="tray-spinner" aria-hidden="true"></span></div>').join('')}${list.length>1?'<p class="option-hint tray-hint">Drag to change the order. The first one leads the post.</p>':''}`;
  const label=$('#upload-zone b');
  if(label&&list.length&&!pending)label.innerHTML=list.some(trayIsVideo)?'Video attached · <u>replace</u>':`${list.length} attached · <u>add more</u> or drop files`;
  if(label&&pending)label.textContent=`Uploading ${pending} file${pending===1?'':'s'}…`;
}
const updatePreviewTrayBase=updatePreview;
updatePreview=function(){updatePreviewTrayBase.apply(this,arguments);renderMediaTray();};

// Reordering and removing.
let trayDragIndex=null;
document.addEventListener('dragstart',event=>{const item=event.target.closest?.('.tray-item[draggable="true"]');if(!item)return;trayDragIndex=Number(item.dataset.trayIndex);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(trayDragIndex));item.classList.add('dragging');});
document.addEventListener('dragend',event=>{event.target.closest?.('.tray-item')?.classList.remove('dragging');$$('.tray-item.drop-before,.tray-item.drop-after').forEach(item=>item.classList.remove('drop-before','drop-after'));trayDragIndex=null;});
document.addEventListener('dragover',event=>{if(trayDragIndex===null)return;const item=event.target.closest?.('.tray-item[data-tray-index]');if(!item)return;event.preventDefault();const box=item.getBoundingClientRect(),after=event.clientX>box.left+box.width/2;$$('.tray-item.drop-before,.tray-item.drop-after').forEach(other=>other.classList.remove('drop-before','drop-after'));item.classList.add(after?'drop-after':'drop-before');});
document.addEventListener('drop',event=>{if(trayDragIndex===null)return;const item=event.target.closest?.('.tray-item[data-tray-index]');if(!item)return;event.preventDefault();const from=trayDragIndex,box=item.getBoundingClientRect();let to=Number(item.dataset.trayIndex)+(event.clientX>box.left+box.width/2?1:0);moveMedia(from,to>from?to-1:to);});
function moveMedia(from,to){const target=activeVariant,list=[...currentMediaList()];if(from===to||from<0||from>=list.length)return;const[item]=list.splice(from,1);list.splice(Math.max(0,Math.min(list.length,to)),0,item);if(target==='all'||Array.isArray(platformOverrides[target]?.media))setMediaList(target,list);else setMediaList('all',list);updatePreview();scheduleDraftSave();}
document.addEventListener('click',event=>{const remove=event.target.closest('[data-tray-remove]');if(!remove)return;event.stopPropagation();const target=activeVariant,list=[...currentMediaList()];list.splice(Number(remove.dataset.trayRemove),1);if(target==='all'||Array.isArray(platformOverrides[target]?.media))setMediaList(target,list);else setMediaList('all',list);if(!list.length){if(target==='all')sharedMediaPreview=null;else if(platformOverrides[target])platformOverrides[target].preview=null;}updatePreview();scheduleDraftSave();});
// Keyboard: arrow keys move a focused thumbnail.
document.addEventListener('keydown',event=>{const item=event.target.closest?.('.tray-item[data-tray-index]');if(!item||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const from=Number(item.dataset.trayIndex),to=from+(event.key==='ArrowLeft'?-1:1);moveMedia(from,to);$(`.tray-item[data-tray-index="${Math.max(0,to)}"]`)?.focus();});

// Dropping files from the computer.
const hasFiles=event=>[...(event.dataTransfer?.types||[])].includes('Files');
(function(){
  const panel=$('.composer-panel');
  if(panel){
    panel.addEventListener('dragover',event=>{if(!hasFiles(event))return;event.preventDefault();event.dataTransfer.dropEffect='copy';$('#upload-zone')?.classList.add('drop-ready');});
    panel.addEventListener('dragleave',event=>{if(!panel.contains(event.relatedTarget))$('#upload-zone')?.classList.remove('drop-ready');});
    panel.addEventListener('drop',event=>{if(!hasFiles(event))return;event.preventDefault();$('#upload-zone')?.classList.remove('drop-ready');addMediaFiles(event.dataTransfer.files);});
  }
  const input=$('#media-input');if(input)input.multiple=true;
})();
// The file picker can now return several files, and a photo picked while photos are attached is added to them.
// A single file into an empty post (or a video) keeps the original replace-and-crop flow.
$('#media-input')?.addEventListener('change',event=>{const files=[...(event.target.files||[])],existing=mediaListFor(activeVariant);if(files.length>1||(files.length===1&&existing.length&&!trayIsVideoFile(files[0])&&!existing.some(trayIsVideo))){event.stopImmediatePropagation();event.target.value='';addMediaFiles(files);}},true);

// Drop a photo or video on a calendar day (or a time in Day/Week view) to start a post there.
function calendarDropTarget(event){const col=event.target.closest?.('.timeline-col[data-date]');if(col){const box=col.getBoundingClientRect(),minutes=Math.max(0,Math.min(23*60+45,Math.round((event.clientY-box.top)/HOUR_HEIGHT*60/15)*15));return{el:col,date:col.dataset.date,minutes};}const day=event.target.closest?.('.calendar-day');const iso=day?.querySelector('[data-open-day]')?.dataset.openDay;return iso?{el:day,date:iso,minutes:null}:null;}
document.addEventListener('dragover',event=>{if(!hasFiles(event)||!event.target.closest?.('#view-calendar'))return;const spot=calendarDropTarget(event);$$('.calendar-drop-target').forEach(el=>el!==spot?.el&&el.classList.remove('calendar-drop-target'));if(!spot)return;event.preventDefault();event.dataTransfer.dropEffect='copy';spot.el.classList.add('calendar-drop-target');});
document.addEventListener('dragleave',event=>{if(event.target.classList?.contains('calendar-drop-target')&&!event.target.contains(event.relatedTarget))event.target.classList.remove('calendar-drop-target');});
document.addEventListener('drop',async event=>{if(!hasFiles(event)||!event.target.closest?.('#view-calendar'))return;const spot=calendarDropTarget(event);$$('.calendar-drop-target').forEach(el=>el.classList.remove('calendar-drop-target'));if(!spot)return;event.preventDefault();const files=[...event.dataTransfer.files];const hasDraft=$('#post-copy').value.trim()||uploadedMedia.length;if(hasDraft&&!editingPost&&!await confirmAction({title:'Add to your current draft?',message:'The Publishing Studio already has a draft. These files will be added to it, and its date will change.',confirm:'Add to draft'}))return;if(editingPost)stopEditing();const when=new Date(`${spot.date}T12:00:00`);if(when<startOfDay(new Date())){toast('That day has passed. Choose today or a later day.');return;}$('#schedule-date').value=spot.date;if(spot.minutes!==null)$('#schedule-time').value=`${String(Math.floor(spot.minutes/60)).padStart(2,'0')}:${String(spot.minutes%60).padStart(2,'0')}`;$('#schedule-date').dispatchEvent(new Event('change',{bubbles:true}));showView('composer');addMediaFiles(files);});
