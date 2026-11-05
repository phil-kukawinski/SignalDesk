// Dragging posts and drafts on the calendar: every drop asks first, Cancel changes nothing, Month keeps the time.
import fs from 'node:fs';
const out = process.env.SHOTS || '';
export default async ({ send, evaluate, wait, log, sampleData }) => {
  const fail = (message) => log.push('[exception] ' + message);
  const shot = async (name) => { if (!out) return; const { result } = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(out + name, Buffer.from(result.data, 'base64')); };
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(3000);
  await sampleData(); await wait(300);
  await evaluate(`(()=>{
    document.querySelector('#auth-dialog')?.open&&document.querySelector('#auth-dialog').close();
    cloudFeaturesAvailable=()=>true;activeUser={id:'u1',email:'owner@studio.test'};activeWorkspace={id:'w1',name:'Studio'};currentRole='admin';
    // Ten days ahead at 9:00, so every target is in the future and in the same week or month view.
    const base=startOfDay(addDays(new Date(),10));base.setHours(9,0,0,0);window.__base=base;
    const job={id:'j1',platform:'facebook',provider:'direct',status:'queued',attempts:0,runAt:base.toISOString()};
    window.__post=()=>({id:'p1',clientId:clients[0].id,title:'Fall kits',text:'Fall kits',media:[],platformContent:{},createdBy:'u1',scheduledFor:base.toISOString(),status:'scheduled',source:'manual',options:{},jobs:[{...job}]});
    serverPosts=[__post()];window.__calls=[];window.__stored=0;
    savedDrafts=[{id:'d1',title:'Draft idea',client:clients[0].name,platforms:['facebook'],manual:[],date:localIsoDate(addDays(base,1)),time:'10:30',state:{}}];
    loadSavedDrafts=async()=>savedDrafts;storeSavedDrafts=async()=>{__stored++;};
    window.__api=async body=>{__calls.push(body);if(body.action==='posts')return{posts:serverPosts};if(body.action==='autopilot')return{feeds:[],items:[],comments:[]};return{};};callSocialApi=__api;
    calView='week';calCursor=startOfDay(base);timelineKey=null;
    window.__drag=(el,x,y)=>{const box=el.getBoundingClientRect(),fire=(type,tx,ty,target)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,clientX:tx,clientY:ty,button:0,pointerId:1,pointerType:'mouse'}));const sx=box.left+8,sy=box.top+8;fire('pointerdown',sx,sy,el);fire('pointermove',sx+8,sy+8,el);fire('pointermove',x,y,el);fire('pointerup',x,y,el);};
    window.__answer=value=>document.querySelector('#confirm-dialog [value='+value+']').click();
    window.__moves=()=>__calls.filter(call=>call.action==='reschedule-post');
    showView('calendar');renderCalendar();
  })()`); await wait(300);
  const chip = (selector) => `document.querySelector('${selector}')`;
  const prompt = `document.querySelector('#confirm-dialog')?.open?document.querySelector('#confirm-dialog').textContent:''`;
  const dragToColumn = (selector, dayOffset, hour) => `(()=>{const el=${chip(selector)},iso=localIsoDate(addDays(__base,${dayOffset})),col=document.querySelector('.timeline-col[data-date="'+iso+'"]');document.querySelector('#timeline-scroll').scrollTop=8*HOUR_HEIGHT;const box=col.getBoundingClientRect();__drag(el,box.left+20,box.top+${hour}*HOUR_HEIGHT+8);return iso;})()`;

  // Week view: dropping asks first, and shows where it's going.
  const offsetInWeek = await evaluate(`(()=>{const cols=[...document.querySelectorAll('.timeline-col')].map(col=>col.dataset.date),at=cols.indexOf(localIsoDate(__base));return at<6?1:-1;})()`);
  await evaluate(dragToColumn('.timeline-event[data-open-post="p1"]', offsetInWeek, 12)); await wait(150);
  const asked = await evaluate(prompt);
  await shot('drag_confirm.png');
  if (!/Move this post/.test(asked) || !/Fall kits/.test(asked) || !/9:00\sAM/.test(asked) || !/12:00\sPM/.test(asked)) fail('a drop should ask first, with both times: ' + asked);
  if (await evaluate(`__moves().length`) !== 0) fail('nothing should move before confirming');

  // Cancel: nothing changes.
  await evaluate(`__answer('no')`); await wait(150);
  if (await evaluate(`__moves().length`) !== 0) fail('Cancel should not move the post');
  if (await evaluate(`serverPosts[0].scheduledFor===__base.toISOString()`) !== true) fail('Cancel should keep the time');
  if (await evaluate(`${chip('.timeline-event[data-open-post="p1"]')}.closest('.timeline-col').dataset.date===localIsoDate(__base)`) !== true) fail('Cancel should put the post back');
  if (await evaluate(`document.querySelector('#post-dialog').open`)) fail('dragging should not open the post');

  // Move: goes to the new day and time.
  const target = await evaluate(dragToColumn('.timeline-event[data-open-post="p1"]', offsetInWeek, 12)); await wait(150);
  await evaluate(`__answer('yes')`); await wait(200);
  const moved = JSON.parse(await evaluate(`(()=>{const call=__moves().pop(),at=new Date(call?.scheduleDate);return JSON.stringify({id:call?.postId,day:localIsoDate(at),hour:at.getHours(),minute:at.getMinutes()});})()`));
  if (moved.id !== 'p1' || moved.day !== target || moved.hour !== 12 || moved.minute !== 0) fail('Move should use the dropped day and time: ' + JSON.stringify(moved));
  if (!/Moved/.test(await evaluate(`document.querySelector('#toast').textContent`))) fail('a move should confirm it happened');

  // A move the server refuses puts the post back.
  await evaluate(`(()=>{serverPosts=[__post()];callSocialApi=async body=>{if(body.action==='reschedule-post')throw new Error('That time is taken.');return __api(body);};renderCalendar();})()`); await wait(150);
  await evaluate(dragToColumn('.timeline-event[data-open-post="p1"]', offsetInWeek, 14)); await wait(150);
  await evaluate(`__answer('yes')`); await wait(200);
  if (await evaluate(`serverPosts[0].scheduledFor===__base.toISOString()`) !== true) fail('a refused move should keep the old time');
  await evaluate(`(()=>{callSocialApi=__api;serverPosts=[__post()];renderCalendar();})()`); await wait(150);

  // Published posts can't be dragged, and neither can a time in the past.
  if (await evaluate(`(()=>{serverPosts=[{...__post(),status:'published',jobs:[{...__post().jobs[0],status:'published'}]}];renderCalendar();const el=document.querySelector('.timeline-event[data-open-post="p1"]');const result=Boolean(el.dataset.draggable);serverPosts=[__post()];renderCalendar();return result;})()`)) fail('published posts should not be draggable');

  // Drafts: asks first, saves the new date and time, and doesn't open the draft.
  await evaluate(`calCursor=startOfDay(addDays(__base,1));timelineKey=null;renderCalendar()`); await wait(200);
  if (await evaluate(`Boolean(${chip('.timeline-event[data-draft-event="d1"]')}?.dataset.draggable)`) !== true) fail('drafts should be draggable');
  const draftOffset = await evaluate(`(()=>{const cols=[...document.querySelectorAll('.timeline-col')].map(col=>col.dataset.date),at=cols.indexOf(localIsoDate(addDays(__base,1)));return at<6?2:0;})()`);
  await evaluate(dragToColumn('.timeline-event[data-draft-event="d1"]', draftOffset, 15)); await wait(150);
  if (!/Move this draft/.test(await evaluate(prompt))) fail('a draft drop should ask first');
  await evaluate(`__answer('no')`); await wait(150);
  if (await evaluate(`__stored`) !== 0) fail('Cancel should not save the draft');
  await evaluate(dragToColumn('.timeline-event[data-draft-event="d1"]', draftOffset, 15)); await wait(150);
  await evaluate(`__answer('yes')`); await wait(200);
  const draft = JSON.parse(await evaluate(`JSON.stringify({date:savedDrafts[0].date,time:savedDrafts[0].time,want:localIsoDate(addDays(__base,${draftOffset})),stored:__stored,page:document.querySelector('.page.active').id})`));
  if (draft.date !== draft.want || draft.time !== '15:00' || draft.stored !== 1) fail('the draft should save its new time: ' + JSON.stringify(draft));
  if (draft.page !== 'view-calendar') fail('dragging a draft should not open it: ' + draft.page);

  // Month: choose the day, keep the time. Touch doesn't start a drag, so phones can scroll.
  await evaluate(`(()=>{serverPosts=[__post()];calView='month';calCursor=startOfDay(__base);renderCalendar();})()`); await wait(200);
  if (await evaluate(`${chip('.calendar-day [data-open-post="p1"]')}.dataset.draggable`) !== 'true') fail('month posts should be draggable');
  await evaluate(`(()=>{const el=${chip('.calendar-day [data-open-post="p1"]')};el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:5,clientY:5,button:0,pointerId:2,pointerType:'touch'}));})()`);
  if (await evaluate(`Boolean(calendarDrag)`)) fail('touch should not start a month drag');
  const monthTarget = await evaluate(`(()=>{const cells=[...document.querySelectorAll('.calendar-day [data-open-day]')].map(button=>button.dataset.openDay),at=cells.indexOf(localIsoDate(__base));return cells[at<cells.length-1?at+1:at-1];})()`);
  await evaluate(`(()=>{const cell=document.querySelector('[data-open-day="${monthTarget}"]').closest('.calendar-day'),box=cell.getBoundingClientRect();__drag(${chip('.calendar-day [data-open-post="p1"]')},box.left+box.width/2,box.top+box.height/2);})()`); await wait(150);
  if (!/9:00\sAM/.test(await evaluate(prompt))) fail('a month drop should ask first');
  if (await evaluate(`document.querySelectorAll('.calendar-drop-target').length`) !== 0) fail('the highlight should clear after dropping');
  await evaluate(`__answer('yes')`); await wait(200);
  const month = JSON.parse(await evaluate(`(()=>{const at=new Date(__moves().pop().scheduleDate);return JSON.stringify({day:localIsoDate(at),hour:at.getHours(),minute:at.getMinutes()});})()`));
  if (month.day !== monthTarget || month.hour !== 9 || month.minute !== 0) fail('a month move should keep the time: ' + JSON.stringify(month));
};
