// Campaigns: the Campaigns page, scheduling saved drafts in bulk, drafts on the calendar, the spreadsheet
// round trip (export, edit, re-import updates in place), and approving a whole campaign on the review page.
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
    const later=days=>{const at=new Date(Date.now()+days*86400000);return localIsoDate(at);};
    window.__calls=[];window.__day=later;
    cloudFeaturesAvailable=()=>true;activeUser={id:'u1',email:'owner@studio.test'};activeWorkspace={id:'w1',name:'Studio'};currentRole='admin';
    storeSavedDrafts=async()=>{};scheduleWorkspaceSave=()=>{};
    const draft=(id,title,days)=>({id,title,client:'PK Works',platforms:['facebook'],manual:[],date:later(days),time:'09:30',state:{uploadedMedia:[],draft:title,draftOverrides:{},postOptions:{...defaultPostOptions(),campaign:'Launch'}},savedAt:new Date().toISOString()});
    savedDrafts=[draft('d1','First draft',3),draft('d2','Second draft',4)];
    window.__post={id:'11111111-0000-4000-8000-0000000000aa',clientId:'pk-works',title:'Scheduled one',status:'scheduled',source:'composer',scheduledFor:new Date(Date.now()+5*86400000).toISOString(),createdBy:'u1',campaign:'Launch',evergreen:false,clientStatus:'approved',text:'Scheduled one',media:[],platformContent:{},mediaAlt:{},options:{},jobs:[{id:'j1',platform:'facebook',provider:'direct',status:'queued'}],results:{reach:0,engagements:0,clicks:0,measured:false}};
    callSocialApi=async(body)=>{__calls.push(body);if(body.action==='campaigns')return{campaigns:[{clientId:'pk-works',campaign:'Launch',posts:1,out:0,upcoming:1,waiting:0,changes:0,reach:0,engagements:0,clicks:0,first:__post.scheduledFor,last:__post.scheduledFor}]};if(body.action==='campaign-posts')return{posts:[__post]};if(body.action==='posts-by-id')return{posts:[__post]};if(body.action==='create-review-link')return{token:'tok123'};if(body.action==='posts')return{posts:[],now:new Date().toISOString()};if(body.action==='publish'||body.action==='update-post')return{post:{scheduledFor:body.scheduleDate}};throw new Error('offline in this test');};
  })()`);

  // The list merges server campaigns with ones in saved drafts.
  await evaluate(`showView('campaigns')`); await wait(400);
  const card = await evaluate(`document.querySelector('.board-card')?.innerText.replace(/\\s+/g,' ')`);
  log.push('card: ' + card);
  if (!/Launch/.test(card) || !/2 drafts/.test(card) || !/1 scheduled/.test(card)) fail('the campaign card should show its drafts and scheduled posts');
  await shot('campaigns_list.png');

  // Detail: both drafts and the post, in date order, with only drafts selectable.
  await evaluate(`document.querySelector('.board-card').click()`); await wait(400);
  const rows = await json(`[...document.querySelectorAll('.board-table tbody tr')].map(row=>row.querySelector('.board-title').textContent+'|'+row.querySelector('.status').textContent+'|'+Boolean(row.querySelector('input')))`);
  log.push('rows: ' + rows.join(' ; '));
  if (rows.join() !== 'First draft|Draft|true,Second draft|Draft|true,Scheduled one|Scheduled|false') fail('the campaign should list drafts and posts in date order');
  await shot('campaigns_detail.png');

  // Share link opens on the campaign.
  await evaluate(`document.querySelector('[data-board-share]').click()`); await wait(200);
  const share = await evaluate(`document.querySelector('#board-share-url').value`);
  log.push('share: ' + share);
  if (!/review\.html#t=tok123&campaign=Launch$/.test(share)) fail('the share link should open the review page on this campaign');

  // The spreadsheet has drafts and editable posts, with ids.
  const csv = await evaluate(`boardCsv()`);
  log.push('csv: ' + csv.split('\r\n')[0]);
  if (!csv.startsWith('date,time,client,networks,text,media_url,campaign,id') || !csv.includes('draft:d1') || !csv.includes('post:11111111-0000-4000-8000-0000000000aa')) fail('the export should carry an id for each draft and post');

  // Re-import: a changed post and a changed draft update in place; an unchanged row does nothing; a new row stays new. Dates as Excel saves them.
  const usDate = await evaluate(`(()=>{const at=new Date(Date.now()+5*86400000);return (at.getMonth()+1)+'/'+at.getDate()+'/'+at.getFullYear();})()`);
  const reimport = await json(`(async()=>{
    csvLayout=csvDefaultLayout();
    const lines=parseCsv(boardCsv()).slice(1);
    lines[0][4]='First draft, edited';
    lines[2][4]='Scheduled one, edited';lines[2][0]=${JSON.stringify(usDate)};lines[2][1]='2:30 PM';
    lines.push([__day(9),'10:00','PK Works','Facebook','Brand new post','','Launch','']);
    csvRows=lines.map(validateCsvRow);await linkCsvTargets(csvRows);renderCsvPreview();
    return{rows:csvRows.map(row=>row.status+(row.target?':'+row.target.kind:'')),update:document.querySelector('#csv-update').textContent,updateHidden:document.querySelector('#csv-update').hidden,schedule:document.querySelector('#csv-schedule').textContent,drafts:document.querySelector('#csv-drafts').textContent};
  })()`);
  log.push('reimport: ' + JSON.stringify(reimport));
  if (reimport.rows.join() !== 'ready:draft,same:draft,ready:post,ready' || reimport.update !== 'Save 2 changes' || reimport.updateHidden || reimport.schedule !== 'Schedule 1 post' || reimport.drafts !== 'Import 1 as draft') fail('re-importing should update changed rows, skip unchanged ones, and treat rows with no id as new');
  await evaluate(`document.querySelector('#csv-update').click()`); await wait(400);
  const updated = await json(`{call:__calls.filter(c=>c.action==='update-post').pop(),draft:savedDrafts.find(d=>d.id==='d1').state.draft,publishes:__calls.filter(c=>c.action==='publish').length}`);
  log.push('updated: ' + JSON.stringify(updated.call).slice(0, 200));
  const at = new Date(updated.call?.scheduleDate);
  if (updated.call?.postId !== '11111111-0000-4000-8000-0000000000aa' || updated.call.text !== 'Scheduled one, edited' || at.getHours() !== 14 || at.getMinutes() !== 30 || updated.draft !== 'First draft, edited' || updated.publishes) fail('saving changes should update the post and draft in place, with no new posts');

  // Times and encodings people will really hand it.
  const when = await json(`[csvWhen('11/3/2026','2:30 PM').getHours(),csvWhen('2026-11-03','9:30').getMinutes(),csvWhen('11/3/26','12:05 am').getHours(),isNaN(csvWhen('2026-02-31','10:00')),isNaN(csvWhen('soon','10:00'))]`);
  log.push('dates: ' + when.join());
  if (when.join() !== '14,30,0,true,true') fail('dates should accept Excel’s formats and reject impossible ones');

  // Columns in any order, extra columns ignored, and the older plain-CSV encoding.
  const file = await json(`(async()=>{
    const latin=[...('notes,text,client,networks,date,time\\nignore me,Caf\\u00e9 opening,PK Works,Facebook,'+__day(6)+',10:00\\n')].map(ch=>ch.charCodeAt(0));
    const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(latin)],'posts.csv',{type:'text/csv'}));
    const input=document.querySelector('#csv-file');input.files=dt.files;input.dispatchEvent(new Event('change'));
    for(let i=0;i<40&&!(csvRows.length===1&&csvRows[0].record.text.startsWith('Caf'));i++)await new Promise(r=>setTimeout(r,50));
    const row=csvRows[0];return{text:row.record.text,status:row.status};
  })()`);
  log.push('file: ' + JSON.stringify(file));
  if (file.text !== 'Café opening' || file.status !== 'ready') fail('the import should take columns in any order and read Excel’s older encoding');
  await evaluate(`csvLayout=csvDefaultLayout();csvRows=[];renderCsvPreview();loadBoard()`); await wait(300);

  // Bulk: select all drafts, send for approval (asks first), and each draft leaves the list.
  await evaluate(`document.querySelector('#board-all').click()`); await wait(200);
  await shot('campaigns_bulk.png');
  await evaluate(`document.querySelector('[data-board-bulk="hold"]').click()`); await wait(300);
  const asked = await evaluate(`document.querySelector('#confirm-title').textContent`);
  log.push('asked: ' + asked);
  if (!/Send 2 posts for approval/.test(asked)) fail('bulk scheduling should ask first');
  await evaluate(`document.querySelector('#confirm-dialog button[value="yes"]').click()`); await wait(600);
  const sent = await json(`{publish:__calls.filter(c=>c.action==='publish').map(c=>[c.text,c.requiresApproval,c.campaign,c.clientId,Boolean(c.scheduleDate)]),left:savedDrafts.length}`);
  log.push('sent: ' + JSON.stringify(sent));
  if (sent.publish.length !== 2 || !sent.publish.every((p) => p[1] === true && p[2] === 'Launch' && p[3] === 'pk-works' && p[4]) || sent.left !== 0) fail('bulk send should post every draft for approval and clear them from drafts');

  // A failed draft stays, with the reason shown.
  await evaluate(`savedDrafts=[{id:'d3',title:'Old date',client:'PK Works',platforms:['facebook'],manual:[],date:'2020-01-01',time:'09:00',state:{uploadedMedia:[],draft:'Old date',draftOverrides:{},postOptions:{...defaultPostOptions(),campaign:'Launch'}},savedAt:new Date().toISOString()}];openDraftsDialog()`); await wait(300);
  const dialogText = await evaluate(`document.querySelector('#drafts-bulk').innerText`);
  log.push('drafts dialog: ' + dialogText.replace(/\s+/g, ' '));
  await evaluate(`document.querySelector('#drafts-all').click()`); await wait(100);
  await shot('drafts_bulk.png');
  await evaluate(`document.querySelector('[data-drafts-bulk="schedule"]').click()`); await wait(300);
  await evaluate(`document.querySelector('#confirm-dialog button[value="yes"]').click()`); await wait(400);
  const stayed = await json(`{left:savedDrafts.length,message:document.querySelector('#drafts-message').textContent}`);
  log.push('stayed: ' + JSON.stringify(stayed));
  if (stayed.left !== 1 || !/already passed/.test(stayed.message)) fail('a draft that can’t go should stay, with the reason shown');
  await evaluate(`document.querySelector('#drafts-dialog').close()`);

  // Dated drafts show on the calendar, marked as drafts, and open in the Studio.
  await evaluate(`savedDrafts=[{id:'d4',title:'Calendar draft',client:'PK Works',platforms:['facebook'],manual:[],date:localIsoDate(new Date()),time:'11:00',state:{uploadedMedia:[],draft:'Calendar draft',draftOverrides:{},postOptions:defaultPostOptions()},savedAt:new Date().toISOString()}];calView='month';calCursor=new Date();showView('calendar')`); await wait(500);
  const chip = await evaluate(`document.querySelector('.calendar-event.is-draft')?.title||''`);
  log.push('calendar chip: ' + chip);
  if (!/Draft/.test(chip) || !/Calendar draft/.test(chip)) fail('dated drafts should show on the calendar');
  await evaluate(`document.querySelector('.calendar-event.is-draft').click()`); await wait(300);
  if (await evaluate(`document.querySelector('#post-copy').value`) !== 'Calendar draft') fail('clicking a draft on the calendar should open it in the Studio');

  // Review page: approve a whole campaign, in chunks, with one notification at the end.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__review=[];window.fetch=async(url,init)=>{const body=JSON.parse(init.body);window.__review.push(body);const posts=Array.from({length:30},(_,i)=>({id:String(i).padStart(36,'0'),title:'Post '+i,scheduledFor:new Date(Date.now()+864e5*(i+1)).toISOString(),status:'waiting',clientStatus:i===0?'changes_requested':null,campaign:'Launch',versions:[{platform:'facebook',label:'Facebook',text:'Hello '+i,media:[]}],notes:[]}));const result=body.action==='load'?{client:{name:'PK Works',initials:'PK',color:'#336699',logo:''},workspace:'Studio',expiresAt:new Date(Date.now()+864e6).toISOString(),campaign:body.campaign,posts}:{ok:true,approved:body.postIds?.length||1,released:body.postIds?.length||0};return{ok:true,json:async()=>result};};` });
  await send('Page.navigate', { url: new URL('../../review.html', import.meta.url).href + '#t=' + 'a'.repeat(43) + '&campaign=Launch' }); await wait(1200);
  const first = await json(`{load:__review[0],intro:document.querySelector('#review-intro').textContent,button:document.querySelector('#review-approve-all').textContent}`);
  log.push('review: ' + first.intro + ' | ' + first.button);
  if (first.load.campaign !== 'Launch' || !/^Launch: 30 upcoming/.test(first.intro) || first.button !== 'Approve all 29') fail('the review page should open on the campaign and offer to approve what’s undecided');
  await shot('review_campaign.png');
  await evaluate(`document.querySelector('#review-approve-all').click()`); await wait(150);
  if (await evaluate(`document.querySelectorAll('#review-toast.show').length`) === '0' || !/Add your name/.test(await evaluate(`document.querySelector('#review-toast').textContent`))) fail('approving should ask for a name first');
  await evaluate(`document.querySelector('#review-name').value='Dana';document.querySelector('#review-approve-all').click()`); await wait(150);
  if (!/^Yes, approve all 29$/.test(await evaluate(`document.querySelector('#review-approve-all').textContent`))) fail('approve all should ask for a second click');
  if (await evaluate(`__review.filter(c=>c.action==='approve-many').length`) !== 0) fail('nothing should be approved before the second click');
  await evaluate(`document.querySelector('#review-approve-all').click()`); await wait(500);
  const batches = await json(`__review.filter(c=>c.action==='approve-many').map(c=>[c.postIds.length,c.notify,c.total,c.name])`);
  log.push('batches: ' + JSON.stringify(batches));
  if (JSON.stringify(batches) !== JSON.stringify([[25, false, 29, 'Dana'], [4, true, 29, 'Dana']])) fail('approve all should send batches and notify once');
  const after = await json(`{hidden:document.querySelector('#review-approve-all').hidden,changes:document.querySelectorAll('.review-chip.changes').length,approved:document.querySelectorAll('.review-chip.approved').length}`);
  log.push('after: ' + JSON.stringify(after));
  if (!after.hidden || after.changes !== 1 || after.approved !== 29) fail('a post with changes requested should stay undecided after approving the rest');
};
