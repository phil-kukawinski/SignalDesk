// Startup.
$('#personal-mode')?.addEventListener('change',()=>{applyPersonalMode();scheduleWorkspaceSave();});
$('#auto-planning-notes')?.addEventListener('change',()=>{scheduleWorkspaceSave();renderPlanPanel();});
setInterval(checkForStateChanges,60000);document.addEventListener('visibilitychange',checkForStateChanges);
setInterval(()=>{if(document.visibilityState==='visible'&&['view-calendar','view-overview','view-approvals'].includes($('.page.active')?.id))loadServerPosts();},60000);
const workspaceReady=loadWorkspaceState().then(()=>{startLiveUpdates();if(activeUser)takeSharedItems();return maybeWelcome();}).catch(error=>{console.error('Workspace load failed:',error);if(activeUser||!supabaseConfigured)document.body.classList.remove('signed-out');setStorageStatus('Connection failed');toast('Could not load workspace data. Check your Supabase setup.');renderWorkspace();});
// Installable app and push notifications: register the service worker on secure origins.
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost')){navigator.serviceWorker.register('/sw.js').catch(error=>console.error('Service worker failed:',error));navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='signaldesk-open-view'&&event.data.view){showView(event.data.view);if(event.data.post)openLinkedPost(event.data.post);}});}
// Opening a notification or an emailed link can land on /#view=calendar, or /#view=social-accounts&client=<id>.
showViewFromUrl();
// A tab left open keeps running the code it loaded. Every 10 minutes, and when the tab comes back into
// view, compare the live app's version with this one and offer a reload when they differ.
const loadedAppVersion=(document.querySelector('script[src*="app.min.js"]')?.getAttribute('src')||'').match(/[?&]v=([\w-]+)/)?.[1]||'';
let appVersionCheckedAt=0;
async function checkAppVersion(){
  if(!loadedAppVersion||document.visibilityState!=='visible'||Date.now()-appVersionCheckedAt<60000||$('#update-banner'))return;appVersionCheckedAt=Date.now();
  try{const page=await(await fetch('/',{cache:'no-store'})).text(),live=page.match(/app\.min\.js\?v=([\w-]+)/)?.[1];if(!live||live===loadedAppVersion)return;
    const banner=document.createElement('div');banner.id='update-banner';banner.className='update-banner';banner.setAttribute('role','status');
    banner.innerHTML='<span>SignalDesk was updated. Reload to get the latest version.</span><button type="button" class="primary-button" data-reload-app>Reload</button><button type="button" class="icon-button" data-dismiss-update aria-label="Not now">×</button>';
    banner.addEventListener('click',event=>{if(event.target.closest('[data-reload-app]'))location.reload();if(event.target.closest('[data-dismiss-update]'))banner.remove();});document.body.append(banner);}
  catch{/* offline: try again later */}
}
setInterval(checkAppVersion,10*60000);document.addEventListener('visibilitychange',checkAppVersion);
