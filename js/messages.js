// Social Inbox → Messages: direct messages to connected Facebook Pages and Instagram accounts, read live
// from Meta (SignalDesk doesn't store them). Meta lets a business answer within 24 hours of the person's
// last message, so each conversation that needs a reply shows how long is left.
const MESSAGES_TTL=2*60000;
let messagesCache={key:null,at:0,data:null,loading:false,error:''},activeDm=null;

function messagesNeedingReply(){return(messagesCache.data?.conversations||[]).filter(item=>item.needsReply&&item.canReply).length;}
function findConversation(connectionId,conversationId){return(messagesCache.data?.conversations||[]).find(item=>item.connectionId===connectionId&&item.id===conversationId);}
function replyWindowText(item){if(!item?.needsReply||!item.replyBy)return'';const left=Date.parse(item.replyBy)-Date.now();if(left<=0||!item.canReply)return'Reply window closed';const hours=Math.floor(left/3600000);return hours>=1?`${hours} h left to reply`:`${Math.max(1,Math.round(left/60000))} min left to reply`;}
function networkGlyph(platform){return escapeHtml(SOCIAL_NETWORKS.find(item=>item[0]===platform)?.[2]||'•');}

async function loadMessages(force=false){
  const panel=$('#messages-panel');if(!panel)return;const show=cloudFeaturesAvailable()&&currentRole==='admin';panel.hidden=!show;if(!show)return;
  const key=homeClientId()||'';
  if(!force&&messagesCache.key===key&&Date.now()-messagesCache.at<MESSAGES_TTL){renderMessagesPanel();return;}
  if(messagesCache.loading)return;messagesCache.loading=true;renderMessagesPanel();
  try{const data=await callSocialApi({action:'conversations',clientId:key});messagesCache={key,at:Date.now(),data,loading:false,error:''};}
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
  notes.innerHTML=(data.problems||[]).map(item=>`<p class="messages-problem"><b>${escapeHtml(clients.find(entry=>entry.id===item.clientId)?.name||'Client')} · ${escapeHtml(platformLabel(item.platform))}${item.account?` ${escapeHtml(item.account)}`:''}</b> ${escapeHtml(item.error)}</p>`).join('');
  const layout=$('.post-comments-layout',panel),problems=data.problems||[];if(layout)layout.hidden=false;
  if(!data.accounts){list.innerHTML='<p class="option-hint">Connect a Facebook Page or Instagram account in Social Accounts to read and answer its messages here.</p>';return;}
  // No account allows messages yet (the usual state before Meta approves them): one calm line, not a warning per account.
  if(problems.length===data.accounts&&problems.every(item=>item.permission)){notes.innerHTML='<p class="option-hint">Messages aren’t turned on for your connected accounts yet. Once Meta allows them, reconnect your Facebook and Instagram accounts in Social Accounts and allow messages.</p>';if(layout)layout.hidden=true;return;}
  const items=data.conversations||[];
  list.innerHTML=items.length?items.map(conversationButtonHtml).join(''):'<p class="option-hint">No messages yet. When someone messages a connected Page or Instagram account, it shows up here.</p>';
}

function messageThreadHtml(item,data){
  const person=data.with?.name||item?.with?.name||'Someone',lastTheirs=[...data.messages].reverse().find(message=>!message.mine);
  const bubbles=data.messages.length?data.messages.map(message=>`<div class="message-bubble${message.mine?' mine':''}"><p>${message.text?escapeHtml(message.text):'<i>A photo, video, or file. Open the conversation in the app to see it.</i>'}</p><small>${message.mine?'You · ':''}${message.at?escapeHtml(timeAgo(message.at)):''}</small></div>`).join(''):'<p class="option-hint">No messages to show.</p>';
  const limit=item?.platform==='instagram'?1000:2000,closed=item?.needsReply&&!item.canReply;
  replyContext.set(item?.id||'',{text:lastTheirs?.text||'',author:person,jobId:''});
  const form=closed?`<p class="option-hint">It’s been more than 24 hours since ${escapeHtml(person)} last wrote. Meta only lets a business answer from other apps within 24 hours, so reply in the ${item.platform==='instagram'?'Instagram':'Facebook'} app.</p>`
    :`<form class="comment-reply-form message-reply-form" data-message-to="${escapeHtml(item?.id||'')}" data-connection="${escapeHtml(item?.connectionId||'')}" data-client="${escapeHtml(item?.clientId||'')}" data-author="${escapeHtml(firstName(person))}"><button type="button" class="icon-button" data-reply-templates title="Reply templates" aria-label="Reply templates" aria-haspopup="menu">${icon('file')}</button><button type="button" class="icon-button" data-suggest-reply title="Suggest a reply (AI)" aria-label="Suggest a reply">${icon('sparkles')}</button><input class="field" maxlength="${limit}" placeholder="Message…" aria-label="Message ${escapeHtml(person)}"><button class="secondary-button" type="submit">Send</button></form>${item?.needsReply?`<small class="message-window">${escapeHtml(replyWindowText(item))}</small>`:''}`;
  return`<div class="message-head"><span class="platform-icon ${escapeHtml(item?.platform||'')}">${networkGlyph(item?.platform)}</span><b>${escapeHtml(person)}</b><small>${escapeHtml(item?.account||'')}</small></div><div class="message-list">${bubbles}</div>${form}`;
}

async function openConversation(connectionId,conversationId){
  activeDm={connectionId,conversationId};renderMessagesPanel();
  const box=$('#message-thread'),item=findConversation(connectionId,conversationId);box.innerHTML='<p class="option-hint">Loading messages…</p>';
  try{const data=await callSocialApi({action:'conversation',connectionId,conversationId});if(activeDm?.conversationId!==conversationId)return;box.innerHTML=messageThreadHtml(item,data);const list=$('.message-list',box);if(list)list.scrollTop=list.scrollHeight;}
  catch(error){if(activeDm?.conversationId===conversationId)box.innerHTML=`<p class="option-hint">${escapeHtml(error.message)}</p>`;}
}

$('#conversation-list')?.addEventListener('click',event=>{const button=event.target.closest('[data-conversation]');if(button)openConversation(button.dataset.connection,button.dataset.conversation);});
$('#refresh-messages')?.addEventListener('click',()=>loadMessages(true));
document.addEventListener('submit',async event=>{
  const form=event.target.closest('form[data-message-to]');if(!form)return;event.preventDefault();
  const input=$('input',form),text=input.value.trim(),{connection,messageTo}=form.dataset;if(!text)return;
  const button=$('button[type=submit]',form);button.disabled=true;
  try{await callSocialApi({action:'send-message',connectionId:connection,conversationId:messageTo,text});toast('Message sent.');
    const item=findConversation(connection,messageTo);if(item){item.last={text,mine:true,at:new Date().toISOString()};item.updatedAt=item.last.at;item.needsReply=false;}
    renderMessagesPanel();renderInboxCount();openConversation(connection,messageTo);}
  catch(error){toast(error.message);button.disabled=false;}
});
