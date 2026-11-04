// Build with AI: the three steps, a document upload, editing and rewriting a post, and the saved drafts.
import fs from 'node:fs';
const out = process.env.SHOTS || '';
export default async ({ send, evaluate, wait, log, sampleData }) => {
  const fail = (message) => log.push('[exception] ' + message);
  const shot = async (name) => { if (!out) return; const { result } = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(out + name, Buffer.from(result.data, 'base64')); };
  const json = async (expression) => JSON.parse(await evaluate(`Promise.resolve(${expression}).then(value=>JSON.stringify(value))`));
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 950, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(3000);
  await sampleData(); await wait(300);
  await evaluate(`(()=>{
    document.querySelector('#auth-dialog')?.open&&document.querySelector('#auth-dialog').close();
    const later=days=>localIsoDate(new Date(Date.now()+days*86400000));window.__day=later;window.__calls=[];
    cloudFeaturesAvailable=()=>true;activeUser={id:'u1',email:'owner@studio.test'};activeWorkspace={id:'w1',name:'Studio'};currentRole='admin';
    savedDrafts=[];loadSavedDrafts=async()=>savedDrafts;storeSavedDrafts=async()=>{};scheduleWorkspaceSave=()=>{};saveWorkspaceState=async()=>{};
    const post=(days,title,networks)=>({date:later(days),time:'10:00',networks,title,format:'Image',creativeIdea:'A photo of '+title+' on a table, 4:5.',captions:networks.map(network=>({network,text:title+' for '+network}))});
    callSocialApi=async body=>{__calls.push(body);
      if(body.action==='accounts')return{accounts:[{platform:'facebook',linked:true},{platform:'instagram',linked:true},{platform:'linkedin',linked:false}]};
      if(body.action==='campaigns')return{campaigns:[{clientId:'pk-works',campaign:'Taken',posts:1,out:0,upcoming:1,waiting:0,changes:0,reach:0,engagements:0,clicks:0,first:new Date().toISOString(),last:new Date().toISOString()}]};
      if(body.action==='campaign-posts')return{posts:[]};
      if(body.action==='campaign-questions')return window.__noQuestions?{name:'Quick',docNotes:'',questions:[]}:{name:'Fall kits',docNotes:'Kits cost $20.',docTrimmed:false,questions:[{question:'What’s the main goal?',hint:'e.g. sales'},{question:'Who is it for?',hint:'e.g. teachers'}]};
      if(body.action==='campaign-plan'){if(window.__planFails){window.__planFails=false;throw new Error('The AI service is busy right now. Try again in a minute.');}return{plan:{name:'Fall kits push',angle:'Tease, launch, last call.',assumptions:['The sale ends November 20.'],booked:[{date:later(3),time:'10:00',title:'Existing post',networks:['facebook']}],posts:[post(2,'Tease',['facebook','instagram']),post(3,'Launch <b>day</b>',['facebook','tiktok']),post(5,'Last call',['tiktok'])]}};}
      if(body.action==='campaign-post')return{post:{title:'Tease rewritten',format:'Reel',creativeIdea:'A new video.',captions:body.networks.map(network=>({network,text:'Rewritten for '+network}))}};
      return{};};
  })()`);
  await evaluate(`showView('campaigns')`); await wait(300);
  if (!await evaluate(`Boolean(document.querySelector('#board-build'))`)) fail('the Campaigns page should have a Build with AI button');
  await evaluate(`document.querySelector('#board-build').click()`); await wait(300);
  if (!await evaluate(`document.querySelector('#builder-dialog').open`)) fail('Build with AI should open');
  const networks = await json(`[...document.querySelectorAll('[data-builder-network]')].map(input=>input.dataset.builderNetwork+':'+input.checked)`);
  log.push('networks: ' + networks.join(' '));
  if (!networks.includes('facebook:true') || !networks.includes('instagram:true')) fail('connected networks should start ticked');
  if (!networks.includes('tiktok:false')) fail('unconnected networks should be offered as reminders, unticked');
  if (networks.some((item) => item.startsWith('other:') || item.startsWith('x:true'))) fail('reminders should not include Other or start ticked');
  await shot('builder_brief.png');
  const sideways = await json(`(()=>{const d=document.querySelector('#builder-dialog');return{over:d.scrollWidth-d.clientWidth,who:[...d.querySelectorAll('*')].filter(el=>el.getBoundingClientRect().right>d.getBoundingClientRect().right).map(el=>el.tagName+'.'+el.className+'#'+el.id).slice(0,6)}})()`);
  log.push('sideways: ' + JSON.stringify(sideways));
  if (sideways.over > 0) fail('the dialog should not scroll sideways');

  // Nothing written yet: stays on the step and says why.
  await evaluate(`document.querySelector('[data-builder-ask]').click()`); await wait(100);
  if (!/Describe the campaign/.test(await evaluate(`document.querySelector('#builder-body .auth-message').textContent`))) fail('an empty request should ask for a description');
  if (await evaluate(`__calls.some(call=>call.action==='campaign-questions')`)) fail('an empty request should not call the AI');

  // A file that's too big or the wrong type is refused in the browser.
  const pick = (name, size) => `(async()=>{const input=document.querySelector('#builder-file'),transfer=new DataTransfer();transfer.items.add(new File([new Uint8Array(${size})],${JSON.stringify(name)}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(done=>setTimeout(done,150));return document.querySelector('#builder-body .auth-message').textContent;})()`;
  if (!/over 3 MB/.test(await evaluate(pick('huge.pdf', 3200000)))) fail('files over 3 MB should be refused');
  if (!/PDF, Word/.test(await evaluate(pick('photo.png', 10)))) fail('other file types should be refused');
  await evaluate(pick('brief.txt', 20));
  if (!/brief\.txt/.test(await evaluate(`document.querySelector('.builder-file').textContent`))) fail('the chosen file should show');
  await evaluate(`(()=>{const area=document.querySelector('#builder-brief');area.value='I need a campaign to run 14 days to promote product X.';area.dispatchEvent(new Event('input',{bubbles:true}));const days=document.querySelector('#builder-days');days.value='14';days.dispatchEvent(new Event('input',{bubbles:true}));const tiktok=document.querySelector('[data-builder-network="tiktok"]');tiktok.checked=true;tiktok.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-builder-ask]').click();})()`); await wait(300);
  const asked = await json(`__calls.find(call=>call.action==='campaign-questions')`);
  if (asked.file?.name !== 'brief.txt' || !asked.file.data) fail('the document should be sent with the first request');
  if (!asked.networks.includes('tiktok')) fail('the chosen networks should be sent');
  if (asked.days !== 14 || !asked.start) fail('the AI should be told the dates so it does not ask');

  // Step 2: answer one, leave one blank, and a failed plan keeps your answers.
  if (!/What’s the main goal/.test(await evaluate(`document.querySelector('#builder-body').textContent`))) fail('the questions should show');
  if (!/Kits cost/.test(await evaluate(`document.querySelector('.builder-notes textarea').value`))) fail('what the AI read should be visible and editable');
  await shot('builder_questions.png');
  await evaluate(`(()=>{const answer=document.querySelector('[data-builder-answer="0"]');answer.value='Sales';answer.dispatchEvent(new Event('input',{bubbles:true}));window.__planFails=true;document.querySelector('[data-builder-plan]').click();})()`); await wait(300);
  if (!/busy/.test(await evaluate(`document.querySelector('#builder-body .auth-message').textContent`))) fail('a failed plan should say so');
  if (await evaluate(`document.querySelector('[data-builder-answer="0"]').value`) !== 'Sales') fail('a failed plan should keep the answers');
  await evaluate(`document.querySelector('[data-builder-plan]').click()`); await wait(300);
  const planned = await json(`__calls.filter(call=>call.action==='campaign-plan').pop()`);
  if (planned.file) fail('the document should only be sent once');
  if (planned.docNotes !== 'Kits cost $20.' || planned.answers.length !== 1 || planned.answers[0].answer !== 'Sales' || planned.days !== 14) fail('the plan request should carry the notes, answers, and length: ' + JSON.stringify({ ...planned, networks: 0 }));

  // Step 3: review.
  await evaluate(`document.querySelector('#builder-dialog').scrollTop=0`);
  await shot('builder_plan.png');
  const rows = await json(`[...document.querySelectorAll('.builder-post')].map(row=>row.querySelector('b').textContent)`);
  if (rows.join() !== 'Tease,Launch <b>day</b>,Last call') fail('the plan should list its posts, with AI text escaped: ' + rows);
  if (!/Guesses to check/.test(await evaluate(`document.querySelector('#builder-body').textContent`))) fail('guesses should be listed');
  if (!/Already has “Existing post”/.test(await evaluate(`document.querySelectorAll('.builder-post')[1].textContent`))) fail('a busy day should be flagged');
  if (/Already has/.test(await evaluate(`document.querySelectorAll('.builder-post')[0].textContent`))) fail('a free day should not be flagged');

  // Closing keeps the plan.
  await evaluate(`document.querySelector('[data-builder-close]').click()`); await wait(100);
  await evaluate(`document.querySelector('#board-build').click()`); await wait(100);
  if (await evaluate(`document.querySelectorAll('.builder-post').length`) !== 3) fail('closing the dialog should not lose the plan');

  // Edit, rewrite, remove.
  await evaluate(`(()=>{const area=document.querySelector('[data-builder-caption="1"]');area.value='My own Instagram words';area.dispatchEvent(new Event('input',{bubbles:true}));const change=document.querySelector('[data-builder-post-field="change"]');change.value='Make it funnier';change.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const before = await evaluate(`document.querySelector('.builder-post input[type=date]').value`);
  await evaluate(`document.querySelector('[data-builder-redo]').click()`); await wait(200);
  const redo = await json(`__calls.filter(call=>call.action==='campaign-post').pop()`);
  if (redo.change !== 'Make it funnier' || redo.networks.join() !== 'facebook,instagram' || !redo.others.includes('Last call')) fail('a rewrite should say what to change');
  if (await evaluate(`document.querySelector('.builder-post b').textContent`) !== 'Tease rewritten') fail('the rewrite should replace the post');
  if (await evaluate(`document.querySelector('.builder-post input[type=date]').value`) !== before) fail('a rewrite should keep the date');
  await evaluate(`(()=>{const area=document.querySelector('[data-builder-caption="1"]');area.value='Instagram words';area.dispatchEvent(new Event('input',{bubbles:true}));const row=document.querySelectorAll('.builder-post')[2];row.open=true;})()`); await wait(100);
  await evaluate(`document.querySelectorAll('.builder-post')[2].querySelector('[data-builder-remove]').click()`); await wait(100);
  if (await evaluate(`document.querySelectorAll('.builder-post').length`) !== 2) fail('removing a post should drop it');
  if (!/Create 2 drafts/.test(await evaluate(`document.querySelector('[data-builder-save]').textContent`))) fail('the button should count the drafts');

  // A name already in use is refused; a new one makes drafts and schedules nothing.
  const setName = (name) => `(()=>{const input=document.querySelector('#builder-name');input.value=${JSON.stringify(name)};input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-builder-save]').click();})()`;
  await evaluate(setName('Taken')); await wait(300);
  if (!/already has a campaign/.test(await evaluate(`document.querySelector('#builder-body .auth-message').textContent`))) fail('a campaign name in use should be refused');
  await evaluate(setName('Fall kits push')); await wait(500);
  if (await evaluate(`document.querySelector('#builder-dialog').open`)) fail('the dialog should close once the drafts exist');
  const drafts = await json(`savedDrafts.slice().sort((a,b)=>a.date.localeCompare(b.date))`);
  log.push('drafts: ' + drafts.map((draft) => draft.title).join(' ; '));
  if (drafts.length !== 2) fail('two drafts should exist');
  const [first, second] = drafts;
  if (first.state.draft !== 'Rewritten for facebook' || first.state.draftOverrides.instagram?.text !== 'Instagram words') fail('each connected network should keep its own caption');
  if (first.platforms.join() !== 'facebook,instagram' || first.manual.length) fail('connected networks should post directly');
  if (second.platforms.join() !== 'facebook' || second.manual.join() !== 'tiktok' || second.state.postOptions.manual.join() !== 'tiktok') fail('unconnected networks should become reminders');
  if (first.state.postOptions.campaign !== 'Fall kits push' || first.client !== 'PK Works') fail('drafts should belong to the campaign and client');
  if (first.state.postOptions.creativeIdea !== 'A new video.') fail('drafts should keep the creative idea');
  if (await evaluate(`__calls.some(call=>call.action==='publish')`)) fail('nothing should be scheduled');
  await wait(300);
  if (!/A new video/.test(await evaluate(`document.querySelector('.board-table')?.textContent||''`))) fail('the campaign should open and show the idea');
  await shot('builder_campaign.png');

  // In the Studio: the idea shows, survives a save, and never goes to the network.
  await evaluate(`openSavedDraft(${JSON.stringify(first.id)})`); await wait(400);
  if (!/A new video/.test(await evaluate(`document.querySelector('#creative-note').textContent`))) fail('the Studio should show the idea');
  if (await evaluate(`document.querySelector('#creative-note').hidden`)) fail('the Studio note should be visible');
  if (await evaluate(`snapshotDraft().state.postOptions.creativeIdea`) !== 'A new video.') fail('saving the Studio should keep the idea');
  const ticked = await json(`selectedPlatforms()`);
  if (ticked.join() !== 'facebook,instagram') fail('opening a draft should tick its networks: ' + ticked);
  await evaluate(`document.querySelector('#creative-note').scrollIntoView({block:'center'})`); await wait(100);
  await shot('builder_studio.png');
  const wide = await evaluate(`(()=>{const d=document.querySelector('#builder-dialog');return d.open?d.scrollWidth-d.clientWidth:0})()`);
  if (wide > 0) fail('the dialog should not scroll sideways');
  const payload = await json(`draftPayload(savedDrafts.find(draft=>draft.id===${JSON.stringify(first.id)}))`);
  if (/creativeIdea|A new video/.test(JSON.stringify(payload))) fail('the idea must never be sent as part of the post');
  await evaluate(`loadComposerAccounts()`); await wait(200);
  if ((await json(`selectedPlatforms()`)).join() !== 'facebook,instagram') fail('reloading accounts should keep what is ticked');
  await evaluate(`document.querySelector('#creative-note-clear').click()`); await wait(100);
  if (!await evaluate(`document.querySelector('#creative-note').hidden`)) fail('Clear should remove the note');

  // No questions: goes straight to the plan. Another person never sees this plan.
  await evaluate(`showView('campaigns');window.__noQuestions=true;openBuilder();`); await wait(300);
  await evaluate(`(()=>{const area=document.querySelector('#builder-brief');area.value='Quick one';area.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-builder-ask]').click();})()`); await wait(400);
  if (await evaluate(`document.querySelectorAll('.builder-post').length`) !== 3) fail('with no questions it should go straight to the plan');
  await evaluate(`document.querySelector('#builder-dialog').close();activeUser={id:'u2',email:'other@studio.test'};openBuilder();`); await wait(200);
  if (await evaluate(`document.querySelectorAll('.builder-post').length`) !== 0) fail('someone else signing in should not see the plan');
  await evaluate(`document.querySelector('#builder-dialog').close()`);
};
