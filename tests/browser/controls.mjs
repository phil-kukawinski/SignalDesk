export default async ({ send, evaluate, wait, log }) => {
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(4000);
  const views = ['overview', 'inbox', 'approvals', 'settings'];
  for (const view of views) {
    await evaluate(`document.querySelector('[data-view="${view}"]')?.click()`); await wait(500);
    log.push(`--- ${view}: ` + await evaluate(`(()=>{const out=[];const page=document.querySelector('.page.active');
      const visible=el=>!!(el.offsetWidth||el.offsetHeight||el.getClientRects().length)&&!el.closest('[hidden]');
      document.querySelectorAll('.workspace-switcher').forEach(el=>out.push('workspace-switcher visible='+visible(el)));
      page.querySelectorAll('.filter-chip,.view-toggle,.page-heading .secondary-button,.icon-button,.settings-nav a,.inbox-filter,.inbox-search').forEach(el=>{if(visible(el))out.push(el.className+' "'+el.textContent.trim().slice(0,30)+'"');});
      return out.join(' | ');})()`));
  }
};
