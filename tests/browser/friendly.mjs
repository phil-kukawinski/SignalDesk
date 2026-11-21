// Friendlier everyday flows: a failed post explains why in plain words, with the network's own message
// under Details, and the Studio opens on the client and networks used last on this device.
import fs from 'node:fs';
const stub = fs.readFileSync(new URL('../fixtures/workspace-stub.js', import.meta.url), 'utf8');
export default async ({ send, evaluate, wait, log, sampleData }) => {
  const check = async (ok, message) => { if (!ok) await evaluate(`console.error(${JSON.stringify('friendly: ' + message)})`); };
  const setup = async () => {
    await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
    await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(2500);
    await sampleData(); await evaluate(stub); await evaluate(`scheduleWorkspaceSave=()=>{};`); await wait(400);
  };
  await setup();

  // 1. A failed post: the reason and fix first, the network's words folded away.
  await evaluate(`(()=>{const post=serverPosts.find(p=>p.status==='failed');post.jobs[0].error='The aspect ratio is not supported. (2207009)';post.jobs[0].platform='instagram';openPostDialog(post.id);})()`); await wait(500);
  const panel = await evaluate(`document.querySelector('#post-dialog-body .job-row.failed')?.innerText.replace(/\\s+/g,' ')||''`);
  log.push('failed job: ' + panel.slice(0, 200));
  await check(/Instagram doesn’t accept this image’s shape\. Crop it with Prep image/.test(panel), 'the failed job explains the problem and the fix: ' + panel);
  await check(await evaluate(`!document.querySelector('#post-dialog-body .job-raw').open`), 'the network’s own message starts folded');
  await check(/2207009/.test(await evaluate(`document.querySelector('#post-dialog-body .job-raw').textContent`)), 'Details keeps the network’s message');
  await evaluate(`(()=>{const post=serverPosts.find(p=>p.status==='failed');post.jobs[0].error='(#100) Invalid parameter';refreshPostDialog();})()`); await wait(300);
  const raw = await evaluate(`document.querySelector('#post-dialog-body .job-row.failed')?.innerText||''`);
  await check(/\(#100\) Invalid parameter/.test(raw) && !/Details/.test(raw), 'an unrecognized message is shown as the network wrote it: ' + raw);
  await evaluate(`document.querySelector('#post-dialog')?.close()`);

  // 2. The Studio remembers the client and the networks ticked for it.
  await evaluate(`showView('composer')`); await wait(800);
  await evaluate(`(()=>{const s=document.querySelector('#client-select');s.value=clients[1].name;s.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(800);
  await evaluate(`(()=>{const box=document.querySelector('.account-select input[value="instagram"]');box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(200);
  const saved = await evaluate(`localStorage.getItem('signaldesk-studio-last')`);
  log.push('remembered: ' + saved);
  await setup();
  await evaluate(`showView('composer')`); await wait(1200);
  const after = JSON.parse(await evaluate(`JSON.stringify({client:document.querySelector('#client-select').value,ticked:selectedPlatforms(),second:clients[1].name})`));
  log.push('after reload: ' + JSON.stringify(after));
  await check(after.client === after.second, 'the Studio opens on the last client: ' + JSON.stringify(after));
  await check(after.ticked.join() === 'instagram', 'and ticks the networks used last for it: ' + JSON.stringify(after));
  await evaluate(`localStorage.removeItem('signaldesk-studio-last')`);

  // 4. "New in SignalDesk" shows once for people who've had the tour, and stays gone after Got it.
  await evaluate(`(()=>{localStorage.setItem(tourSeenKey(),'done');localStorage.removeItem('signaldesk-whats-new-seen');showView('overview');renderCommandCenter();})()`); await wait(400);
  const news = await evaluate(`document.querySelector('#whats-new')?.innerText.replace(/\\s+/g,' ')||'(none)'`);
  log.push('whats new: ' + news.slice(0, 120));
  await check(/New in SignalDesk/.test(news) && /Assign posts to teammates/.test(news), 'Home shows what’s new: ' + news);
  await evaluate(`document.querySelector('[data-whats-new-close]').click()`); await wait(200);
  await evaluate(`renderCommandCenter()`); await wait(300);
  await check(await evaluate(`!document.querySelector('#whats-new')`), 'Got it hides it for good');
  await evaluate(`(()=>{localStorage.removeItem(tourSeenKey());localStorage.removeItem('signaldesk-whats-new-seen');renderCommandCenter();})()`); await wait(300);
  await check(await evaluate(`!document.querySelector('#whats-new')`), 'someone new gets the tour, not the note');

  // 5. A brand-new workspace with no clients: the Studio and Social Accounts point to adding one.
  await evaluate(`(()=>{clients.length=0;renderClientSelects();showView('composer');loadComposerAccounts();})()`); await wait(500);
  const studio = await evaluate(`document.querySelector('.account-select')?.innerText.replace(/\\s+/g,' ')||''`);
  await check(/Add a client to start posting/.test(studio), 'the Studio says to add a client first: ' + studio);
  await evaluate(`showView('social-accounts')`); await wait(500);
  const accounts = await evaluate(`document.querySelector('#social-accounts-status')?.innerText||''`);
  await check(/Add your first client/.test(accounts) && !/configure/.test(accounts), 'Social Accounts says to add a client first: ' + accounts);
  await evaluate(`document.querySelector('#social-accounts-status [data-add-first-client]').click()`); await wait(300);
  await check(await evaluate(`document.querySelector('#client-dialog')?.open===true`), 'the button opens Add client');
  await evaluate(`document.querySelector('#client-dialog')?.close()`);
};
