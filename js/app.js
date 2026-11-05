// Startup.
$('#personal-mode')?.addEventListener('change',()=>{applyPersonalMode();scheduleWorkspaceSave();});
$('#auto-planning-notes')?.addEventListener('change',()=>{scheduleWorkspaceSave();renderPlanPanel();});
setInterval(checkForStateChanges,60000);document.addEventListener('visibilitychange',checkForStateChanges);
setInterval(()=>{if(document.visibilityState==='visible'&&['view-calendar','view-overview','view-approvals'].includes($('.page.active')?.id))loadServerPosts();},60000);
const workspaceReady=loadWorkspaceState().then(()=>maybeWelcome()).catch(error=>{console.error('Workspace load failed:',error);if(activeUser||!supabaseConfigured)document.body.classList.remove('signed-out');setStorageStatus('Connection failed');toast('Could not load workspace data. Check your Supabase setup.');renderWorkspace();});
// Installable app and push notifications: register the service worker on secure origins.
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost')){navigator.serviceWorker.register('/sw.js').catch(error=>console.error('Service worker failed:',error));navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='signaldesk-open-view'&&event.data.view)showView(event.data.view);});}
// Opening a notification or an emailed link can land on /#view=calendar, or /#view=social-accounts&client=<id>.
{const link=new URLSearchParams(location.hash.slice(1)),view=link.get('view'),client=link.get('client');if(view&&viewNames[view]){showView(view);history.replaceState(null,'',location.pathname);if(client&&view==='social-accounts')workspaceReady.then(()=>openClientAccounts(client));}}
