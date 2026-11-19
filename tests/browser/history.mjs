// Each section has its own address: opening one adds it to the browser's history, Back and Forward
// move between sections, reload stays put, and the older #view=… links still open their section.
export default async ({ send, evaluate, wait }) => {
  const check = async (ok, message) => { if (!ok) await evaluate(`console.error(${JSON.stringify('history: ' + message)})`); };
  const state = async () => JSON.parse(await evaluate(`JSON.stringify({hash:location.hash,view:document.querySelector('.page.active')?.id})`));
  const page = new URL('../../index.html', import.meta.url).href;
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Page.navigate', { url: page }); await wait(2500);

  await evaluate(`showView('calendar')`); await wait(300);
  await evaluate(`showView('settings')`); await wait(300);
  let now = await state();
  await check(now.hash === '#settings' && now.view === 'view-settings', 'opening a section puts it in the address: ' + JSON.stringify(now));
  await evaluate(`showView('settings')`); await wait(200);

  await evaluate(`history.back()`); await wait(500);
  now = await state();
  await check(now.hash === '#calendar' && now.view === 'view-calendar', 'Back goes to the previous section (opening the same one twice adds nothing): ' + JSON.stringify(now));
  await evaluate(`history.back()`); await wait(500);
  now = await state();
  await check(now.hash === '' && now.view === 'view-overview', 'Back again reaches the home screen: ' + JSON.stringify(now));
  await evaluate(`history.forward()`); await wait(500);
  now = await state();
  await check(now.hash === '#calendar' && now.view === 'view-calendar', 'Forward works: ' + JSON.stringify(now));

  await send('Page.reload', {}); await wait(2500);
  now = await state();
  await check(now.hash === '#calendar' && now.view === 'view-calendar', 'reload stays in the same section: ' + JSON.stringify(now));

  await send('Page.navigate', { url: 'about:blank' }); await wait(300);
  await send('Page.navigate', { url: page + '#view=analytics' }); await wait(2500);
  now = await state();
  await check(now.hash === '#analytics' && now.view === 'view-analytics', 'older #view= links still open their section: ' + JSON.stringify(now));

  await send('Page.navigate', { url: 'about:blank' }); await wait(300);
  await send('Page.navigate', { url: page + '#access_token=abc&type=recovery' }); await wait(2500);
  now = await state();
  await check(now.hash === '#access_token=abc&type=recovery' && now.view === 'view-overview', 'sign-in links are left alone: ' + JSON.stringify(now));
  await send('Page.navigate', { url: 'about:blank' }); await wait(300);
  await send('Page.navigate', { url: page + '#nonsense' }); await wait(2500);
  now = await state();
  await check(now.view === 'view-overview', 'an unknown address shows the home screen: ' + JSON.stringify(now));
};
