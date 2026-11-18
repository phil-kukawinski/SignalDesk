// Keeping your own copy and getting things back: the Export spreadsheet uses the importer's columns,
// Restore from a copy finds only what's missing (a deleted client and template, and an upcoming post
// that no longer exists), adds those back without touching anything else, and hands the missing
// posts to the importer, which marks them as added back.
import fs from 'node:fs';
const stub = fs.readFileSync(new URL('../fixtures/workspace-stub.js', import.meta.url), 'utf8');
export default async ({ send, evaluate, wait, log, sampleData }) => {
  const check = async (ok, message) => { if (!ok) await evaluate(`console.error(${JSON.stringify('restore: ' + message)})`); };
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(2500);
  await sampleData(); await evaluate(stub); await evaluate(`scheduleWorkspaceSave=()=>{};currentRole='admin';`); await wait(400);

  // A copy made earlier: today's workspace plus a client and a template that have since been deleted,
  // and two upcoming posts, one still scheduled and one deleted.
  await evaluate(`(()=>{const later=d=>{const t=new Date();t.setDate(t.getDate()+d);t.setHours(10,30,0,0);return t.toISOString();};
    const state=JSON.parse(JSON.stringify(collectSharedState()));
    state.clients.push({id:'harbor-coffee',name:'Harbor Coffee',initials:'HC',brand:{voice:'Warm and neighborly.'}});
    state.templates=[...(state.templates||[]),{id:'tpl-gone',name:'Weekly special',text:'This week at {client}…'}];
    const post=(id,client,text,days)=>({id,client_id:client,title:text,status:'scheduled',scheduled_for:later(days),campaign:'Fall launch',content:{text,media:['https://images.example/kit.jpg']},options:{},publish_jobs:[{platform:'facebook',status:'queued'},{platform:'instagram',status:'queued'}]});
    window.__copy={format:'signaldesk-export-1',exportedAt:new Date(Date.now()-3*86400000).toISOString(),workspace:state,
      posts:[post('11111111-1111-4111-8111-111111111111',clients[0].id,'Still on the calendar',4),post('22222222-2222-4222-8222-222222222222','harbor-coffee','Our fall menu, with a comma, and "quotes"',5),{...post('33333333-3333-4333-8333-333333333333',clients[0].id,'Went out last week',-7),status:'published'}]};
    window.__asked=[];window.__recorded=[];const real=callSocialApi;callSocialApi=async body=>{if(body.action==='record-restore'){__recorded.push(body);return{recorded:true};}if(body.action==='posts-by-id'){__asked.push(body.ids);return{posts:body.ids.includes('11111111-1111-4111-8111-111111111111')?[{id:'11111111-1111-4111-8111-111111111111',clientId:clients[0].id,status:'scheduled',scheduledFor:later(4),jobs:[]}].filter(p=>body.ids.includes(p.id)):[]};}return real(body);};})()`);

  // The Export spreadsheet can go straight back into Import CSV.
  const csv = await evaluate(`backupPostsCsv(__copy.posts,[...clients,{id:'harbor-coffee',name:'Harbor Coffee'}])`);
  const header = csv.split('\n')[0];
  log.push('export header: ' + header);
  await check(header === 'date,time,client,networks,text,media_url,campaign,cover,id,status,title', 'the spreadsheet uses the importer’s columns, plus id, status, and title: ' + header);
  await check(/Facebook;Instagram/.test(csv) && /"Our fall menu, with a comma, and ""quotes"""/.test(csv) && /post:22222222-2222-4222-8222-222222222222/.test(csv), 'networks, quoting, and ids are written so the importer reads them back');

  // Restore from a copy: open it, choose the file, see only what's missing.
  await evaluate(`showView('settings')`); await wait(400);
  await evaluate(`document.querySelector('#restore-open').click()`); await wait(200);
  await check(await evaluate(`document.querySelector('#restore-dialog').open`), 'Restore… opens the window');
  await evaluate(`(()=>{const input=document.querySelector('#restore-file'),transfer=new DataTransfer();transfer.items.add(new File(['{"not":"a copy"}'],'other.json',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change'));})()`); await wait(300);
  await check(/isn’t a SignalDesk copy/.test(await evaluate(`document.querySelector('#restore-message').textContent`)), 'a file that isn’t a copy is refused');
  await evaluate(`(()=>{const input=document.querySelector('#restore-file'),transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(__copy)],'signaldesk-2026-11-15.json',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change'));})()`); await wait(600);
  const plan = await evaluate(`document.querySelector('#restore-plan').innerText.replace(/\\s+/g,' ')`);
  log.push('plan: ' + plan.slice(0, 300));
  if (process.env.SHOTS) { const { result } = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${process.env.SHOTS}restore-plan.png`, Buffer.from(result.data, 'base64')); }
  await check(/1 client Harbor Coffee/.test(plan) && /1 template Weekly special/.test(plan) && /1 upcoming post/.test(plan), 'the plan lists the deleted client, template, and post: ' + plan);
  await check(!/saved post|snippet|library item/.test(plan), 'nothing that’s still there is offered');
  await check(await evaluate(`!document.querySelector('[data-restore-key="settings"]').checked`), 'settings stay as they are unless chosen');
  await check(JSON.stringify(await evaluate(`JSON.stringify(__asked[0])`)) && !(await evaluate(`__asked[0].includes('33333333-3333-4333-8333-333333333333')`)), 'posts that already went out aren’t looked up or offered');
  const before = await evaluate(`JSON.stringify({names:clients.map(c=>c.name),timezone:collectSettings().timezone})`);
  // A save that fails restores nothing, and the screen goes back to how it was.
  await evaluate(`window.__realSave=saveWorkspaceState;saveWorkspaceState=async()=>{sharedStateDirty=true;}`);
  await evaluate(`document.querySelector('#restore-go').click()`); await wait(600);
  const failed = JSON.parse(await evaluate(`JSON.stringify({names:clients.map(c=>c.name),message:document.querySelector('#restore-message').textContent,open:document.querySelector('#restore-dialog').open})`));
  await check(failed.open && /couldn’t be saved, so nothing was restored/.test(failed.message) && failed.names.join() === JSON.parse(before).names.join(), 'a failed save restores nothing: ' + JSON.stringify(failed));
  await evaluate(`saveWorkspaceState=async()=>{sharedStateDirty=false;}`);
  await evaluate(`document.querySelector('#restore-go').click()`); await wait(1200);
  // The results stay on screen: everything that came back by name, and the posts still to check.
  const results = JSON.parse(await evaluate(`JSON.stringify({message:document.querySelector('#restore-message').textContent,open:document.querySelector('#restore-dialog').open,text:document.querySelector('#restore-plan').innerText.replace(/\\s+/g,' '),check:!document.querySelector('#restore-posts').hidden,restore:!document.querySelector('#restore-go').hidden,done:document.querySelector('#restore-cancel').textContent,recorded:__recorded})`));
  log.push('results: ' + results.text.slice(0, 300));
  if (process.env.SHOTS) { const { result } = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${process.env.SHOTS}restore-results.png`, Buffer.from(result.data, 'base64')); }
  await check(results.open && /Restored from your copy/.test(results.text) && /Back in your workspace 1 client Harbor Coffee 1 template Weekly special/.test(results.text), 'the results list what came back by name: ' + results.text);
  await check(/Still to do 1 upcoming post Our fall menu/.test(results.text) && results.check && !results.restore && results.done === 'Done' && !results.message, 'and the posts still to check, with Check posts and Done: ' + JSON.stringify(results));
  await check(results.recorded.length === 1 && JSON.stringify(results.recorded[0].items) === JSON.stringify([{ kind: 'clients', count: 1, names: ['Harbor Coffee'] }, { kind: 'templates', count: 1, names: ['Weekly special'] }]) && results.recorded[0].posts === 1 && results.recorded[0].settings === false, 'one Activity entry records what came back: ' + JSON.stringify(results.recorded));
  const activityText = await evaluate(`restoreActivityText({copyMadeAt:'2026-11-15T16:00:00Z',items:[{kind:'clients',count:1,names:['Harbor Coffee']},{kind:'templates',count:3,names:['A','B']}],settings:false,posts:1})`);
  await check(activityText === 'Copy made Nov 15, 2026 · 1 client (Harbor Coffee) · 3 templates (A, B, …) · 1 upcoming post to check', 'Activity describes the restore in words: ' + activityText);
  await evaluate(`document.querySelector('#restore-posts').click()`); await wait(800);
  const after = JSON.parse(await evaluate(`JSON.stringify({names:clients.map(c=>c.name),templates:templates.map(t=>t.name),timezone:collectSettings().timezone,csv:document.querySelector('#csv-dialog').open,rows:csvRows.map(r=>[r.record.text,csvStatusLabel(r)])})`));
  log.push('after: ' + JSON.stringify(after));
  await check(after.names.join() === [...JSON.parse(before).names, 'Harbor Coffee'].join(), 'the deleted client is back, after the others, and nothing else changed');
  await check(after.templates.includes('Weekly special'), 'the deleted template is back');
  await check(after.timezone === JSON.parse(before).timezone, 'settings are unchanged');
  await check(after.csv && after.rows.length === 1 && after.rows[0][1] === 'Ready (adds back a deleted post)', 'the missing post opens in the importer, marked as added back: ' + JSON.stringify(after.rows));
  await evaluate(`document.querySelector('#csv-dialog').close()`);
};
