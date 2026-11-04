// Trend signals: one scan a week per workspace. The button waits and says when the next one opens.
export default async ({ send, evaluate, wait, log, sampleData }) => {
  const fail = (message) => log.push('[exception] ' + message);
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(3000);
  await sampleData(); await wait(300);
  await evaluate(`(()=>{
    document.querySelector('#auth-dialog')?.open&&document.querySelector('#auth-dialog').close();
    cloudFeaturesAvailable=()=>true;activeUser={id:'u1',email:'owner@studio.test'};activeWorkspace={id:'w1',name:'Studio'};currentRole='admin';trendsLoaded=false;
    window.__calls=[];window.__next=null;
    window.__report={id:'t1',focus:'all',platforms:['tiktok'],created_at:new Date().toISOString(),data:{focusLabel:'All clients',summary:'A summary.',audio:[],formats:[],hashtags:[],ideas:[],mentions:[],sources:[],topPosts:[]}};
    callSocialApi=async body=>{__calls.push(body.action);if(body.action==='trends')return{report:__next?__report:null,recent:[],platforms:{},nextScanAt:__next};if(body.action==='trends-refresh')return{report:__report,cached:false,nextScanAt:new Date(Date.now()+7*86400000).toISOString()};return{};};
  })()`);
  const button = `document.querySelector('#refresh-trends')`, status = `document.querySelector('#trends-status').textContent`;

  // A free week: the button works.
  await evaluate(`loadTrends()`); await wait(200);
  if (await evaluate(`${button}.disabled`)) fail('the scan button should work when this week’s scan is free');
  if (!/No scans yet/.test(await evaluate(status))) fail('a workspace with no scans should say so');

  // Scanning uses up the week.
  await evaluate(`(()=>{const box=document.querySelector('#trend-platforms input');if(box)box.checked=true;${button}.click();})()`); await wait(300);
  if (!await evaluate(`__calls.includes('trends-refresh')`)) fail('the button should start a scan');
  if (!await evaluate(`${button}.disabled`)) fail('the button should wait after the week’s scan');
  if (!/one scan a week\. The next one opens/.test(await evaluate(status))) fail('it should say when the next scan opens: ' + await evaluate(status));

  // Coming back later: still waiting, and the report is still there.
  await evaluate(`trendsLoaded=false;${button}.disabled=false;window.__next=new Date(Date.now()+3*86400000).toISOString();loadTrends()`); await wait(200);
  if (!await evaluate(`${button}.disabled`)) fail('the button should still wait when the page reloads');
  if (!/A summary/.test(await evaluate(`document.querySelector('#trends-body').textContent`))) fail('the latest report should stay available');

  // Once the week has passed, the button works again.
  await evaluate(`trendsLoaded=false;window.__next=new Date(Date.now()-60000).toISOString();loadTrends()`); await wait(200);
  if (await evaluate(`${button}.disabled`)) fail('the button should work again once the week has passed');
};
