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
  // Team invite links (?join=email) open sign-up with the address filled in.
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href + '?join=teammate@studio.test' }); await wait(3000);
  const join = JSON.parse(await evaluate(`JSON.stringify({open:document.querySelector('#auth-dialog').open,mode:authMode,email:document.querySelector('#auth-email').value,note:document.querySelector('#auth-message').textContent,clean:!location.search.includes('join')})`));
  log.push('join link: ' + JSON.stringify(join));
  if (!join.open || join.mode !== 'signup' || join.email !== 'teammate@studio.test' || !join.clean) log.push('[exception] a ?join= link should open sign-up with the email filled in');
  await evaluate(`sessionStorage.clear();document.querySelector('#auth-dialog').close()`);
  await sampleData();
  for (const view of ['calendar', 'composer', 'library', 'inbox', 'analytics', 'clients', 'accounts', 'team', 'settings', 'overview']) {
    await evaluate(`document.querySelector('[data-view="${view}"]')?.click()`); await wait(400);
  }
  log.push('done local load');
};
