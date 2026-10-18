// Startup.
$('#personal-mode')?.addEventListener('change',()=>{applyPersonalMode();scheduleWorkspaceSave();});
setInterval(()=>{if(document.visibilityState==='visible'&&['view-calendar','view-overview','view-approvals'].includes($('.page.active')?.id))loadServerPosts();},60000);
loadWorkspaceState().catch(error=>{console.error('Workspace load failed:',error);setStorageStatus('Connection failed');toast('Could not load workspace data. Check your Supabase setup.');renderWorkspace();});
