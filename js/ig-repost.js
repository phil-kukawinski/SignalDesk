// Repost from Instagram, with credit: browse a public Business or Creator account's recent posts
// (through a connected Instagram account), pick one, confirm you have permission, and its photos
// or video are copied into SignalDesk and loaded into the Publishing Studio with a credit line.
const IG_RECENT_KEY='signaldesk-ig-repost-recent';
let igBrowse={username:'',account:null,posts:[],next:null,picked:null,busy:false};
function igRecent(){try{const list=JSON.parse(localStorage.getItem(IG_RECENT_KEY)||'[]');return Array.isArray(list)?list.filter(name=>typeof name==='string').slice(0,8):[];}catch{return[];}}
function rememberIgAccount(username){try{localStorage.setItem(IG_RECENT_KEY,JSON.stringify([username,...igRecent().filter(name=>name!==username)].slice(0,8)));}catch{}}
function renderIgRecent(){const list=igRecent();$('#igr-recent').innerHTML=list.length?`<span>Recent:</span>${list.map(name=>`<button type="button" class="chip-button" data-igr-recent="${escapeHtml(name)}">@${escapeHtml(name)}</button>`).join('')}`:'';}
function openIgRepost(){if(!cloudFeaturesAvailable()){toast('Sign in to browse Instagram accounts.');return;}$('#igr-message').textContent='';renderIgRecent();if(!igBrowse.picked)showIgGrid();$('#igr-dialog').showModal();$('#igr-username').focus();}
const igCount=value=>value===null||value===undefined?'':Number(value).toLocaleString('en-US');
const IG_KIND_LABEL={carousel:'Carousel',reel:'Reel',video:'Video',image:''};
function igCardHtml(post,index){const label=IG_KIND_LABEL[post.kind]||'';return`<figure class="stock-card igr-card${post.available?'':' igr-unavailable'}"><button type="button" class="stock-pick" data-igr-post="${index}" ${post.available?'':'disabled'} aria-label="${post.available?'Repost this':'Can’t be reposted'}${post.caption?`: ${escapeHtml(post.caption.slice(0,80))}`:''}">${post.thumb?`<img src="${escapeHtml(post.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}${label?`<span class="igr-kind">${label}</span>`:''}</button><figcaption>${post.available?`${post.likes!==null?`♥ ${igCount(post.likes)}`:''}${post.comments!==null?` · 💬 ${igCount(post.comments)}`:''}${post.timestamp?` · ${new Date(post.timestamp).toLocaleDateString('en-US',{month:'short',day:'numeric'})}`:''}`:'Instagram doesn’t share this one (often Reels with licensed music).'}</figcaption></figure>`;}
function renderIgAccount(){const account=igBrowse.account;$('#igr-account').innerHTML=account?`<div class="igr-account">${account.picture?`<img src="${escapeHtml(account.picture)}" alt="" referrerpolicy="no-referrer">`:''}<div><b>${escapeHtml(account.name||account.username)}</b><small>@${escapeHtml(account.username)}${account.followers!==null?` · ${igCount(account.followers)} followers`:''}${account.posts!==null?` · ${igCount(account.posts)} posts`:''}</small></div></div>`:'';}
function showIgGrid(){igBrowse.picked=null;$('#igr-browse').hidden=false;$('#igr-confirm').hidden=true;$('#igr-go').hidden=true;$('#igr-back').hidden=true;$('#igr-more').hidden=!igBrowse.next;}
async function browseIgAccount(more=false){if(igBrowse.busy)return;const message=$('#igr-message'),grid=$('#igr-results');if(!more){const username=$('#igr-username').value.trim().replace(/^@/,'').toLowerCase();if(!/^[a-z0-9._]{1,30}$/.test(username)){message.textContent='Enter an Instagram username, like natgeo.';return;}igBrowse={username,account:null,posts:[],next:null,picked:null,busy:false};grid.innerHTML='';renderIgAccount();}
  igBrowse.busy=true;message.textContent=more?'Loading more…':`Looking up @${igBrowse.username}…`;$('#igr-more').hidden=true;
  try{const data=await callSocialApi({action:'ig-browse',username:igBrowse.username,clientId:selectedClient('#client-select')?.id,...(more?{after:igBrowse.next}:{})});
    if(data.status==='unavailable'){message.textContent=data.reason;return;}
    if(data.status!=='found'){message.textContent=`@${igBrowse.username} wasn’t found. Only public Business and Creator accounts can be browsed. Personal accounts can’t.`;return;}
    rememberIgAccount(data.account.username);renderIgRecent();igBrowse.account=data.account;const start=igBrowse.posts.length;igBrowse.posts.push(...data.posts);igBrowse.next=data.next;renderIgAccount();
    grid.insertAdjacentHTML('beforeend',data.posts.map((post,index)=>igCardHtml(post,start+index)).join(''));
    message.textContent=igBrowse.posts.length?'Choose a post to repost it with credit.':'This account hasn’t posted anything yet.';showIgGrid();}
  catch(error){message.textContent=error.message;}finally{igBrowse.busy=false;}}
function pickIgPost(index){const post=igBrowse.posts[index];if(!post?.available)return;igBrowse.picked=post;const name=igBrowse.account.username;
  $('#igr-browse').hidden=true;$('#igr-confirm').hidden=false;$('#igr-go').hidden=false;$('#igr-back').hidden=false;$('#igr-more').hidden=true;$('#igr-message').textContent='';
  $('#igr-picked').innerHTML=`<div class="igr-picked-media">${post.items.slice(0,4).map(item=>`<img src="${escapeHtml(item.thumb||item.url)}" alt="" referrerpolicy="no-referrer">`).join('')}${post.items.length>4?`<span>+${post.items.length-4}</span>`:''}</div><div class="igr-picked-text"><b>@${escapeHtml(name)}</b>${post.items.length>1?` · ${post.items.length} items`:''}<p>${escapeHtml(post.caption.slice(0,400))||'<i>No caption</i>'}${post.caption.length>400?'…':''}</p>${post.permalink?`<a href="${escapeHtml(post.permalink)}" target="_blank" rel="noopener">Open on Instagram</a>`:''}</div>`;
  $('#igr-caption').checked=Boolean(post.caption);$('#igr-caption').disabled=!post.caption;$('#igr-tag-row').hidden=post.items.length>1;$('#igr-tag').checked=post.items.length===1;
  $$('.igr-name').forEach(node=>{node.textContent=`@${name}`;});$('#igr-permission').checked=false;$('#igr-go').disabled=true;}
// The post copy with credit: their caption (if kept), then "📷 @name on Instagram".
function igRepostText(caption,username,keepCaption){const credit=`📷 @${username} on Instagram`;return keepCaption&&caption.trim()?`${caption.trim()}\n\n${credit}`:credit;}
async function runIgRepost(){const post=igBrowse.picked,name=igBrowse.account?.username;if(!post||!name||igBrowse.busy)return;if(!$('#igr-permission').checked){$('#igr-message').textContent=`Confirm you have @${name}’s permission first.`;return;}
  igBrowse.busy=true;const button=$('#igr-go'),message=$('#igr-message');button.disabled=true;button.textContent='Copying…';message.textContent=post.items.some(item=>item.type==='video')?'Copying the video into SignalDesk. Large videos can take a minute.':'Copying into SignalDesk…';
  try{const{media}=await callSocialApi({action:'ig-repost',permission:true,media:post.items.map(item=>({url:item.url,type:item.type}))});
    const text=igRepostText(post.caption,name,$('#igr-caption').checked),field=$('#post-copy');
    uploadedMedia=media.map(item=>({path:item.path,url:item.url,name:item.name,type:item.type,alt:'',source:'instagram',credit:{text:`@${name} on Instagram`,photoUrl:post.permalink||''}}));sharedMediaPreview=null;
    if(activeVariant!=='all')selectVariant('all');
    field.value=field.value.trim()?`${field.value.replace(/\s+$/,'')}\n\n${text}`:text;field.dispatchEvent(new Event('input',{bubbles:true}));
    if($('#igr-tag').checked&&post.items.length===1){const tags=String(postOptions.tags||'').split(/[,\s]+/).filter(Boolean);if(!tags.map(tag=>tag.replace(/^@/,'').toLowerCase()).includes(name))postOptions.tags=[...tags,name].join(', ');fillPostOptionInputs();}
    updatePreview();if(typeof renderMediaTray==='function')renderMediaTray();scheduleDraftSave();$('#igr-dialog').close();igBrowse.picked=null;
    toast(`@${name}’s post is in the Publishing Studio with credit. Check it, then schedule it.`);}
  catch(error){message.textContent=error.message;}finally{igBrowse.busy=false;button.textContent='Repost with credit';button.disabled=!$('#igr-permission').checked;}}
$('#igr-button')?.addEventListener('click',openIgRepost);
$('#igr-form')?.addEventListener('submit',event=>{event.preventDefault();browseIgAccount();});
$('#igr-recent')?.addEventListener('click',event=>{const chip=event.target.closest('[data-igr-recent]');if(!chip)return;$('#igr-username').value=chip.dataset.igrRecent;browseIgAccount();});
$('#igr-results')?.addEventListener('click',event=>{const pick=event.target.closest('[data-igr-post]');if(pick)pickIgPost(+pick.dataset.igrPost);});
$('#igr-more')?.addEventListener('click',()=>browseIgAccount(true));
$('#igr-back')?.addEventListener('click',()=>{showIgGrid();$('#igr-message').textContent='Choose a post to repost it with credit.';});
$('#igr-permission')?.addEventListener('change',event=>{$('#igr-go').disabled=!event.target.checked;});
$('#igr-go')?.addEventListener('click',runIgRepost);
$('#igr-close')?.addEventListener('click',()=>$('#igr-dialog').close());
