// Social Inbox → Messages: conversations with who wrote, the client and network, and the time left in
// Meta's 24-hour reply window; an account without messaging permission is named; opening a conversation
// shows its messages; replying sends to that conversation; a closed window points to the app instead.
export default async ({ send, evaluate, wait, log, sampleData }) => {
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(3000);
  await sampleData();
  const fail = (message) => log.push('[exception] ' + message);
  await evaluate(`document.querySelector('#auth-dialog')?.open&&document.querySelector('#auth-dialog').close();(()=>{
    cloudFeaturesAvailable=()=>true;activeUser={id:'u',email:'owner@pkworks.co'};activeWorkspace={id:'w',name:'PK Works'};currentRole='admin';
    serverPosts=[];serverPostsLoadedAt=Date.now();scheduleDraftSave=()=>{};scheduleWorkspaceSave=()=>{};
    const client=clients[0].id,ago=(h)=>new Date(Date.now()-h*3600000).toISOString();
    window.__calls=[];callSocialApi=async(body)=>{__calls.push(body);
      if(body.action==='posts')return{posts:[]};
      if(body.action==='open-comments')return{comments:[],counts:{}};
      if(body.action==='conversations')return{accounts:3,byClient:{[client]:2,[clients[1].id]:1},problems:[{connectionId:'c-ig',clientId:client,platform:'instagram',account:'@harbor',error:'This account hasn’t allowed SignalDesk to read and answer messages. Reconnect it in Social Accounts and allow messages.'}],conversations:[
        {id:'t1',connectionId:'c-fb',clientId:client,platform:'facebook',account:'Harbor Coffee',with:{id:'p1',name:'Ana Ruiz'},updatedAt:ago(2),last:{text:'Do you cater?',mine:false,at:ago(2)},needsReply:true,replyBy:new Date(Date.now()+22*3600000).toISOString(),canReply:true},
        {id:'t3',connectionId:'c-fb2',clientId:clients[1].id,platform:'facebook',account:'Other Page',with:{id:'p3',name:'Cleo Park'},updatedAt:ago(1),last:{text:'Hello?',mine:false,at:ago(1)},needsReply:true,replyBy:new Date(Date.now()+23*3600000).toISOString(),canReply:true},
        {id:'t2',connectionId:'c-fb',clientId:client,platform:'facebook',account:'Harbor Coffee',with:{id:'p2',name:'Ben Ortiz'},updatedAt:ago(30),last:{text:'Open Sunday?',mine:false,at:ago(30)},needsReply:true,replyBy:ago(6),canReply:false}]};
      if(body.action==='conversation')return body.conversationId==='t1'?{with:{name:'Ana Ruiz'},messages:[{id:'m0',text:'',mine:false,at:ago(3),hasAttachment:true,attachment:{kind:'share',url:'https://www.instagram.com/p/abc/'}},{id:'m1',text:'Do you cater?',mine:false,at:ago(2)}]}:{with:{name:'Ben Ortiz'},messages:[{id:'m2',text:'Open Sunday?',mine:false,at:ago(30)}]};
      if(body.action==='send-message')return{message:{id:'mid',text:body.text,mine:true}};
      if(body.action==='message-state')return{archived:body.archived};
      return{};};
  })()`);

  // Opening the Inbox before sign-in finishes (straight from its address): Messages appears once the role is known.
  await evaluate(`window.__cloud=cloudFeaturesAvailable;cloudFeaturesAvailable=()=>false;showView('inbox')`); await wait(200);
  if (!(await evaluate(`document.querySelector('#messages-panel').hidden`))) fail('before sign-in Messages is hidden');
  await evaluate(`cloudFeaturesAvailable=__cloud;renderCommentsPanel()`); await wait(500);
  if (await evaluate(`document.querySelector('#messages-panel').hidden`)) fail('Messages should appear once sign-in finishes');
  await evaluate(`showView('inbox')`); await wait(700);
  const panel = await evaluate(`document.querySelector('#messages-panel')?.hidden===false?document.querySelector('#messages-panel').innerText:''`);
  log.push('messages: ' + panel.replace(/\s+/g, ' ').slice(0, 300));
  if (!/Messages\s*2/.test(panel) || !/PK Works\s*2/.test(await evaluate(`document.querySelector('#inbox-client-tabs').innerText`))) fail('the heading should count conversations waiting for a reply');
  const tabs = await evaluate(`[...document.querySelectorAll('#inbox-client-tabs [data-inbox-client]')].map(b=>b.innerText.replace(/\\s+/g,' ').trim()+(b.classList.contains('active')?'*':'')).join('|')`);
  log.push('tabs: ' + tabs);
  if (!/\*/.test(tabs) || tabs.split('|').length !== 2) fail('each client with an account should have a tab, one chosen: ' + tabs);
  if (await evaluate(`document.querySelector('#conversation-list').innerText.includes('Cleo Park')`) === await evaluate(`document.querySelector('#conversation-list').innerText.includes('Ana Ruiz')`)) fail('only the chosen client’s conversations should show');
  await evaluate(`document.querySelector('#inbox-client-tabs [data-inbox-client="'+clients[0].id+'"]').click()`); await wait(100);
  if (!/Ana Ruiz/.test(panel) || !/Do you cater\?/.test(panel) || !/2[12] h left to reply/.test(panel)) fail('a conversation should show who wrote, their message, and the time left to reply');
  if (!/Reply window closed/.test(panel)) fail('an old conversation should say its window closed');
  if (!/Instagram @harbor/.test(panel) || !/Reconnect it in Social Accounts/.test(panel)) fail('an account without permission should be named');
  if (await evaluate(`document.querySelector('.nav-item[data-view="inbox"] .nav-count')?.textContent`) !== '2') fail('the Social Inbox nav should count messages waiting');

  // Open and reply.
  await evaluate(`document.querySelector('[data-conversation="t1"]').click()`); await wait(300);
  const thread = await evaluate(`document.querySelector('#message-thread').innerText`);
  if (process.env.SHOTS) { const { result: { data } } = await send('Page.captureScreenshot', { format: 'png', clip: JSON.parse(await evaluate(`(()=>{const el=document.querySelector('#messages-panel');el.scrollIntoView({block:'start'});const r=el.getBoundingClientRect();return JSON.stringify({x:r.x,y:r.y,width:r.width,height:Math.min(r.height,900),scale:1})})()`)) }); (await import('node:fs')).writeFileSync(`${process.env.SHOTS}/messages.png`, Buffer.from(data, 'base64')); }
  if (!/Do you cater\?/.test(thread) || !/Shared a post/.test(thread) || !(await evaluate(`!!document.querySelector('#message-thread a[href="https://www.instagram.com/p/abc/"]')`))) fail('the conversation should show its messages, attachments described with a link');
  if (!(await evaluate(`!!document.querySelector('#message-thread [data-reply-templates]')&&!!document.querySelector('#message-thread [data-suggest-reply]')`))) fail('replies should offer templates and suggestions');
  await evaluate(`document.querySelector('#message-thread [data-reply-templates]').click()`); await wait(100);
  await evaluate(`document.querySelector('#reply-template-menu [data-use-reply]').click()`); await wait(100);
  const filled = await evaluate(`document.querySelector('#message-thread input').value`);
  if (!/Ana/.test(filled)) fail('a template should fill in the first name: ' + filled);
  await evaluate(`const i=document.querySelector('#message-thread input');i.value='Yes, we cater!';i.form.requestSubmit()`); await wait(400);
  const sent = await evaluate(`JSON.stringify(__calls.find(c=>c.action==='send-message'))`);
  if (!sent || !/"connectionId":"c-fb"/.test(sent) || !/"conversationId":"t1"/.test(sent) || !/Yes, we cater!/.test(sent)) fail('Send should reply in that conversation: ' + sent);
  if (await evaluate(`document.querySelector('.nav-item[data-view="inbox"] .nav-count')?.textContent`) !== '1') fail('after replying, only the other client’s message is waiting');
  if (await evaluate(`__calls.some(c=>c.action==='reply-comment')`)) fail('a message reply must not be sent as a comment');

  // Comments follow the same client tab: only that client's posts, and Needs a reply checks that client.
  await evaluate(`(()=>{const pub=(id,clientId,title)=>({id,clientId,title,scheduledFor:new Date(Date.now()-86400000).toISOString(),jobs:[{id:'j'+id,platform:'facebook',status:'published',provider:'direct'}]});serverPosts=[pub('a',clients[0].id,'First client post'),pub('b',clients[1].id,'Second client post')];renderCommentsPanel();})()`); await wait(200);
  let posts = await evaluate(`document.querySelector('#comment-post-list').innerText`);
  if (!/First client post/.test(posts) || /Second client post/.test(posts)) fail('Comments should list only the chosen client’s posts: ' + posts.replace(/\s+/g, ' '));
  await evaluate(`document.querySelector('#inbox-client-tabs [data-inbox-client="'+clients[1].id+'"]').click()`); await wait(300);
  posts = await evaluate(`document.querySelector('#comment-post-list').innerText`);
  if (!/Second client post/.test(posts) || /First client post/.test(posts)) fail('switching clients should switch the posts');
  if (!(await evaluate(`__calls.some(c=>c.action==='open-comments'&&c.clientId===clients[1].id)`))) fail('Needs a reply should check the chosen client');
  if (/Ana Ruiz/.test(await evaluate(`document.querySelector('#conversation-list').innerText`))) fail('Messages should switch too');
  await evaluate(`document.querySelector('#inbox-client-tabs [data-inbox-client="'+clients[0].id+'"]').click()`); await wait(300);
  await evaluate(`document.querySelector('[data-conversation="t1"]').click()`); await wait(300);

  // Folders: Unread, Inbox, Archived.
  await evaluate(`try{localStorage.removeItem('signaldesk-messages-folder')}catch{};document.querySelector('[data-message-folder="unread"]').click()`); await wait(100);
  let shown = await evaluate(`document.querySelector('#conversation-list').innerText`);
  if (!/Ben Ortiz/.test(shown) || /Ana Ruiz/.test(shown)) fail('Unread should list only conversations whose latest message is theirs: ' + shown.replace(/\s+/g, ' '));
  await evaluate(`document.querySelector('[data-message-folder="inbox"]').click()`); await wait(100);
  await evaluate(`document.querySelector('[data-conversation="t1"]').click()`); await wait(300);
  await evaluate(`document.querySelector('[data-archive-conversation="1"]').click()`); await wait(300);
  if (!(await evaluate(`__calls.some(c=>c.action==='message-state'&&c.conversationId==='t1'&&c.archived===true)`))) fail('Archive should save');
  shown = await evaluate(`document.querySelector('#conversation-list').innerText`);
  if (/Ana Ruiz/.test(shown)) fail('an archived conversation leaves the inbox');
  await evaluate(`document.querySelector('[data-message-folder="archived"]').click()`); await wait(100);
  if (!/Ana Ruiz/.test(await evaluate(`document.querySelector('#conversation-list').innerText`))) fail('Archived should list it');
  if (!(await evaluate(`!!document.querySelector('[data-archive-conversation="0"]')`))) fail('an archived conversation offers Move to inbox');
  await evaluate(`document.querySelector('[data-message-folder="inbox"]').click()`); await wait(100);

  // A closed window: no form, a pointer to the app.
  await evaluate(`document.querySelector('[data-conversation="t2"]').click()`); await wait(300);
  const closed = await evaluate(`document.querySelector('#message-thread').innerText`);
  if (await evaluate(`!!document.querySelector('#message-thread form')`) || !/reply in the Facebook app/.test(closed)) fail('a closed window should point to the app');

  // Before any account allows messages: one calm line, no list.
  await evaluate(`messagesCache={key:'',at:Date.now(),loading:false,error:'',data:{accounts:1,byClient:{[clients[0].id]:1},conversations:[],problems:[{connectionId:'c-fb',clientId:clients[0].id,platform:'facebook',error:'x',permission:true}]}};renderMessagesPanel()`);
  const off = await evaluate(`document.querySelector('#messages-panel').innerText`);
  if (!/aren’t turned on/.test(off) || !(await evaluate(`document.querySelector('#messages-panel .post-comments-layout').hidden`))) fail('no permission anywhere should show one calm line');

  // Users (not admins) don't see messages.
  await evaluate(`currentRole='user';loadMessages()`); await wait(100);
  if (!(await evaluate(`document.querySelector('#messages-panel').hidden`))) fail('only admins see messages');
};
