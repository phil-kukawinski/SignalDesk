// Social Inbox: comments still waiting for a reply across recent posts (Needs a reply), marking a
// comment done, and saved reply templates ({name} fills in the commenter's first name).
// Checking reads each recent post's comments from the network, so it's kept to every 15 minutes (Check again forces it).
const OPEN_COMMENTS_TTL=15*60000;
const STARTER_REPLIES=[
  {id:'starter-thanks',name:'Thank you',text:'Thanks so much, {name}! We really appreciate it.'},
  {id:'starter-dm',name:'Sent you a message',text:'Hi {name}, thanks for reaching out! We just sent you a message with the details.'},
  {id:'starter-link',name:'Link in bio',text:'Hi {name}! You can find it through the link in our bio.'},
  {id:'starter-looking',name:'Looking into it',text:'Thanks for letting us know, {name}. We’re looking into it and will follow up soon.'}
];
let replyTemplates=[],openCommentsCache={key:null,at:0,data:null,loading:false,error:''};

// Reply templates are shared with the team like snippets (deleted ones are kept as tombstones so merges don't bring them back).
function activeReplyTemplates(clientId=''){const saved=replyTemplates.filter(item=>!item.deleted&&(!item.clientId||item.clientId===clientId));return saved.length?saved:replyTemplates.some(item=>!item.deleted)?[]:STARTER_REPLIES;}
// Without a name, "Thanks, {name}!" becomes "Thanks!" rather than leaving a gap.
function fillReplyName(text,name){return name?text.replace(/\{name\}/g,name):text.replace(/,\s*\{name\}/g,'').replace(/\s*\{name\}/g,'');}
function firstName(author){const name=String(author||'').replace(/^@/,'').trim();return /user$|member$/i.test(name)||name==='You'?'':name.split(/\s+/)[0];}

function commentItemHtml(comment,jobId){
  const state=comment.mine?'':comment.state==='done'?'<span class="comment-state done">Marked done</span>':comment.answered?'<span class="comment-state answered">Answered</span>':'<span class="comment-state open">Needs a reply</span>';
  const toggle=comment.mine||(comment.answered&&comment.state!=='done')?'':`<button type="button" class="text-button" data-comment-done="${escapeHtml(comment.id)}" data-job="${escapeHtml(jobId)}" data-done="${comment.state==='done'?'0':'1'}">${comment.state==='done'?'Reopen':'Mark done'}</button>`;
  return `<div class="comment-item${comment.answered?' answered':''}"><div class="comment-head"><b>${escapeHtml(comment.author)}</b>${state}${toggle}</div><p>${escapeHtml(comment.text)}</p><small>${comment.at?timeAgo(comment.at):''}</small>${(comment.replies||[]).map(reply=>`<div class="comment-reply${reply.mine?' mine':''}"><b>${escapeHtml(reply.author)}</b><p>${escapeHtml(reply.text)}</p></div>`).join('')}${comment.mine?'':replyFormHtml(comment,jobId)}</div>`;
}
function replyFormHtml(comment,jobId,withJob=false){replyContext.set(String(comment.id),{text:comment.text||comment.message||'',author:comment.author||'',jobId});return `<form class="comment-reply-form" data-reply-to="${escapeHtml(comment.id)}"${withJob?` data-job="${escapeHtml(jobId)}"`:''} data-client="${escapeHtml(jobClientId(jobId)||'')}" data-author="${escapeHtml(firstName(comment.author))}"><button type="button" class="icon-button" data-reply-templates title="Reply templates" aria-label="Reply templates" aria-haspopup="menu">${icon('file')}</button><button type="button" class="icon-button" data-suggest-reply title="Suggest a reply (AI)" aria-label="Suggest a reply">${icon('sparkles')}</button><input class="field" maxlength="2000" placeholder="Reply…" aria-label="Reply to ${escapeHtml(comment.author)}"><button class="secondary-button" type="submit">Reply</button></form>`;}

// --- Needs a reply ---
async function loadOpenComments(force=false){
  if(!cloudFeaturesAvailable()||currentRole!=='admin')return null;const key=homeClientId()||'';
  if(!force&&openCommentsCache.key===key&&Date.now()-openCommentsCache.at<OPEN_COMMENTS_TTL)return openCommentsCache.data;
  if(openCommentsCache.loading)return openCommentsCache.data;
  openCommentsCache.loading=true;renderNeedsReply();
  try{const data=await callSocialApi({action:'open-comments',clientId:key});openCommentsCache={key,at:Date.now(),data,loading:false,error:''};}
  catch(error){openCommentsCache={...openCommentsCache,key,at:Date.now(),loading:false,error:/comment_states|schema/.test(error.message)?'The comment inbox needs a quick database update. Run supabase/schema.sql in Supabase.':error.message};}
  renderNeedsReply();renderCommentsPanel();renderCommandCenter();return openCommentsCache.data;
}
function openCommentCount(){return openCommentsCache.data?.comments?.length||0;}
function markCommentAnswered(jobId,commentId){const data=openCommentsCache.data;if(!data)return;const before=data.comments.length;data.comments=data.comments.filter(item=>!(item.jobId===jobId&&item.id===commentId));if(data.comments.length!==before&&data.counts[jobId])data.counts[jobId]-=1;renderNeedsReply();renderCommentsPanel();renderInboxCount();}
function renderInboxCount(){const badge=$('.nav-item[data-view="inbox"] .nav-count');if(!badge)return;const count=openCommentCount()+(typeof messagesNeedingReply==='function'?messagesNeedingReply():0);badge.textContent=count>99?'99+':String(count);badge.hidden=!count;}
function renderNeedsReply(){
  const panel=$('#post-comments-panel');if(!panel||panel.hidden)return;let box=$('#needs-reply');
  if(!box){box=document.createElement('section');box.id='needs-reply';box.className='needs-reply';box.setAttribute('aria-label','Comments that need a reply');$('.panel-header',panel).insertAdjacentElement('afterend',box);}
  const {data,loading,error}=openCommentsCache,list=data?.comments||[];
  const head=`<div class="needs-reply-head"><h3>Needs a reply${list.length?` <span class="count-badge">${list.length}</span>`:''}</h3><button type="button" class="text-button" data-refresh-open-comments ${loading?'disabled':''}>${icon('refresh')}${loading?'Checking…':'Check again'}</button></div>`;
  if(error){box.innerHTML=head+`<p class="option-hint">${escapeHtml(error)}</p>`;return;}
  if(!data){box.innerHTML=head+skeletonRows(2);return;}
  box.innerHTML=head+(list.length?`<div class="needs-reply-list">${list.slice(0,25).map(item=>`<article class="needs-reply-item"><div class="comment-head"><span class="platform-icon ${escapeHtml(item.platform)}" aria-hidden="true">${escapeHtml(SOCIAL_NETWORKS.find(entry=>entry[0]===item.platform)?.[2]||'•')}</span><b>${escapeHtml(item.author)}</b><small>on “${escapeHtml(item.postTitle.slice(0,60))}” · ${item.at?timeAgo(item.at):''}</small><button type="button" class="text-button" data-comment-done="${escapeHtml(item.id)}" data-job="${escapeHtml(item.jobId)}" data-done="1">Mark done</button><button type="button" class="text-button" data-comment-job="${escapeHtml(item.jobId)}">View thread</button></div><p>${escapeHtml(item.text)}</p>${replyFormHtml(item,item.jobId,true)}</article>`).join('')}</div>${list.length>25?`<p class="option-hint">And ${list.length-25} more. Answer these first, then check again.</p>`:''}`:`<p class="option-hint">${data.checked?`All caught up: no unanswered comments on the ${data.checked} most recent post${data.checked===1?'':'s'} with comments from the last two weeks.`:'Comments on posts SignalDesk published in the last two weeks show up here until someone answers them.'}${data.failed?` ${data.failed} post${data.failed===1?'':'s'} couldn’t be checked (the account may need reconnecting).`:''}</p>`);
}
async function setCommentDone(jobId,commentId,done){
  try{await callSocialApi({action:'comment-state',jobId,commentId,done});}catch(error){toast(error.message);return;}
  if(done){const item=openCommentsCache.data?.comments.find(entry=>entry.jobId===jobId&&entry.id===commentId);markCommentAnswered(jobId,commentId);showUndo('Comment marked done.',{onUndo:async()=>{await callSocialApi({action:'comment-state',jobId,commentId,done:false}).catch(error=>toast(error.message));if(item&&openCommentsCache.data){openCommentsCache.data.comments.push(item);openCommentsCache.data.comments.sort((a,b)=>Date.parse(b.at||0)-Date.parse(a.at||0));openCommentsCache.data.counts[jobId]=(openCommentsCache.data.counts[jobId]||0)+1;renderNeedsReply();renderCommentsPanel();renderInboxCount();}if(activeCommentJob===jobId)openJobComments(jobId);},undoneMessage:'Back in Needs a reply.'});}
  else loadOpenComments(true);
  if(activeCommentJob===jobId)openJobComments(jobId);
}
document.addEventListener('click',event=>{
  const done=event.target.closest('[data-comment-done]');if(done){setCommentDone(done.dataset.job,done.dataset.commentDone,done.dataset.done==='1');return;}
  if(event.target.closest('[data-refresh-open-comments]')){loadOpenComments(true);return;}
  const thread=event.target.closest('#needs-reply [data-comment-job]');if(thread){openJobComments(thread.dataset.commentJob);$('#comment-thread')?.scrollIntoView({behavior:'smooth',block:'start'});}
});

// Unanswered-comment counts on each post in the list.
function markOpenCommentCounts(){const counts=openCommentsCache.data?.counts||{};$$('#comment-post-list [data-comment-job]').forEach(button=>{const count=counts[button.dataset.commentJob];if(count)button.insertAdjacentHTML('beforeend',`<span class="count-badge" title="${count} need${count===1?'s':''} a reply">${count}</span>`);});renderNeedsReply();}

// Needs your attention on the Command Center.
// Command Center: comments waiting for a reply go ahead of the approval items.
function addInboxAttention(items){const count=openCommentCount();if(!count)return;const at=items.findIndex(item=>item.tone==='pending');items.splice(at<0?items.length:at,0,{key:`comments:${count}`,kind:'view',view:'inbox',title:`${count} comment${count===1?'':'s'} waiting for a reply`,detail:'On posts from the last two weeks',meta:'Answer or mark done in the Social Inbox',tone:'warning'});}
function refreshInboxOnHome(){renderInboxCount();if(cloudFeaturesAvailable()&&currentRole==='admin'&&serverPosts.length&&!document.hidden&&!openCommentsCache.loading&&(openCommentsCache.key!==(homeClientId()||'')||Date.now()-openCommentsCache.at>OPEN_COMMENTS_TTL))loadOpenComments();}

// --- Reply templates menu ---
function closeReplyTemplates(){const menu=$('#reply-template-menu');if(menu)menu.hidden=true;}
function openReplyTemplates(button){
  let menu=$('#reply-template-menu');if(!menu){menu=document.createElement('div');menu.id='reply-template-menu';menu.className='composer-menu reply-template-menu';menu.setAttribute('role','menu');document.body.appendChild(menu);}
  const form=button.closest('form'),saved=replyTemplates.some(item=>!item.deleted);menu.dataset.form=form.dataset.replyTo;menu._form=form;
  menu.innerHTML=`<div class="composer-menu-head"><b>Reply templates</b><small>${saved?'':'Starters to try. '}{name} fills in the commenter’s first name.</small></div>${activeReplyTemplates(form.dataset.client).map(item=>`<div class="composer-menu-row"><button type="button" role="menuitem" data-use-reply="${escapeHtml(item.id)}"><b>${escapeHtml(item.name)}${item.clientId?` <span class="reply-scope">${escapeHtml(clients.find(client=>client.id===item.clientId)?.name||'One client')}</span>`:''}</b><small>${escapeHtml(item.text.slice(0,80))}${item.text.length>80?'…':''}</small></button>${saved?`<button type="button" class="icon-button" data-delete-reply="${escapeHtml(item.id)}" title="Delete" aria-label="Delete ${escapeHtml(item.name)}">×</button>`:''}</div>`).join('')}<div class="composer-menu-actions"><button type="button" class="text-button" data-save-reply>${icon('plus')}Save this reply for all clients</button>${form.dataset.client&&clients.some(client=>client.id===form.dataset.client)?`<button type="button" class="text-button" data-save-reply data-save-reply-client>${icon('plus')}Save for ${escapeHtml(clients.find(client=>client.id===form.dataset.client).name)} only</button>`:''}</div>`;
  menu.hidden=false;const box=button.getBoundingClientRect(),width=Math.min(340,window.innerWidth-24);menu.style.position='fixed';menu.style.width=`${width}px`;menu.style.left=`${Math.max(12,Math.min(box.left,window.innerWidth-width-12))}px`;const below=box.bottom+6,height=menu.offsetHeight;menu.style.top=`${below+height>window.innerHeight-12?Math.max(12,box.top-height-6):below}px`;
  menu.querySelector('[role=menuitem]')?.focus();
}
document.addEventListener('click',event=>{
  const opener=event.target.closest('[data-reply-templates]');if(opener){event.stopPropagation();const menu=$('#reply-template-menu');if(menu&&!menu.hidden&&menu._form===opener.closest('form')){closeReplyTemplates();return;}openReplyTemplates(opener);return;}
  const menu=$('#reply-template-menu');if(!menu||menu.hidden)return;if(!menu.contains(event.target)){closeReplyTemplates();return;}
  const form=menu._form,input=form&&$('input',form);if(!input?.isConnected){closeReplyTemplates();return;}
  const use=event.target.closest('[data-use-reply]');if(use){const item=activeReplyTemplates(form.dataset.client).find(entry=>entry.id===use.dataset.useReply),name=form.dataset.author;input.value=fillReplyName(item.text,name);closeReplyTemplates();input.focus();return;}
  const remove=event.target.closest('[data-delete-reply]');if(remove){const item=replyTemplates.find(entry=>entry.id===remove.dataset.deleteReply);if(item){item.deleted=true;scheduleWorkspaceSave();openReplyTemplates($('[data-reply-templates]',form));}return;}
  if(event.target.closest('[data-save-reply]')){const text=input.value.trim();if(!text){toast('Write the reply first, then save it as a template. Use {name} for the commenter’s first name.');input.focus();return;}const name=prompt('Name this reply template:');if(!name?.trim())return;const author=form.dataset.author;replyTemplates.push({id:crypto.randomUUID(),name:name.trim().slice(0,60),text:(author?text.split(author).join('{name}'):text).slice(0,2000),...(event.target.closest('[data-save-reply-client]')&&form.dataset.client?{clientId:form.dataset.client}:{}),createdAt:new Date().toISOString()});scheduleWorkspaceSave();closeReplyTemplates();toast(`Saved “${name.trim().slice(0,60)}”.${author&&text.includes(author)?` ${author} becomes {name} for next time.`:''}`);}
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('#reply-template-menu')&&!$('#reply-template-menu').hidden)closeReplyTemplates();});
// Suggested replies: two short drafts in the client's voice, to edit before sending. Uses AI help.
const replyContext=new Map();
function jobClientId(jobId){if(!jobId)return '';return serverPosts.find(post=>post.jobs?.some(job=>job.id===jobId))?.clientId||networkCache?.posts?.find?.(post=>post.jobId===jobId||post.id===jobId)?.clientId||'';}
function closeReplySuggestions(){$('#reply-suggest-menu')?.remove();}
document.addEventListener('click',async event=>{const button=event.target.closest('[data-suggest-reply]');if(!button){if(!event.target.closest('#reply-suggest-menu'))closeReplySuggestions();return;}event.stopPropagation();closeReplySuggestions();
  const form=button.closest('form'),context=replyContext.get(form.dataset.replyTo||form.dataset.messageTo)||{},post=serverPosts.find(item=>item.jobs?.some(job=>job.id===context.jobId)),job=post?.jobs.find(item=>item.id===context.jobId);
  button.disabled=true;button.classList.add('busy');
  try{const{replies}=await callSocialApi({action:'suggest-reply',clientId:form.dataset.client||'',comment:context.text,author:context.author,post:post?.text||'',network:job?platformLabel(job.platform):''});
    if(!replies.length){toast('No reply suggested. It may be spam, or best left alone.');return;}
    const menu=document.createElement('div');menu.id='reply-suggest-menu';menu.className='composer-menu reply-template-menu';menu.setAttribute('role','menu');menu.innerHTML=`<div class="composer-menu-head"><b>Suggested replies</b><small>Pick one to edit before sending.</small></div>${replies.map((reply,index)=>`<div class="composer-menu-row"><button type="button" role="menuitem" data-pick-suggestion="${index}"><small>${escapeHtml(reply)}</small></button></div>`).join('')}`;
    document.body.append(menu);const box=button.getBoundingClientRect(),width=Math.min(360,window.innerWidth-24);Object.assign(menu.style,{position:'fixed',width:`${width}px`,left:`${Math.max(12,Math.min(box.left,window.innerWidth-width-12))}px`,top:`${Math.min(box.bottom+6,window.innerHeight-menu.offsetHeight-12)}px`});
    menu.addEventListener('click',pick=>{const item=pick.target.closest('[data-pick-suggestion]');if(!item)return;const input=$('input',form);input.value=replies[Number(item.dataset.pickSuggestion)];closeReplySuggestions();input.focus();});menu.querySelector('[role=menuitem]')?.focus();}
  catch(error){toast(error.message);}finally{button.disabled=false;button.classList.remove('busy');}});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeReplySuggestions();});
