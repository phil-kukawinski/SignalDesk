// Media thumbnails that open a full-size viewer (photos at full size, videos with playback controls).
// Shared by the app and the client review page, so it carries its own styles and helpers.
(function(){
  const VIDEO=/\.(mp4|mov|m4v|webm)(\?|#|$)/i;
  const esc=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const isVideo=url=>VIDEO.test(url);

  // Thumbnail strip; every thumbnail opens the viewer at that item.
  window.mediaThumbsHtml=function(urls,{max=6,className=''}={}){
    const list=(urls||[]).filter(url=>typeof url==='string'&&/^https?:\/\//.test(url));
    if(!list.length)return'';
    const shown=list.slice(0,max),extra=list.length-shown.length;
    return `<div class="media-thumbs ${className}" data-media="${esc(JSON.stringify(list))}">${shown.map((url,index)=>{
      const label=isVideo(url)?'Play video':'View image',more=extra&&index===shown.length-1?`<span class="media-thumb-more">+${extra}</span>`:'';
      const inner=isVideo(url)?`<video src="${esc(url)}#t=0.1" muted playsinline preload="metadata"></video><span class="media-thumb-play" aria-hidden="true">▶</span>`:`<img src="${esc(url)}" alt="" loading="lazy">`;
      return `<button type="button" class="media-thumb" data-media-index="${index}" aria-label="${label} ${index+1} of ${list.length}">${inner}${more}</button>`;
    }).join('')}</div>`;
  };

  let viewer=null,items=[],current=0;
  function build(){
    viewer=document.createElement('dialog');
    viewer.className='media-viewer';
    viewer.setAttribute('aria-label','Media viewer');
    viewer.innerHTML='<div class="media-viewer-stage"></div><button type="button" class="media-viewer-close" aria-label="Close">×</button><button type="button" class="media-viewer-nav prev" aria-label="Previous">‹</button><button type="button" class="media-viewer-nav next" aria-label="Next">›</button><div class="media-viewer-count"></div>';
    document.body.appendChild(viewer);
    viewer.querySelector('.media-viewer-close').addEventListener('click',close);
    viewer.querySelector('.prev').addEventListener('click',()=>show(current-1));
    viewer.querySelector('.next').addEventListener('click',()=>show(current+1));
    viewer.addEventListener('click',event=>{if(event.target===viewer||event.target.classList.contains('media-viewer-stage'))close();});
    viewer.addEventListener('keydown',event=>{if(event.key==='ArrowLeft')show(current-1);if(event.key==='ArrowRight')show(current+1);});
    viewer.addEventListener('close',()=>{viewer.querySelector('.media-viewer-stage').innerHTML='';});
  }
  function show(index){
    if(!items.length)return;
    current=(index+items.length)%items.length;
    const url=items[current];
    viewer.querySelector('.media-viewer-stage').innerHTML=isVideo(url)?`<video src="${esc(url)}" controls autoplay playsinline></video>`:`<img src="${esc(url)}" alt="">`;
    viewer.querySelector('.media-viewer-count').textContent=items.length>1?`${current+1} of ${items.length}`:'';
    viewer.querySelectorAll('.media-viewer-nav').forEach(button=>{button.hidden=items.length<2;});
  }
  function close(){if(viewer?.open)viewer.close();}
  window.openMediaViewer=function(urls,index=0){
    if(!viewer)build();
    items=urls;show(index);
    if(!viewer.open)viewer.showModal();
  };

  document.addEventListener('click',event=>{
    const thumb=event.target.closest('.media-thumb');if(!thumb)return;
    const strip=thumb.closest('[data-media]');if(!strip)return;
    event.preventDefault();event.stopPropagation();
    try{openMediaViewer(JSON.parse(strip.dataset.media),+thumb.dataset.mediaIndex||0);}catch(error){}
  },true);

  const style=document.createElement('style');
  style.textContent=`
.media-thumbs{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.media-thumb{position:relative;width:72px;height:72px;padding:0;border:1px solid var(--border,rgba(0,0,0,.1));border-radius:8px;overflow:hidden;background:var(--surface-3,#eee);cursor:zoom-in;flex:none}
.media-thumb img,.media-thumb video{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}
.media-thumb:hover{filter:brightness(.92)}
.media-thumb:focus-visible{outline:2px solid var(--accent,#2f6db3);outline-offset:2px}
.media-thumb-play{position:absolute;inset:0;margin:auto;width:26px;height:26px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;font-size:11px;display:grid;place-items:center;padding-left:2px}
.media-thumb-more{position:absolute;inset:0;background:rgba(0,0,0,.55);color:#fff;font-weight:600;display:grid;place-items:center}
.media-thumbs.small .media-thumb{width:44px;height:44px;border-radius:6px}
.media-thumbs.small{margin:6px 0 0}
.media-thumbs.large .media-thumb{width:120px;height:120px;border-radius:10px}
.media-viewer{width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:rgba(10,12,16,.92);color:#fff}
.media-viewer::backdrop{background:rgba(10,12,16,.6)}
.media-viewer-stage{position:absolute;inset:0;display:grid;place-items:center;padding:56px 64px}
.media-viewer-stage img,.media-viewer-stage video{max-width:100%;max-height:calc(100vh - 112px);border-radius:8px;background:#000}
.media-viewer-close,.media-viewer-nav{position:absolute;border:0;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;cursor:pointer;display:grid;place-items:center}
.media-viewer-close:hover,.media-viewer-nav:hover{background:rgba(255,255,255,.26)}
.media-viewer-close{top:calc(14px + env(safe-area-inset-top,0px));right:14px;width:40px;height:40px;font-size:26px;line-height:1}
.media-viewer-nav{top:50%;transform:translateY(-50%);width:44px;height:44px;font-size:28px;line-height:1}
.media-viewer-nav[hidden]{display:none}.media-viewer-nav.prev{left:12px}.media-viewer-nav.next{right:12px}
.media-viewer-count{position:absolute;bottom:calc(16px + env(safe-area-inset-bottom,0px));left:0;right:0;text-align:center;font-size:13px;opacity:.8}
@media (max-width:600px){.media-viewer-stage{padding:56px 8px}.media-viewer-nav{top:auto;bottom:calc(8px + env(safe-area-inset-bottom,0px));transform:none}}
`;
  document.head.appendChild(style);
})();
