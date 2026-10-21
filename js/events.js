// Sign-in and miscellaneous event handlers.
$('#auth-button')?.addEventListener('click',()=>openAuthDialog());
$('#accounts-client-select')?.addEventListener('change',()=>refreshSocialAccounts());
$('#client-select')?.addEventListener('change',()=>{updatePreview();loadComposerAccounts();});
$('#refresh-social-accounts')?.addEventListener('click',()=>refreshSocialAccounts());
$('#connect-social-accounts')?.addEventListener('click',startSocialAccountLink);
$('#client-grid')?.addEventListener('click',event=>{const target=event.target.closest('[data-social-client]');if(!target)return;const client=clients.find(item=>item.id===target.dataset.socialClient);if(!client)return;renderClientSelects();$('#accounts-client-select').value=client.name;showView('social-accounts');});
document.addEventListener('click',event=>{const button=event.target.closest('[data-post-comments]');if(!button)return;ensureLiveInbox();addPanelClientSelector('live-inbox-panel','live-inbox-client-select');const client=clients.find(item=>item.name===button.dataset.postClient);if(client)$('#live-inbox-client-select').value=client.name;$('#comment-post-id').value=button.dataset.postComments;const platform=savedPosts.find(post=>post.providerPostId===button.dataset.postComments)?.channel?.split(',')[0];if(platform&&$('#comment-platform').querySelector(`option[value="${platform}"]`))$('#comment-platform').value=platform;showView('inbox');});
$('#view-inbox')?.addEventListener('click',async event=>{if(event.target.closest('#refresh-live-inbox')){await loadSocialInbox();return;}const conversationButton=event.target.closest('[data-live-conversation]');if(conversationButton){activeConversation=window.liveConversations?.[Number(conversationButton.dataset.liveConversation)]||null;const message=$('#live-inbox-message');if(message&&activeConversation)message.textContent=`${activeConversation.name||activeConversation.platform}\n${activeConversation.message}`;$$('.live-inbox-item').forEach(button=>button.classList.toggle('active',button===conversationButton));return;}if(event.target.closest('#send-live-reply')){const text=$('#live-reply-text')?.value.trim();if(!activeConversation||!text){toast('Select a conversation and write a reply.');return;}try{await callSocialApi({action:'reply',clientId:activeConversation.clientId,platform:activeConversation.platform,recipientId:activeConversation.recipientId,message:text});$('#live-reply-text').value='';toast('Reply sent.');await loadSocialInbox();}catch(error){toast(error.message);}}});
$('#view-inbox')?.addEventListener('click',event=>{if(event.target.closest('#load-post-comments'))loadSocialComments();if(event.target.closest('#send-post-comment'))postSocialComment();});
$('#view-inbox')?.addEventListener('change',event=>{if(event.target.id==='live-inbox-client-select')loadSocialInbox();});
$('#view-analytics')?.addEventListener('change',event=>{if(event.target.id==='analytics-client-select')loadSocialAnalytics();});
$('#post-copy')?.addEventListener('input',()=>scheduleDraftSave());
$('#add-client')?.addEventListener('click',()=>scheduleWorkspaceSave());
$('#save-draft')?.addEventListener('click',()=>scheduleWorkspaceSave());
$('#submit-review')?.addEventListener('click',()=>scheduleWorkspaceSave());
$('#schedule-post')?.addEventListener('click',()=>scheduleWorkspaceSave());
$('#approval-table')?.addEventListener('click',event=>{if(event.target.closest('[data-approve],[data-edit]'))scheduleWorkspaceSave();});
