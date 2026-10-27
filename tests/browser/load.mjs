export default async ({ send, evaluate, wait, log, sampleData }) => {
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(4000);
  // Start without an invite code left over from another test, then reload.
  await evaluate(`sessionStorage.clear()`); await send('Page.reload'); await wait(3000);
  // Signed out: the public landing page shows (not the app); Sign in opens the sign-in box.
  const gate = JSON.parse(await evaluate(`(()=>{const d=document.querySelector('#auth-dialog');const before=d.open;document.querySelector('[data-open-signin]').click();return JSON.stringify({signedOut:document.body.classList.contains('signed-out'),appHidden:getComputedStyle(document.querySelector('.app-shell')).display==='none',landing:getComputedStyle(document.querySelector('#landing')).display!=='none',closedAtFirst:!before,opensOnClick:d.open,heading:document.querySelector('.lp-hero h1').textContent.trim()});})()`));
  log.push('signed out: ' + JSON.stringify(gate));
  if (!gate.signedOut || !gate.appHidden || !gate.landing || !gate.closedAtFirst || !gate.opensOnClick) log.push('[exception] signed out, the landing page should show and Sign in should open the sign-in box');
  await evaluate(`document.querySelector('#auth-dialog').close()`);
  await sampleData();
  for (const view of ['calendar', 'composer', 'library', 'inbox', 'analytics', 'clients', 'accounts', 'team', 'settings', 'overview']) {
    await evaluate(`document.querySelector('[data-view="${view}"]')?.click()`); await wait(400);
  }
  log.push('done local load');
};
