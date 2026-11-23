// Social Inbox → Messages: direct messages to connected Facebook Pages and Instagram accounts, read live
// from Meta (SignalDesk doesn't store them). Meta lets a business answer within 24 hours of the person's
// last message, so each conversation that needs a reply shows how long is left.
const MESSAGES_TTL=2*60000;
let messagesCache={key:null,at:0,data:null,loading:false,error:''},activeDm=null,inboxClient=null;
const MESSAGES_CLIENT_KEY='signaldesk-messages-client',MESSAGES_FOLDER_KEY='signaldesk-messages-folder';
// Unread: their message is the latest and nobody has answered. Inbox: everything not archived. Archived: put away here (Meta's copy is unchanged).
const MESSAGE_FOLDERS=[['unread','Unread'],['inbox','Inbox'],['archived','Archived']];
let messagesFolder='inbox';
try{inboxClient=localStorage.getItem(MESSAGES_CLIENT_KEY);messagesFolder=MESSAGE_FOLDERS.some(([key])=>key===localStorage.getItem(MESSAGES_FOLDER_KEY))?localStorage.getItem(MESSAGES_FOLDER_KEY):'inbox';}catch{/* private window: start from the default */}
function inMessageFolder(item,folder){return folder==='archived'?item.archived:!item.archived&&(folder==='inbox'||item.needsReply);}

function messagesNeedingReply(clientId=null){return(messagesCache.data?.conversations||[]).filter(item=>item.needsReply&&item.canReply&&!item.archived&&(clientId===null||item.clientId===clientId)).length;}
// Clients with a Facebook or Instagram account, in the workspace's client order.
// One client at a time in the Social Inbox, for both Messages and Comments: clients with a Facebook or Instagram
// account, or with posts SignalDesk published, in the workspace's client order.
function inboxClients(){const byClient=messagesCache.data?.byClient||{},posted=new Set(commentablePosts().map(post=>post.clientId));return clients.filter(client=>byClient[client.id]||posted.has(client.id));}
// The client shown: the one picked last, else Home's client, else one with messages waiting, else the first.
function currentInboxClient(){const list=inboxClients(),has=id=>list.some(client=>client.id===id);if(has(inboxClient))return inboxClient;const home=homeClientId();if(has(home))return home;return(list.find(client=>messagesNeedingReply(client.id))||list[0])?.id||null;}
function pickMessagesFolder(folder){messagesFolder=folder;try{localStorage.setItem(MESSAGES_FOLDER_KEY,folder);}catch{/* not remembered */}renderMessagesPanel();}
async function archiveConversation(connectionId,conversationId,archived){
  const item=findConversation(connectionId,conversationId);
  try{await callSocialApi({action:'message-state',connectionId,conversationId,archived});if(item)item.archived=archived;toast(archived?'Archived. It comes back to the inbox if they write again.':'Moved back to the inbox.');renderMessagesPanel();renderInboxCount();openConversation(connectionId,conversationId);}
  catch(error){toast(error.message);}
}
function pickInboxClient(id){inboxClient=id;try{localStorage.setItem(MESSAGES_CLIENT_KEY,id);}catch{/* not remembered */}
  activeDm=null;const thread=$('#message-thread');if(thread)thread.innerHTML='<p class="option-hint">Choose a conversation to read it and reply.</p>';
  activeCommentJob=null;const comments=$('#comment-thread');if(comments)comments.innerHTML='<p class="option-hint">Choose a post to see its comments.</p>';
  renderMessagesPanel();renderCommentsPanel();loadOpenComments();}
// Each tab counts unread messages, plus comments needing a reply once they've been checked for that client.
function renderInboxTabs(){
  const tabs=$('#inbox-client-tabs');if(!tabs)return;const list=inboxClients(),current=currentInboxClient();tabs.hidden=list.length<2;if(tabs.hidden)return;
  tabs.innerHTML=list.map(client=>{const waiting=(messagesCache.data?.conversations||[]).filter(item=>item.clientId===client.id&&inMessageFolder(item,'unread')).length+(openCommentsCache.key===client.id?openCommentCount():0);
    return`<button type="button" role="tab" aria-selected="${client.id===current}" class="${client.id===current?'active':''}" data-inbox-client="${escapeHtml(client.id)}"><span class="client-dot" style="background:${escapeHtml(client.color||'var(--accent)')}"></span>${escapeHtml(client.name)}${waiting?` <span class="count-badge">${waiting}</span>`:''}</button>`;}).join('');
}
function findConversation(connectionId,conversationId){return(messagesCache.data?.conversations||[]).find(item=>item.connectionId===connectionId&&item.id===conversationId);}
function replyWindowText(item){if(!item?.needsReply||!item.replyBy)return'';const left=Date.parse(item.replyBy)-Date.now();if(left<=0||!item.canReply)return'Reply window closed';const hours=Math.floor(left/3600000);return hours>=1?`${hours} h left to reply`:`${Math.max(1,Math.round(left/60000))} min left to reply`;}
const ATTACHMENT_LABELS={photo:'Photo',video:'Video',file:'File',share:'Shared a post',sticker:'Sticker','story-reply':'Replied to your story','story-mention':'Mentioned you in their story',unsupported:'A message type Meta doesn’t share with other apps',unknown:'A photo, video, or file'};
function attachmentHtml(attachment,alone){if(!attachment)return'';const label=ATTACHMENT_LABELS[attachment.kind]||ATTACHMENT_LABELS.unknown,name=attachment.name?` · ${escapeHtml(attachment.name)}`:'';const picture=attachment.preview&&['photo','video','sticker'].includes(attachment.kind)?`<img class="message-media" src="${escapeHtml(attachment.preview)}" alt="${escapeHtml(label)}" loading="lazy">`:'';const link=attachment.url?` <a href="${escapeHtml(attachment.url)}" target="_blank" rel="noopener">Open ↗</a>`:alone&&!picture?' <span>Open the conversation in the app to see it.</span>':'';return`<span class="message-attachment">${picture}<i>${escapeHtml(label)}${name}</i>${link}</span>`;}
function networkGlyph(platform){return escapeHtml(SOCIAL_NETWORKS.find(item=>item[0]===platform)?.[2]||'•');}

async function loadMessages(force=false){
  const panel=$('#messages-panel');if(!panel)return;const show=cloudFeaturesAvailable()&&currentRole==='admin';panel.hidden=!show;if(!show)return;
  const key='all';
  if(!force&&messagesCache.key===key&&Date.now()-messagesCache.at<MESSAGES_TTL){renderMessagesPanel();return;}
  if(messagesCache.loading)return;messagesCache.loading=true;renderMessagesPanel();
  try{const data=await callSocialApi({action:'conversations'});messagesCache={key,at:Date.now(),data,loading:false,error:''};}
  catch(error){messagesCache={...messagesCache,key,at:Date.now(),loading:false,error:error.message};}
  renderMessagesPanel();renderInboxCount();
}

function conversationButtonHtml(item){
  const active=activeDm?.conversationId===item.id&&activeDm?.connectionId===item.connectionId;
  const client=clients.find(entry=>entry.id===item.clientId)?.name||'Client',last=item.last,windowText=replyWindowText(item);
  const preview=last?`${last.mine?'You: ':''}${last.text||'Sent a photo, video, or file'}`:'';
  return`<button type="button" class="comment-post conversation${active?' active':''}${item.needsReply?' unread':''}" data-conversation="${escapeHtml(item.id)}" data-connection="${escapeHtml(item.connectionId)}"><span class="platform-icon ${escapeHtml(item.platform)}">${networkGlyph(item.platform)}</span><span><b>${escapeHtml(item.with?.name||'Someone')}</b><small>${escapeHtml(client)} · ${escapeHtml(platformLabel(item.platform))}${item.updatedAt?` · ${escapeHtml(timeAgo(item.updatedAt))}`:''}</small>${preview?`<small class="conversation-last">${escapeHtml(preview)}</small>`:''}${windowText?`<span class="comment-state ${item.canReply?'open':'done'}">${escapeHtml(windowText)}</span>`:''}</span></button>`;
}

function renderMessagesPanel(){
  const panel=$('#messages-panel');if(!panel||panel.hidden)return;
  const{data,loading,error}=messagesCache,list=$('#conversation-list'),notes=$('#messages-notes'),refresh=$('#refresh-messages'),count=messagesNeedingReply();
  if(refresh){refresh.disabled=loading;refresh.innerHTML=`${icon('refresh')}${loading?'Checking…':'Check again'}`;}
  const badge=$('#messages-count');if(badge){badge.textContent=String(count);badge.hidden=!count;}
  if(error){notes.innerHTML=`<p class="option-hint">${escapeHtml(error)}</p>`;list.innerHTML='';return;}
  if(!data){notes.innerHTML='';list.innerHTML=skeletonRows(3);return;}
  const current=currentInboxClient();renderInboxTabs();
  notes.innerHTML=(data.problems||[]).filter(item=>item.clientId===current).map(item=>`<p class="messages-problem"><b>${escapeHtml(clients.find(entry=>entry.id===item.clientId)?.name||'Client')} · ${escapeHtml(platformLabel(item.platform))}${item.account?` ${escapeHtml(item.account)}`:''}</b> ${escapeHtml(item.error)}</p>`).join('');
  const layout=$('.post-comments-layout',panel),problems=data.problems||[];if(layout)layout.hidden=false;
  if(!data.accounts){list.innerHTML='<p class="option-hint">Connect a Facebook Page or Instagram account in Social Accounts to read and answer its messages here.</p>';return;}
  // No account allows messages yet (the usual state before Meta approves them): one calm line, not a warning per account.
  const mine=problems.filter(item=>item.clientId===current);
  if(mine.length&&mine.length===(data.byClient?.[current]||0)&&mine.every(item=>item.permission)){notes.innerHTML='<p class="option-hint">Messages aren’t turned on for your connected accounts yet. Once Meta allows them, reconnect your Facebook and Instagram accounts in Social Accounts and allow messages.</p>';if(layout)layout.hidden=true;return;}
  const forClient=(data.conversations||[]).filter(item=>item.clientId===current),items=forClient.filter(item=>inMessageFolder(item,messagesFolder));
  const unread=forClient.filter(item=>inMessageFolder(item,'unread')).length;
  const folders=`<div class="view-tabs message-folders" role="tablist" aria-label="Show">${MESSAGE_FOLDERS.map(([key,label])=>`<button type="button" role="tab" aria-selected="${key===messagesFolder}" class="${key===messagesFolder?'active':''}" data-message-folder="${key}">${label}${key==='unread'&&unread?` <span class="count-badge">${unread}</span>`:''}</button>`).join('')}</div>`;
  const empty={unread:'Nothing unread. Every conversation has an answer.',inbox:forClient.length?'Everything here is archived.':'No messages yet. When someone messages this client’s Page or Instagram account, it shows up here.',archived:'Nothing archived. Archive a conversation to put it away; it comes back if they write again.'}[messagesFolder];
  list.innerHTML=folders+(items.length?items.map(conversationButtonHtml).join(''):`<p class="option-hint">${empty}</p>`);
}

function messageThreadHtml(item,data){
  const person=data.with?.name||item?.with?.name||'Someone',lastTheirs=[...data.messages].reverse().find(message=>!message.mine);
  const bubbles=data.messages.length?data.messages.map(message=>`<div class="message-bubble${message.mine?' mine':''}"><p>${message.text?escapeHtml(message.text):''}${attachmentHtml(message.attachment,!message.text)}</p><small>${message.mine?'You · ':''}${message.at?escapeHtml(timeAgo(message.at)):''}</small></div>`).join(''):'<p class="option-hint">No messages to show.</p>';
  const limit=item?.platform==='instagram'?1000:2000,closed=item?.needsReply&&!item.canReply;
  replyContext.set(item?.id||'',{text:lastTheirs?.text||'',author:person,jobId:''});
  const form=closed?`<p class="option-hint">It’s been more than 24 hours since ${escapeHtml(person)} last wrote. Meta only lets a business answer from other apps within 24 hours, so reply in the ${item.platform==='instagram'?'Instagram':'Facebook'} app.</p>`
    :`<form class="comment-reply-form message-reply-form" data-message-to="${escapeHtml(item?.id||'')}" data-connection="${escapeHtml(item?.connectionId||'')}" data-client="${escapeHtml(item?.clientId||'')}" data-author="${escapeHtml(firstName(person))}"><button type="button" class="icon-button" data-reply-templates title="Reply templates" aria-label="Reply templates" aria-haspopup="menu">${icon('file')}</button><button type="button" class="icon-button" data-suggest-reply title="Suggest a reply (AI)" aria-label="Suggest a reply">${icon('sparkles')}</button><input class="field" maxlength="${limit}" placeholder="Message…" aria-label="Message ${escapeHtml(person)}"><button class="secondary-button" type="submit">Send</button></form>${item?.needsReply?`<small class="message-window">${escapeHtml(replyWindowText(item))}</small>`:''}`;
  const archive=item?`<button type="button" class="text-button message-archive" data-archive-conversation="${item.archived?'0':'1'}">${icon(item.archived?'inbox':'archive')}${item.archived?'Move to inbox':'Archive'}</button>`:'';
  return`<div class="message-head"><span class="platform-icon ${escapeHtml(item?.platform||'')}">${networkGlyph(item?.platform)}</span><b>${escapeHtml(person)}</b><small>${escapeHtml(item?.account||'')}</small>${archive}</div><div class="message-list">${bubbles}</div>${form}`;
}

async function openConversation(connectionId,conversationId){
  activeDm={connectionId,conversationId};renderMessagesPanel();
  const box=$('#message-thread'),item=findConversation(connectionId,conversationId);box.innerHTML='<p class="option-hint">Loading messages…</p>';
  try{const data=await callSocialApi({action:'conversation',connectionId,conversationId});if(activeDm?.conversationId!==conversationId)return;box.innerHTML=messageThreadHtml(item,data);const list=$('.message-list',box);if(list)list.scrollTop=list.scrollHeight;}
  catch(error){if(activeDm?.conversationId===conversationId)box.innerHTML=`<p class="option-hint">${escapeHtml(error.message)}</p>`;}
}

$('#conversation-list')?.addEventListener('click',event=>{const folder=event.target.closest('[data-message-folder]');if(folder){pickMessagesFolder(folder.dataset.messageFolder);return;}const button=event.target.closest('[data-conversation]');if(button)openConversation(button.dataset.connection,button.dataset.conversation);});
$('#message-thread')?.addEventListener('click',event=>{const button=event.target.closest('[data-archive-conversation]');if(button&&activeDm)archiveConversation(activeDm.connectionId,activeDm.conversationId,button.dataset.archiveConversation==='1');});
$('#refresh-messages')?.addEventListener('click',()=>loadMessages(true));
$('#inbox-client-tabs')?.addEventListener('click',event=>{const tab=event.target.closest('[data-inbox-client]');if(tab)pickInboxClient(tab.dataset.inboxClient);});
document.addEventListener('submit',async event=>{
  const form=event.target.closest('form[data-message-to]');if(!form)return;event.preventDefault();
  const input=$('input',form),text=input.value.trim(),{connection,messageTo}=form.dataset;if(!text)return;
  const button=$('button[type=submit]',form);button.disabled=true;
  try{await callSocialApi({action:'send-message',connectionId:connection,conversationId:messageTo,text});toast('Message sent.');
    const item=findConversation(connection,messageTo);if(item){item.last={text,mine:true,at:new Date().toISOString()};item.updatedAt=item.last.at;item.needsReply=false;}
    renderMessagesPanel();renderInboxCount();openConversation(connection,messageTo);}
  catch(error){toast(error.message);button.disabled=false;}
});
