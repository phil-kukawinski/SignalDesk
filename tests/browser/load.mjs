export default async ({ send, evaluate, wait, log, sampleData }) => {
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(4000);
  // Signed out: only the sign-in box shows, and it can't be dismissed.
  const gate = JSON.parse(await evaluate(`(()=>{const d=document.querySelector('#auth-dialog');d.dispatchEvent(new Event('cancel',{cancelable:true}));d.click();document.querySelector('#auth-close').click();return JSON.stringify({signedOut:document.body.classList.contains('signed-out'),appHidden:getComputedStyle(document.querySelector('.app-shell')).display==='none',dialogOpen:d.open});})()`));
  log.push('signed out: ' + JSON.stringify(gate));
  if (!gate.signedOut || !gate.appHidden || !gate.dialogOpen) log.push('[exception] the signed-out screen should show only the sign-in box');
  await sampleData();
  for (const view of ['calendar', 'composer', 'library', 'inbox', 'analytics', 'clients', 'accounts', 'team', 'settings', 'overview']) {
    await evaluate(`document.querySelector('[data-view="${view}"]')?.click()`); await wait(400);
  }
  log.push('done local load');
};
