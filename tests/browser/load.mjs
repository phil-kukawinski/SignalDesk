export default async ({ send, evaluate, wait, log }) => {
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(4000);
  for (const view of ['calendar', 'composer', 'library', 'inbox', 'analytics', 'clients', 'accounts', 'team', 'settings', 'overview']) {
    await evaluate(`document.querySelector('[data-view="${view}"]')?.click()`); await wait(400);
  }
  log.push('done local load');
};
