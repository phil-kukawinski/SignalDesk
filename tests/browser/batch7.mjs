// AI and Inbox: a link in the campaign builder, suggested replies, saved replies per client, Reuse with
// a fresh take, the quick trend check, and the "What worked" summary in reports.
import fs from 'node:fs';
const stub = fs.readFileSync(new URL('../fixtures/workspace-stub.js', import.meta.url), 'utf8');
export default async ({ send, evaluate, wait, sampleData }) => {
  const check = async (ok, message) => { if (!ok) await evaluate(`console.error(${JSON.stringify('batch7: ' + message)})`); };
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(2500);
  await sampleData(); await evaluate(stub); await wait(1200);
  await evaluate(`scheduleWorkspaceSave=()=>{};scheduleDraftSave=()=>{};currentRole='admin';window.__calls=[];const real=callSocialApi;callSocialApi=async body=>{__calls.push(body);
    if(body.action==='campaign-questions')return{name:'Barrel week',docNotes:'Notes',questions:[]};
    if(body.action==='suggest-reply')return{replies:['Thanks, Sam! See you Saturday.','So glad you liked it, Sam.']};
    if(body.action==='refresh-post')return{text:'Fresh version of the post',note:'Kept the offer, new opening.'};
    if(body.action==='trends-refresh')return{report:{id:'q',focus:'quick:all',platforms:body.platforms,data:{quick:true,hashtags:[],audio:[],formats:[],posts:[],ideas:[],summary:'Quick'},created_at:new Date().toISOString()},quick:true};
    if(body.action==='report-summary')return{summary:'Reels did best this month.'};
    return real(body);};`);

  // The builder takes a link instead of a description.
  await evaluate(`openLinkBuilder()`); await wait(300);
  const builderState = await evaluate(`JSON.stringify({open:document.querySelector('#builder-dialog').open,days:builder.days,brief:builder.brief,field:Boolean(document.querySelector('#builder-link'))})`);
  await check(builderState === JSON.stringify({ open: true, days: '7', brief: 'Turn this into a week of posts.', field: true }), 'Turn a link into posts opens the builder for a week: ' + builderState);
  await evaluate(`(async()=>{const i=document.querySelector('#builder-link');i.value='example.com/blog/barrel-day';i.dispatchEvent(new Event('input',{bubbles:true}));builder.link=i.value;builder.networks=new Set(['facebook']);await builderAsk();})()`); await wait(400);
  await check(await evaluate(`__calls.find(c=>c.action==='campaign-questions')?.sourceUrl`) === 'example.com/blog/barrel-day', 'the link goes with the request');
  await evaluate(`builder.link='not a link';builder.file=null;builderAsk();`); await wait(200);
  await check(/doesn’t look like a web address/.test(await evaluate(`builder.error`)), 'a bad link is caught');
  await evaluate(`document.querySelector('#builder-dialog').close()`);

  // Suggested replies and saved replies per client, on a comment's reply form.
  const job = await evaluate(`(()=>{const p=serverPosts.find(p=>p.jobs?.length);return JSON.stringify({job:p.jobs[0].id,client:p.clientId});})()`);
  const { job: jobId, client: clientId } = JSON.parse(job);
  await evaluate(`(()=>{const box=document.createElement('div');box.id='test-reply';box.innerHTML=replyFormHtml({id:'c1',author:'Sam Lee',text:'Loved the tasting!'},${JSON.stringify(jobId)},true);document.body.append(box);})()`);
  await check(await evaluate(`document.querySelector('#test-reply form').dataset.client`) === clientId, 'reply forms know their client');
  await evaluate(`document.querySelector('#test-reply [data-suggest-reply]').click()`); await wait(300);
  const sug = await evaluate(`JSON.stringify({call:__calls.find(c=>c.action==='suggest-reply'),items:[...document.querySelectorAll('#reply-suggest-menu [data-pick-suggestion]')].map(b=>b.textContent)})`);
  const sg = JSON.parse(sug);
  await check(sg.call.comment === 'Loved the tasting!' && sg.call.clientId === clientId && sg.items.length === 2, 'suggested replies: ' + sug);
  await evaluate(`document.querySelector('#reply-suggest-menu [data-pick-suggestion="1"]').click()`);
  await check(await evaluate(`document.querySelector('#test-reply input').value`) === 'So glad you liked it, Sam.', 'picking one fills the reply box');
  await evaluate(`(()=>{replyTemplates=[{id:'all',name:'Thanks',text:'Thank you {name}!'},{id:'mine',name:'Tasting',text:'See you at the next tasting, {name}!',clientId:${JSON.stringify(clientId)}},{id:'other',name:'Other client',text:'x',clientId:'someone-else'}];document.querySelector('#test-reply [data-reply-templates]').click();})()`); await wait(150);
  const menu = await evaluate(`JSON.stringify({items:[...document.querySelectorAll('#reply-template-menu [data-use-reply]')].map(b=>b.dataset.useReply),client:Boolean(document.querySelector('#reply-template-menu [data-save-reply-client]'))})`);
  await check(menu === JSON.stringify({ items: ['all', 'mine'], client: true }), 'the menu shows everyone’s and this client’s replies, and can save for this client: ' + menu);
  await evaluate(`(()=>{prompt=()=>'Client thanks';document.querySelector('#test-reply input').value='Thanks Sam, cheers!';document.querySelector('#reply-template-menu [data-save-reply-client]').click();})()`); await wait(100);
  await check(await evaluate(`JSON.stringify(replyTemplates.at(-1))`).then((t) => { const x = JSON.parse(t); return x.clientId === clientId && x.text === 'Thanks {name}, cheers!'; }), 'saving for this client tags it');
  await evaluate(`document.querySelector('#test-reply').remove();closeReplyTemplates();`);

  // Reuse with a fresh take, from a published post's details.
  const pub = await evaluate(`(()=>{const p=serverPosts.find(p=>p.status==='published'&&p.text);if(!p)return '';openPostDialog(p.id);return p.id;})()`); await wait(300);
  if (pub) {
    await check(await evaluate(`Boolean(document.querySelector('#post-dialog [data-refresh-post]'))`), 'published posts offer Reuse with a fresh take');
    await evaluate(`uploadedMedia=[];document.querySelector('#post-dialog [data-refresh-post]').click()`); await wait(500);
    await check(await evaluate(`document.querySelector('#post-copy').value==='Fresh version of the post'&&document.querySelector('#view-composer').classList.contains('active')&&Boolean(__calls.find(c=>c.action==='refresh-post'))`), 'the fresh take opens in the Studio');
  }

  // Quick trend check: one network only.
  await evaluate(`showView('library')`); await wait(400);
  const quick = await evaluate(`(async()=>{const boxes=[...document.querySelectorAll('#trend-platforms input')];if(!boxes.length||!document.querySelector('#quick-trends'))return 'missing';boxes.forEach((b,i)=>{b.checked=i<2;});document.querySelector('#quick-trends').click();await new Promise(r=>setTimeout(r,100));const two=__calls.filter(c=>c.action==='trends-refresh').length;boxes.forEach((b,i)=>{b.checked=i===0;});document.querySelector('#quick-trends').click();await new Promise(r=>setTimeout(r,300));const call=__calls.filter(c=>c.action==='trends-refresh').pop();return JSON.stringify({two,quick:call?.quick,platforms:call?.platforms?.length});})()`);
  await check(quick === JSON.stringify({ two: 0, quick: true, platforms: 1 }), 'quick check needs exactly one network: ' + quick);

  // Report summary: the report page offers it, and the PDF includes it.
  await check(await evaluate(`/data-summary>Write a “What worked” summary \\(AI\\)</.test(reportHtml({client:clients[0],period:{label:'October 2026'},campaign:'',data:{report:{postCount:0,totals:{},rows:[]},highlights:[],scheduled:0,previous:null}}))`), 'reports offer the summary');
  const summary = await evaluate(`(async()=>{const data={report:{postCount:1,totals:{views:10},rows:[{platform:'instagram',text:'A',metrics:{views:10,engagements:2}}]},highlights:[],previous:null};const text=await reportSummaryText({client:clients[0],period:{label:'October 2026'},data});data.summary=text;const pdf=await reportPdfBlob({client:clients[0],period:{label:'October 2026'},campaign:'',data}).text();const call=__calls.filter(c=>c.action==='report-summary').pop();return JSON.stringify({text,inPdf:/What worked/.test(pdf)&&/Reels did best this month/.test(pdf),top:call.top[0].network,byNetwork:Object.keys(call.byNetwork)});})()`);
  await check(summary === JSON.stringify({ text: 'Reels did best this month.', inPdf: true, top: 'Instagram', byNetwork: ['Instagram'] }), 'report summary: ' + summary);
};
