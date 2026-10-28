// Planning and inbox: Plan ahead on the Command Center (key dates, What to post next, Draft it),
// reminder settings, Studio times learned per network, and Needs a reply with templates and Mark done.
import fs from 'node:fs';
export default async ({ send, evaluate, wait, log, sampleData }) => {
  const out = process.env.SHOTS;
  const shot = async (selector, name) => { if (!out) return; const box = JSON.parse(await evaluate(`(()=>{const el=document.querySelector('${selector}');el?.scrollIntoView({block:'start'});const r=el?.getBoundingClientRect();return JSON.stringify(r?{x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:Math.min(r.height,1400)}:null);})()`)); if (!box?.width) return; const { result } = await send('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 1 } }); fs.writeFileSync(out + name + '.png', Buffer.from(result.data, 'base64')); };
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(3000);
  await sampleData();
  const fail = (message) => log.push('[exception] ' + message);
  await evaluate(`document.querySelector('#auth-dialog')?.open&&document.querySelector('#auth-dialog').close();(()=>{
    cloudFeaturesAvailable=()=>true;activeUser={id:'u',email:'owner@pkworks.co'};activeWorkspace={id:'w',name:'PK Works'};currentRole='admin';
    serverPosts=[];serverPostsLoadedAt=Date.now();scheduleDraftSave=()=>{};scheduleWorkspaceSave=()=>{};
    const iso=(days)=>{const d=new Date();d.setDate(d.getDate()+days);return localIsoDate(d);};
    window.__note={working:'Team reels got 3× the engagement of photos.',gaps:'Nothing is scheduled next week.',dates:[{name:'Halloween',date:iso(5),angle:'Costume reel.'}],ideas:[{title:'Costume reel',why:'Reels do best.',date:iso(4),platforms:['instagram'],starter:'Who wore it best? 🎃'}],createdAt:new Date().toISOString()};
    const tuesdays=[];for(let i=1;i<=12;i++){const d=new Date();d.setDate(d.getDate()-7*i);d.setHours(9,0,0,0);tuesdays.push({t:d.toISOString(),rate:9,platform:'instagram'});const e=new Date(d);e.setHours(15);tuesdays.push({t:e.toISOString(),rate:2,platform:'instagram'});}
    window.__calls=[];callSocialApi=async(body)=>{__calls.push(body);if(body.action==='posts')return{posts:serverPosts};
      if(body.action==='planning-note')return body.refresh?{note:__note,stale:false}:{note:null,stale:false};
      if(body.action==='best-times')return{points:tuesdays,weeks:12};
      if(body.action==='open-comments')return{comments:[{jobId:'j1',postId:'p1',clientId:'pk-works',platform:'facebook',postTitle:'Fall menu launch',postUrl:'',id:'c1',author:'Ana Ruiz',text:'Love this!',at:new Date().toISOString()},{jobId:'j1',postId:'p1',clientId:'pk-works',platform:'facebook',postTitle:'Fall menu launch',postUrl:'',id:'c2',author:'Ben',text:'Price?',at:new Date().toISOString()}],counts:{j1:2},checked:1,failed:0};
      if(['reply-comment','comment-state'].includes(body.action))return{ok:true};
      return{};};
    supabaseClient.from=()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{email_frequency:'monthly',email_categories:['approvals','planning'],planning_leads:[60,7],planning_scope:'all'},error:null}),order:()=>({limit:async()=>({data:[],error:null})})})}),upsert:async(row)=>{window.__prefs=row;return{error:null};}});planningPrefs=null;
  })()`);

  // Plan ahead: dates coming up, then ideas on request.
  await evaluate(`showView('overview');renderCommandCenter()`); await wait(600);
  const plan = await evaluate(`document.querySelector('#plan-panel')?.innerText||''`);
  log.push('plan panel: ' + plan.replace(/\s+/g, ' ').slice(0, 300));
  const firstDate = await evaluate(`(()=>{const scope=planningPrefs?.scope==='all'?'all':'major';return upcomingObservances(localIsoDate(new Date()),90,{scope}).filter(i=>!i.lead||i.daysAway<=14)[0]?.name||''})()`);
  if (!/Coming up/i.test(plan) || !plan.includes(firstDate) || !/What to post next/i.test(plan) || !/Get ideas/.test(plan)) fail('Plan ahead should list the next key date and offer ideas');
  if (!/Nothing planned yet|posts? planned/.test(plan)) fail('each date should say how much is planned');
  await evaluate(`document.querySelector('#plan-panel [data-plan-refresh]').click()`); await wait(500);
  const ideas = await evaluate(`document.querySelector('#plan-panel .plan-note')?.innerText||''`);
  log.push('ideas: ' + ideas.replace(/\s+/g, ' ').slice(0, 300));
  if (!/Team reels got 3×/.test(ideas) || !/Costume reel/.test(ideas) || !/Halloween/.test(ideas) || !/New ideas/.test(ideas)) fail('the note should show what works, dates that fit, and ideas');
  if (!(await evaluate(`__calls.some(c=>c.action==='planning-note'&&c.refresh&&c.clientId==='pk-works')`))) fail('Get ideas should ask for a fresh note');
  await shot('#plan-panel', 'plan_panel');
  await evaluate(`document.documentElement.dataset.theme='dark'`); await wait(200); await shot('#plan-panel', 'plan_panel_dark'); await evaluate(`document.documentElement.dataset.theme='light'`);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true }); await wait(400); await shot('#plan-panel', 'plan_panel_phone');
  if (await evaluate(`document.documentElement.scrollWidth>window.innerWidth+1`)) fail('Plan ahead should fit a phone screen without sideways scrolling');
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1100, deviceScaleFactor: 1, mobile: false }); await wait(300);
  await evaluate(`document.querySelector('[data-plan-idea="0"]').click()`); await wait(700);
  const drafted = JSON.parse(await evaluate(`JSON.stringify({view:document.querySelector('.page.active')?.id,copy:document.querySelector('#post-copy').value,date:document.querySelector('#schedule-date').value,want:__note.ideas[0].date})`));
  log.push('draft it: ' + JSON.stringify(drafted));
  if (drafted.view !== 'view-composer' || drafted.copy !== 'Who wore it best? 🎃' || drafted.date !== drafted.want) fail('Draft it should open the Studio with the caption and day');
  await evaluate(`showView('overview')`); await wait(300);
  await evaluate(`document.querySelector('#plan-panel [data-plan-date]')?.click()`); await wait(600);
  const idea = await evaluate(`document.querySelector('#caption-dialog')?.open?document.querySelector('#caption-idea').value:''`);
  log.push('plan a post: ' + idea.slice(0, 120));
  if (!idea.includes(firstDate) && !/post for PK Works/.test(idea)) fail('Plan a post should open AI drafting with the date as the brief');
  await evaluate(`document.querySelector('#caption-dialog')?.close()`);

  // Nothing planned for a big date soon shows in Needs your attention.
  const expected = await evaluate(`upcomingObservances(localIsoDate(new Date()),14,{scope:'major'}).filter(i=>!i.lead&&i.kind!=='month'&&i.daysAway>=2).map(i=>i.name).join('|')`);
  const attention = await evaluate(`attentionItems().map(i=>i.title).join('|')`);
  if (expected && !expected.split('|').every((name) => attention.includes(`Nothing planned for ${name}`))) fail('big dates with nothing planned should need attention: ' + attention);

  // Reminder settings: chips reflect saved choices; Never clears them and saves an empty list.
  await evaluate(`openNotificationPreferences()`); await wait(500);
  const chips = await evaluate(`[...document.querySelectorAll('input[name=planning-lead]:checked')].map(i=>i.value).join(',')+'|'+document.querySelector('#planning-scope').value+'|'+document.querySelector('input[name=email-category][value=planning]').checked`);
  if (chips !== '60,7|all|true') fail('saved reminder times should be ticked: ' + chips);
  await shot('#planning-prefs', 'reminder_settings');
  await evaluate(`(()=>{const n=document.querySelector('#planning-never');n.checked=true;n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  if ((await evaluate(`document.querySelectorAll('input[name=planning-lead]:checked').length`)) !== 0) fail('Never should clear the reminder times');
  await evaluate(`(()=>{const c=document.querySelector('input[name=planning-lead][value="14"]');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  if (await evaluate(`document.querySelector('#planning-never').checked`)) fail('picking a time should clear Never');
  await evaluate(`document.querySelector('#notification-form').requestSubmit()`); await wait(400);
  const saved = await evaluate(`JSON.stringify({leads:__prefs?.planning_leads,scope:__prefs?.planning_scope,cats:__prefs?.email_categories})`);
  log.push('saved prefs: ' + saved);
  if (saved !== JSON.stringify({ leads: [14], scope: 'all', cats: ['approvals', 'planning'] })) fail('reminder settings should save: ' + saved);

  // Studio: times learned from this client's Instagram posts.
  await evaluate(`showView('composer');document.querySelector('.account-select').innerHTML=['facebook','instagram'].map(p=>'<label><input type="checkbox" value="'+p+'"'+(p==='instagram'?' checked':'')+'> '+p+'</label>').join('');renderSuggestedTimes()`); await wait(600);
  const times = await evaluate(`document.querySelector('#suggested-times')?.innerText||''`);
  const why = await evaluate(`document.querySelector('#suggested-times .suggested-label')?.title||''`);
  log.push('suggested: ' + times.replace(/\s+/g, ' ') + ' · ' + why);
  if (!/Best for Instagram/.test(times) || !/9:00/.test(times) || !/Instagram posts/.test(why)) fail('Studio times should come from the client’s Instagram posts');

  // Social Inbox: Needs a reply, a template, replying, and Mark done.
  await evaluate(`showView('inbox')`); await wait(700);
  const inbox = await evaluate(`document.querySelector('#needs-reply')?.innerText||''`);
  log.push('needs reply: ' + inbox.replace(/\s+/g, ' ').slice(0, 200));
  if (!/Needs a reply\s*2/.test(inbox) || !/Love this!/.test(inbox) || !/Fall menu launch/.test(inbox)) fail('Needs a reply should list unanswered comments with their post');
  if (await evaluate(`document.querySelector('.nav-item[data-view="inbox"] .nav-count')?.textContent`) !== '2') fail('the Social Inbox nav should count comments waiting');
  await evaluate(`document.querySelector('#needs-reply [data-reply-to="c1"] [data-reply-templates]').click()`); await wait(200);
  await shot('#post-comments-panel', 'needs_reply');
  const menu = await evaluate(`document.querySelector('#reply-template-menu')?.hidden===false?document.querySelector('#reply-template-menu').innerText:''`);
  if (!/Thank you/.test(menu) || !/Starters/.test(menu)) fail('the templates menu should offer starters');
  await evaluate(`document.querySelector('[data-use-reply="starter-thanks"]').click()`); await wait(100);
  const reply = await evaluate(`document.querySelector('#needs-reply [data-reply-to="c1"] input').value`);
  if (reply !== 'Thanks so much, Ana! We really appreciate it.') fail('the template should fill in the first name: ' + reply);
  await evaluate(`document.querySelector('#needs-reply [data-reply-to="c1"]').requestSubmit()`); await wait(400);
  const sent = await evaluate(`JSON.stringify(__calls.filter(c=>c.action==='reply-comment').map(c=>[c.jobId,c.commentId,c.text]))`);
  if (sent !== JSON.stringify([['j1', 'c1', 'Thanks so much, Ana! We really appreciate it.']])) fail('the reply should go to the right post and comment: ' + sent);
  if (await evaluate(`!!document.querySelector('#needs-reply [data-reply-to="c1"]')`)) fail('an answered comment should leave Needs a reply');
  await evaluate(`document.querySelector('#needs-reply [data-comment-done="c2"]').click()`); await wait(400);
  if (!(await evaluate(`__calls.some(c=>c.action==='comment-state'&&c.commentId==='c2'&&c.done===true)`))) fail('Mark done should save');
  const empty = await evaluate(`document.querySelector('#needs-reply')?.innerText||''`);
  if (!/All caught up/.test(empty)) fail('with every comment handled, Needs a reply should say so: ' + empty);
  // Saving a reply as a template swaps the name for {name}.
  await evaluate(`(()=>{const box=document.querySelector('#needs-reply');box.insertAdjacentHTML('beforeend',replyFormHtml({id:'c9',author:'Cara Lee'},'j1',true));const input=box.querySelector('[data-reply-to="c9"] input');input.value='Hi Cara, see you Saturday!';window.prompt=()=>'See you';box.querySelector('[data-reply-to="c9"] [data-reply-templates]').click();document.querySelector('[data-save-reply]').click();})()`); await wait(200);
  const templates = await evaluate(`JSON.stringify(replyTemplates.map(t=>t.text))`);
  if (templates !== JSON.stringify(['Hi {name}, see you Saturday!'])) fail('saved templates should use {name}: ' + templates);
  if (!(await evaluate(`collectSharedState().replyTemplates.length===1`))) fail('templates should be shared with the workspace');
};
