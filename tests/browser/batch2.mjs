// Assigning posts (and the Assigned filter), @mentions in notes, selecting several posts and moving them
// together, repeating posts as a series, and the week-ahead email setting.
import fs from 'node:fs';
const stub = fs.readFileSync(new URL('../fixtures/workspace-stub.js', import.meta.url), 'utf8');
export default async ({ send, evaluate, wait, sampleData }) => {
  const check = async (ok, message) => { if (!ok) await evaluate(`console.error(${JSON.stringify('batch2: ' + message)})`); };
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(2500);
  await sampleData(); await evaluate(stub); await wait(1200);
  await evaluate(`scheduleWorkspaceSave=()=>{};currentRole='admin';Object.assign(teamNames,{u:'Pat Owner',sam:'Sam Lee',jo:'Jo'});window.__calls=[];const real=callSocialApi;callSocialApi=async body=>{__calls.push(body);if(['assign-post','reschedule-post','cancel-post','add-note'].includes(body.action))return{ok:true,assignedTo:body.userId,notes:[]};if(body.action==='post-notes')return{notes:[]};if(body.action==='post-history')return{history:[]};return real(body);};`);

  // Assigned filter: "Assigned to me" shows only posts assigned to you; "Not assigned" hides them.
  await evaluate(`showView('calendar');calView='list';renderCalendar();`); await wait(500);
  const mine = await evaluate(`(()=>{const p=serverPosts.find(p=>p.status==='scheduled'&&Date.parse(p.scheduledFor)>Date.now());p.assignedTo='u';window.__mine=p.id;return p.id;})()`);
  const filter = async (value) => { await evaluate(`(()=>{const s=document.querySelector('#calendar-assignee');s.value='${value}';s.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(250); return JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('#calendar-list [data-open-post]')].map(e=>e.dataset.openPost))`)); };
  const onlyMine = await filter('me');
  await check(onlyMine.length === 1 && onlyMine[0] === mine, 'Assigned to me shows just that post: ' + JSON.stringify(onlyMine));
  const unassigned = await filter('none');
  await check(unassigned.length > 1 && !unassigned.includes(mine), 'Not assigned leaves it out');
  await check(await evaluate(`document.querySelector('#calendar-filter-count')?.textContent.trim()||''`) !== '', 'the filter counts as active');
  await filter('');

  // The post panel's Assigned to menu lists the team and saves the choice.
  await evaluate(`openPostDialog(__mine)`); await wait(400);
  const options = await evaluate(`[...document.querySelectorAll('[data-assign-post] option')].map(o=>o.textContent).join('|')`);
  await check(options === 'Nobody|Jo|Pat Owner (you)|Sam Lee' && await evaluate(`document.querySelector('[data-assign-post]').value`) === 'u', 'Assigned to lists the team, you marked: ' + options);
  await evaluate(`(()=>{const s=document.querySelector('[data-assign-post]');s.value='sam';s.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(300);
  await check(await evaluate(`JSON.stringify(__calls.find(c=>c.action==='assign-post'))`) === JSON.stringify({ action: 'assign-post', postId: mine, userId: 'sam' }), 'assigning sends the teammate');

  // @mentions: typing @Sa suggests Sam Lee (never yourself), Enter fills it in, and sending names Sam.
  await evaluate(`(()=>{const i=document.querySelector('#post-note-input');i.focus();i.value='Can you check this @Sa';i.setSelectionRange(i.value.length,i.value.length);i.dispatchEvent(new Event('input',{bubbles:true}));})()`); await wait(150);
  const menu = await evaluate(`[...document.querySelectorAll('#note-mention-menu .note-mention')].map(b=>b.textContent).join('|')`);
  await check(menu === '@Sam Lee', 'the mention menu suggests Sam: ' + menu);
  await evaluate(`document.querySelector('#post-note-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`); await wait(100);
  await check(await evaluate(`document.querySelector('#post-note-input').value`) === 'Can you check this @Sam Lee ' && await evaluate(`document.querySelector('#note-mention-menu').hidden`), 'Enter fills in the name and closes the menu');
  await evaluate(`(()=>{const i=document.querySelector('#post-note-input');i.value='@Pat Owner and @Sam Lee, thoughts?';})()`);
  await evaluate(`addPostNote()`); await wait(300);
  await check(await evaluate(`JSON.stringify(__calls.find(c=>c.action==='add-note')?.mentions)`) === '["sam"]', 'the note names Sam, not yourself');
  const body = await evaluate(`noteBodyHtml('Hi @Sam Lee & @Jo <b>')`);
  await check(body === 'Hi <b class="note-at">@Sam Lee</b> &amp; <b class="note-at">@Jo</b> &lt;b&gt;', 'mentions are highlighted and the rest stays escaped: ' + body);
  await evaluate(`document.querySelector('#post-dialog').close()`);

  // Select and move: pick a post, move it a week; a published post can't be picked.
  await evaluate(`loadServerPosts=async()=>{};`);
  await evaluate(`calView='week';renderCalendar();`); await wait(400);
  await check(await evaluate(`!document.querySelector('#calendar-select').hidden`), 'admins see Select');
  await evaluate(`document.querySelector('#calendar-select').click()`); await wait(150);
  const target = await evaluate(`(()=>{const el=[...document.querySelectorAll('#calendar-timeline [data-open-post]')].find(e=>calPostMovable(serverPosts.find(p=>p.id===e.dataset.openPost)));el.click();return el.dataset.openPost;})()`); await wait(200);
  const picked = await evaluate(`JSON.stringify({open:document.querySelector('#post-dialog').open,count:document.querySelector('#cal-select-count').textContent,sel:document.querySelector('#calendar-timeline [data-open-post="${target}"]')?.classList.contains('is-selected')})`);
  await check(picked === JSON.stringify({ open: false, count: '1 selected', sel: true }), 'clicking picks the post instead of opening it: ' + picked);
  const before = await evaluate(`serverPosts.find(p=>p.id==='${target}').scheduledFor`);
  await evaluate(`document.querySelector('#cal-select-days').value='7';document.querySelector('#cal-select-move').click()`); await wait(500);
  const moved = JSON.parse(await evaluate(`JSON.stringify(__calls.filter(c=>c.action==='reschedule-post'))`));
  const days = moved.length === 1 ? Math.round((Date.parse(moved[0].scheduleDate) - Date.parse(before)) / 864e5) : null;
  const sameClock = moved.length === 1 && new Date(moved[0].scheduleDate).getHours() === new Date(before).getHours();
  await check(moved.length === 1 && moved[0].postId === target && days === 7 && sameClock, 'Move shifts the picked post 7 days at the same time: ' + JSON.stringify(moved));
  await evaluate(`document.querySelector('#cal-select-done').click()`); await wait(150);
  await check(await evaluate(`document.querySelector('#cal-select-bar').hidden&&!document.querySelector('#view-calendar').classList.contains('cal-selecting')`), 'Done leaves select mode');

  // Series: a repeat's panel says it's part of a series and offers this one, or this and the later ones.
  await evaluate(`(()=>{const base=serverPosts.find(p=>p.status==='scheduled');const at=d=>{const x=new Date();x.setDate(x.getDate()+d);x.setHours(11,0,0,0);return x.toISOString();};
    serverPosts.push({...base,id:'r0',title:'Weekly tip',scheduledFor:at(1),options:{reposts:{repeat:3,days:7}},parentId:null},{...base,id:'r1',title:'Weekly tip',scheduledFor:at(8),options:{repostOf:'r0'},parentId:'r0'},{...base,id:'r2',title:'Weekly tip',scheduledFor:at(15),options:{repostOf:'r0'},parentId:'r0'},{...base,id:'r3',title:'Weekly tip',scheduledFor:at(22),options:{repostOf:'r0'},parentId:'r0'});})()`);
  await evaluate(`openPostDialog('r1')`); await wait(300);
  const series = JSON.parse(await evaluate(`JSON.stringify({line:document.querySelector('.post-series')?.textContent||'',buttons:[...document.querySelectorAll('[data-cancel-post]')].map(b=>b.textContent+':'+(b.dataset.cancelScope||''))})`));
  await check(/A repeat in a series · 4 in all · next/.test(series.line) && JSON.stringify(series.buttons) === JSON.stringify(['Cancel this one:one', 'Cancel this and 2 later:following']), 'series line and cancel choices: ' + JSON.stringify(series));
  await evaluate(`showUndo=(m,o)=>{window.__undoMsg=m;return o.run();};document.querySelector('[data-cancel-scope="following"]').click()`); await wait(300);
  const cancel = await evaluate(`JSON.stringify({call:__calls.filter(c=>c.action==='cancel-post').pop(),msg:__undoMsg})`);
  await check(cancel === JSON.stringify({ call: { action: 'cancel-post', postId: 'r1', scope: 'following' }, msg: 'Canceled 3 posts in the series.' }), 'cancel this and later: ' + cancel);

  // Week-ahead setting is in the notification settings.
  await check(await evaluate(`Boolean(document.querySelector('#week-ahead'))&&document.querySelector('#week-ahead').closest('#notification-form')!==null`), 'the week-ahead switch is in notification settings');
};
