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
  tray.innerHTML=`${list.map((media,index)=>`<div class="tray-item" tabindex="0" draggable="${list.length>1}" data-tray-index="${index}" title="${escapeHtml(media.name||'')}">${trayIsVideo(media)?`<video src="${escapeHtml(media.url)}" muted preload="metadata"></video><span class="tray-badge">Video</span>`:thumbImgHtml(media.url,160)}<span class="tray-order">${index+1}</span>${trayIsVideo(media)?`<button type="button" class="tray-trim" data-tray-trim="${index}" aria-label="Trim ${escapeHtml(media.name||'video')}" title="Trim">${icon('scissors')}</button>`:''}<button type="button" class="tray-remove" data-tray-remove="${index}" aria-label="Remove ${escapeHtml(media.name||`item ${index+1}`)}">×</button></div>`).join('')}${Array.from({length:pending},()=>'<div class="tray-item uploading"><span class="tray-spinner" aria-hidden="true"></span></div>').join('')}${list.length>1?'<p class="option-hint tray-hint">Drag to change the order. The first one leads the post.</p>':''}`;
  const label=$('#upload-zone b');
  if(label&&list.length&&!pending)label.innerHTML=list.some(trayIsVideo)?'Video attached · <u>replace</u>':`${list.length} attached · <u>add more</u> or drop files`;
  if(label&&pending)label.textContent=`Uploading ${pending} file${pending===1?'':'s'}…`;
}

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
// Trim a video before posting: pick a start and end, and the browser plays that part once while it
// records it as a new MP4 (networks want MP4), which then replaces the original in the post. Works in
// browsers that can record MP4 (current Chrome, Edge, and Safari); others are told so.
const TRIM_MAX_SECONDS=180;
function trimMimeType(){if(typeof MediaRecorder==='undefined')return '';return['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=avc1,mp4a','video/mp4'].find(type=>MediaRecorder.isTypeSupported?.(type))||'';}
function trimLabel(seconds){const s=Math.max(0,seconds);return `${Math.floor(s/60)}:${(s%60).toFixed(1).padStart(4,'0')}`;}
let trimState=null;
function openTrimDialog(index){const list=currentMediaList(),media=list[index];if(!media)return;let dialog=$('#trim-dialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='trim-dialog';dialog.className='auth-dialog trim-dialog';dialog.setAttribute('aria-labelledby','trim-title');document.body.append(dialog);}
  trimState={index,url:media.url,name:media.name||'video.mp4',target:activeVariant,busy:false};
  dialog.innerHTML=`<form method="dialog" class="auth-form"><h2 id="trim-title">Trim video</h2><video id="trim-video" src="${escapeHtml(media.url)}" crossorigin="anonymous" controls playsinline preload="metadata"></video>
    <div class="trim-fields"><label>Start <input type="number" id="trim-start" class="field" min="0" step="0.1" value="0"></label><label>End <input type="number" id="trim-end" class="field" min="0" step="0.1" value="0"></label><button type="button" class="secondary-button" id="trim-play">Play this part</button></div>
    <p class="option-hint" id="trim-length">Loading the video…</p><p class="auth-message" id="trim-message" role="status"></p>
    <div class="confirm-actions"><button class="text-button" type="button" id="trim-cancel">Cancel</button><button class="primary-button" type="button" id="trim-save" disabled>Trim</button></div></form>`;
  const video=$('#trim-video');video.addEventListener('loadedmetadata',()=>{const end=Math.min(video.duration||0,TRIM_MAX_SECONDS);$('#trim-end').value=end.toFixed(1);$('#trim-start').max=$('#trim-end').max=(video.duration||0).toFixed(1);updateTrimLength();},{once:true});
  video.addEventListener('error',()=>{$('#trim-length').textContent='This video couldn’t be opened for trimming.';},{once:true});
  dialog.showModal();}
function trimRange(){const video=$('#trim-video'),duration=video?.duration||0;let start=Number($('#trim-start')?.value)||0,end=Number($('#trim-end')?.value)||0;start=Math.min(Math.max(0,start),duration);end=Math.min(Math.max(0,end),duration);return{start,end,duration};}
function updateTrimLength(){const{start,end,duration}=trimRange(),length=end-start,save=$('#trim-save');let text=`Keeps ${trimLabel(start)} to ${trimLabel(end)}: ${length.toFixed(1)} seconds of ${duration.toFixed(1)}.`,ok=length>=1&&length<=TRIM_MAX_SECONDS;if(length<1)text='The end has to be at least 1 second after the start.';else if(length>TRIM_MAX_SECONDS)text=`Trimming keeps up to ${TRIM_MAX_SECONDS/60} minutes at a time.`;$('#trim-length').textContent=text;if(save)save.disabled=!ok||trimState?.busy;}
// Plays the chosen part once into a recorder. Resolves to the recorded Blob.
function recordTrim(video,start,end,mimeType,onProgress){return new Promise((resolve,reject)=>{let recorder;try{const stream=video.captureStream?video.captureStream():video.mozCaptureStream?.();if(!stream)throw new Error('This browser can’t record video.');recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:8000000});}catch(error){reject(error);return;}
  const chunks=[];recorder.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data);};recorder.onstop=()=>resolve(new Blob(chunks,{type:mimeType.split(';')[0]}));recorder.onerror=event=>reject(event.error||new Error('Recording failed.'));
  const tick=()=>{onProgress?.(video.currentTime-start);if(video.currentTime>=end||video.ended){video.pause();video.removeEventListener('timeupdate',tick);if(recorder.state!=='inactive')recorder.stop();}};
  video.addEventListener('seeked',()=>{recorder.start(250);video.addEventListener('timeupdate',tick);video.play().catch(reject);},{once:true});video.currentTime=start;});}
async function saveTrim(){if(!trimState||trimState.busy)return;const mimeType=trimMimeType(),message=$('#trim-message');if(!mimeType){message.textContent='This browser can’t save video as MP4. Trim in Chrome, Edge, or Safari, or trim the file before uploading.';return;}
  const{start,end}=trimRange(),video=$('#trim-video');trimState.busy=true;updateTrimLength();video.controls=false;video.muted=false;
  try{message.textContent='Recording the trimmed part. It plays once; keep this window open.';const blob=await recordTrim(video,start,end,mimeType,done=>{message.textContent=`Recording… ${Math.min(done,end-start).toFixed(1)} of ${(end-start).toFixed(1)} seconds`;});
    message.textContent='Uploading…';const base=trimState.name.replace(/\.[a-z0-9]+$/i,'');const uploaded=await uploadToStorage(new File([blob],`${base}-trimmed.mp4`,{type:'video/mp4'}),'media');if(!uploaded)throw new Error('The upload didn’t finish.');
    replaceTrayMedia(trimState,uploaded);$('#trim-dialog').close();toast(`Trimmed to ${(end-start).toFixed(1)} seconds.`);}
  catch(error){message.textContent=/Security|tainted|cross-origin/i.test(error.message||'')?'This video can’t be trimmed in the browser. Trim the file before uploading.':error.message||'Trimming failed.';}
  finally{if(trimState)trimState.busy=false;video.controls=true;updateTrimLength();}}
function replaceTrayMedia(state,uploaded){const target=state.target,list=[...(target==='all'||!Array.isArray(platformOverrides[target]?.media)?uploadedMedia:platformOverrides[target].media)],old=list[state.index];if(!old||old.url!==state.url)return;list[state.index]={...old,...uploaded,alt:old.alt};
  if(target==='all'||Array.isArray(platformOverrides[target]?.media))setMediaList(target,list);else setMediaList('all',list);updatePreview();scheduleDraftSave();}
document.addEventListener('click',event=>{const trim=event.target.closest('[data-tray-trim]');if(trim){event.stopPropagation();openTrimDialog(Number(trim.dataset.trayTrim));return;}
  if(event.target.closest('#trim-cancel'))$('#trim-dialog')?.close();if(event.target.closest('#trim-save'))saveTrim();
  if(event.target.closest('#trim-play')){const video=$('#trim-video'),{start,end}=trimRange();if(!video)return;video.currentTime=start;const stop=()=>{if(video.currentTime>=end){video.pause();video.removeEventListener('timeupdate',stop);}};video.addEventListener('timeupdate',stop);video.play().catch(()=>{});}});
document.addEventListener('input',event=>{if(event.target.id==='trim-start'||event.target.id==='trim-end')updateTrimLength();});
document.addEventListener('close',event=>{if(event.target.id==='trim-dialog'){const video=$('#trim-video');video?.pause();if(!trimState?.busy)trimState=null;}},true);
// Shared from the phone: files and words sent through the share sheet (see sw.js) start a new post. The
// caption is only filled if it's empty, and anything older than 10 minutes is ignored.
async function takeSharedItems(){if(!new URLSearchParams(location.search).has('shared'))return;history.replaceState(null,'',location.pathname+location.hash);if(!('caches' in window))return;
  try{const cache=await caches.open('signaldesk-share'),meta=await (await cache.match('/shared/meta'))?.json().catch(()=>null);if(!meta||Date.now()-meta.at>600000){await caches.delete('signaldesk-share');return;}
    const files=[];for(let index=0;index<Math.min(10,meta.count||0);index+=1){const response=await cache.match(`/shared/${index}`);if(!response)continue;const blob=await response.blob();files.push(new File([blob],decodeURIComponent(response.headers.get('x-name')||`shared-${index+1}`),{type:blob.type}));}
    await caches.delete('signaldesk-share');showView('composer');const caption=$('#post-copy');if(meta.text&&caption&&!caption.value.trim()){caption.value=meta.text;caption.dispatchEvent(new Event('input',{bubbles:true}));}
    if(files.length)await addMediaFiles(files);toast(files.length?`Added ${files.length} shared file${files.length===1?'':'s'}. Pick a client and networks to finish the post.`:'Added what you shared. Pick a client and networks to finish the post.');}
  catch(error){console.warn('Shared items could not be added:',error.message);}}
