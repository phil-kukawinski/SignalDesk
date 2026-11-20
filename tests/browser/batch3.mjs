// Client time zones (brand kit setting, Studio note, post details note) and live updates.
import fs from 'node:fs';
const stub = fs.readFileSync(new URL('../fixtures/workspace-stub.js', import.meta.url), 'utf8');
export default async ({ send, evaluate, wait, sampleData }) => {
  const check = async (ok, message) => { if (!ok) await evaluate(`console.error(${JSON.stringify('batch3: ' + message)})`); };
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setTimezoneOverride', { timezoneId: 'America/New_York' });
  await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(2500);
  await sampleData(); await evaluate(stub); await wait(1200);
  await evaluate(`scheduleWorkspaceSave=()=>{};currentRole='admin';`);

  // The brand kit reads and fills the client's time zone; blank means the workspace's.
  const fields = await evaluate(`(()=>{const c={...clients[0],timezone:'Pacific Time (US & Canada)'};fillGoalFields(c);const shown=document.querySelector('#client-timezone').value;document.querySelector('#client-timezone').value='';const blank=readGoalFields().timezone;document.querySelector('#client-timezone').value='London';return JSON.stringify([shown,blank,readGoalFields().timezone]);})()`);
  await check(fields === JSON.stringify(['Pacific Time (US & Canada)', '', 'London']), 'brand kit time zone: ' + fields);

  // The note shows only when the client has its own zone with a different clock.
  const notes = await evaluate(`(()=>{const when=new Date('2026-12-01T15:00:00-05:00');return JSON.stringify([clientTimeNote({name:'Revere',timezone:'Pacific Time (US & Canada)'},when),clientTimeNote({name:'PK',timezone:'Eastern Time (US & Canada)'},when),clientTimeNote({name:'PK'},when),clientTimeNote({name:'Kiwi',timezone:'London'},when)]);})()`);
  await check(notes === JSON.stringify(['That’s Tue at 12:00 PM Pacific Time for Revere.', '', '', 'That’s Tue at 8:00 PM London for Kiwi.']), 'time notes: ' + notes);

  // Studio: picking a client in another zone shows the note under the date and time.
  await evaluate(`showView('composer')`); await wait(500);
  await evaluate(`(()=>{clients[1].timezone='Pacific Time (US & Canada)';const s=document.querySelector('#client-select');s.value=clients[1].name;s.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#schedule-date').value='2026-12-01';const t=document.querySelector('#schedule-time');t.value='15:00';t.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(200);
  const hint = await evaluate(`JSON.stringify({text:document.querySelector('#schedule-tz-hint').textContent,hidden:document.querySelector('#schedule-tz-hint').hidden})`);
  await check(hint === JSON.stringify({ text: `That’s Tue at 12:00 PM Pacific Time for ${await evaluate('clients[1].name')}.`, hidden: false }), 'Studio note: ' + hint);
  await evaluate(`(()=>{const s=document.querySelector('#client-select');s.value=clients[0].name;delete clients[0].timezone;s.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(150);
  await check(await evaluate(`document.querySelector('#schedule-tz-hint').hidden`), 'no note for a client on the workspace zone');

  // Live updates: a change signal reloads posts (and the open post's notes) once, shortly after.
  const live = await evaluate(`(async()=>{window.__loads=0;window.__notes=0;loadServerPosts=async()=>{__loads++;};loadPostNotes=async()=>{__notes++;};onLiveChange('publish_jobs');onLiveChange('publish_jobs');onLiveChange('scheduled_posts');await new Promise(r=>setTimeout(r,1300));return __loads;})()`);
  await check(live === 1, 'several signals in a row reload posts once: ' + live);
  const state = await evaluate(`(async()=>{window.__checks=0;checkForStateChanges=async()=>{__checks++;};onLiveChange('workspace_state');await new Promise(r=>setTimeout(r,1800));return __checks+':'+__loads;})()`);
  await check(state === '1:1', 'a settings change checks for the Reload notice instead of reloading posts: ' + state);
};
