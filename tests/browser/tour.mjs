// First-run welcome and the guided tour (simulated sign-in, no network access).
export default async ({ send, evaluate, wait, log, sampleData }) => {
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(2500); await sampleData();
  await evaluate(`document.querySelector('#auth-dialog').close();localStorage.setItem('signaldesk-theme','light');applyTheme();cloudFeaturesAvailable=()=>true;activeUser={id:'u9',email:'phil@pkworks.co'};activeWorkspace={id:'w',name:'PK Works Studio'};currentRole='admin';clients.splice(2);serverPosts=[];serverPostsLoadedAt=Date.now();callSocialApi=async(b)=>{if(b.action==='accounts')return{accounts:[{platform:'facebook',linked:true,displayName:'PK Works'},{platform:'instagram',linked:true,displayName:'@pkworks'},{platform:'instagram_story',linked:true,displayName:'@pkworks'},{platform:'threads',linked:true,displayName:'@pkworks'},{platform:'tiktok',linked:true,displayName:'PK Works'},{platform:'youtube',linked:true,displayName:'PK Works'}]};throw new Error('offline in this test')};renderWorkspace();localStorage.removeItem('signaldesk.tour.v1:u9');maybeWelcome();`); await wait(1500);
  log.push('welcome open: ' + await evaluate(`document.querySelector('#welcome-dialog')?.open`));
  await evaluate(`document.querySelector('[data-welcome="tour"]').click()`); await wait(900);
  for (let i = 0; i < 14; i++) {
    const info = await evaluate(`tourIndex+' '+document.querySelector('#tour-title').textContent+' | target:'+document.querySelector('#tour-layer').dataset.target`);
    log.push('step ' + info);
    if (await evaluate(`tourIndex`) < 0) break;
    await evaluate(`document.querySelector('#tour-next').click()`); await wait(900);
  }
  const steps = log.filter((line) => line.startsWith('step ') && !line.startsWith('step -1')).length;
  if (steps < 8) log.push('[exception] the tour should have at least 8 steps, got ' + steps);
  if (!(await evaluate(`tourSeen()`))) log.push('[exception] finishing the tour should mark it seen');
  log.push('after: tour seen=' + await evaluate(`tourSeen()`) + ' view=' + await evaluate(`document.querySelector('.page.active').id`));
};
