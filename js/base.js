// Shared helpers, sample data, and navigation.
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const toast = (message) => { const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(window._toastTimer); window._toastTimer=setTimeout(()=>el.classList.remove('show'),2600); };
const posts = [
 {day:'TODAY',time:'10:00 AM',client:'Bright School Kits',initials:'BS',color:'coral',title:'5 ways to make classroom setup easier',channel:'Instagram',status:'Scheduled',date:'2026-10-16',cls:'event-coral'},
 {day:'TODAY',time:'12:30 PM',client:'PK Works',initials:'PK',color:'blue-bg',title:'A smarter way to plan your next campaign',channel:'LinkedIn',status:'Scheduled',date:'2026-10-16',cls:'event-purple'},
 {day:'FRI, OCT 17',time:'9:00 AM',client:'STEM Story Kits',initials:'SS',color:'green-bg',title:'Build, test, repeat: engineering in action',channel:'Facebook',status:'In Review',date:'2026-10-17',cls:'event-green'},
 {day:'FRI, OCT 17',time:'3:00 PM',client:'Revere Rum',initials:'RR',color:'gold',title:'Meet the makers behind the spirit',channel:'Instagram',status:'Scheduled',date:'2026-10-17',cls:'event-gold'},
 {day:'MON, OCT 19',time:'10:00 AM',client:'PK Works',initials:'PK',color:'blue-bg',title:'Three ideas worth sharing this week',channel:'Facebook',status:'Draft',date:'2026-10-19',cls:'event-purple'},
 {day:'TUE, OCT 20',time:'11:30 AM',client:'Bright School Kits',initials:'BS',color:'coral',title:'A little organization goes a long way',channel:'Facebook',status:'Scheduled',date:'2026-10-20',cls:'event-coral'},
 {day:'WED, OCT 21',time:'1:00 PM',client:'STEM Story Kits',initials:'SS',color:'green-bg',title:'The story behind the challenge',channel:'Instagram',status:'In Review',date:'2026-10-21',cls:'event-green'}
];
const clients = [
 {id:'pk-works',name:'PK Works',initials:'PK',color:'purple-art',logo:'#e9e6ff',text:'#665dc8',desc:'Creative strategy, digital marketing, and web experiences.',posts:18,accounts:3,channels:['f','in','𝕏']},
 {id:'bright-school-kits',name:'Bright School Kits',initials:'BS',color:'coral-art',logo:'#ffebe8',text:'#c96a62',desc:'School supply kits that help classrooms start strong.',posts:26,accounts:3,channels:['f','◎','▶']},
 {id:'revere-rum',name:'Revere Rum',initials:'RR',color:'gold-art',logo:'#fff3d8',text:'#b68625',desc:'Craft rum, people, place, and stories behind the bottle.',posts:14,accounts:2,channels:['f','◎']},
 {id:'stem-story-kits',name:'STEM Story Kits',initials:'SS',color:'green-art',logo:'#e3f7ed',text:'#269c74',desc:'Hands-on engineering adventures inspired by books.',posts:22,accounts:4,channels:['f','◎','in','▶']},
 {id:'client-sandbox',name:'Client Sandbox',initials:'CS',color:'blue-art',logo:'#e8f1ff',text:'#5078c6',desc:'A sample workspace for testing new content workflows.',posts:6,accounts:0,channels:[]}
];
let savedPosts = [], serverPosts = [], templates = [], snippets = [], libraryAssets = [];
const allPosts = () => [...(cloudFeaturesAvailable()?[]:posts), ...savedPosts, ...serverCalendarPosts()];
function statusClass(s){return s.toLowerCase().replaceAll(' ','-');}
function renderUpcoming(){
 renderUpcomingFilters();
 const list=$('#upcoming-list'); if(!list)return;
 const all=upcomingPosts(),upcoming=all.filter(upcomingFilter).slice(0,6);if(!upcoming.length){list.innerHTML=`<p class="account-empty">${all.length?'No upcoming posts match these filters.':'Nothing scheduled yet. Posts you schedule in the Publishing Studio show up here.'}</p>`;return;}list.innerHTML=upcoming.map(post=>{const commentAction=post.providerPostId?`<button class="text-button post-comments-button" type="button" data-post-comments="${escapeHtml(post.providerPostId)}" data-post-client="${escapeHtml(post.client)}">Comments</button>`:'';return `<div class="post-row" ${post.serverId?`data-open-post="${post.serverId}" role="button" tabindex="0"`:''}><div class="post-time"><b>${post.day||new Date(post.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}).toUpperCase()}</b>${post.time}</div><div class="client-avatar ${post.color||'purple-art'}">${post.initials||'PK'}</div><div><div class="post-title">${escapeHtml(post.title)}</div><div class="post-meta"><span>${escapeHtml(post.client)}</span><span>·</span><span class="platform-mini">${escapeHtml(post.channel)}</span>${commentAction}</div></div><span class="status ${statusClass(post.status)}">${escapeHtml(post.status)}</span></div>`;}).join('');
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const viewNames={overview:'Command Center',calendar:'Content Calendar',composer:'Publishing Studio',library:'Content Library',inbox:'Social Inbox',analytics:'Analytics & Reports',clients:'Clients & Accounts','social-accounts':'Social Accounts',approvals:'Team & Approvals',settings:'Settings'};
function showView(name){if(!viewNames[name])return;if(!canView(name)){toast('Your role doesn’t include that area. Ask an admin for access.');name='overview';} $$('.page').forEach(p=>p.classList.toggle('active',p.id==='view-'+name)); $$('.nav-item[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name)); $('#crumb').textContent=viewNames[name]; window.scrollTo({top:0,behavior:'smooth'}); if(name==='calendar'){renderCalendar();loadAutopilot();loadBestTimes();loadServerPosts();}if(name==='overview'){loadServerPosts();loadOverview();} if(name==='clients')renderClients(); if(name==='social-accounts')renderSocialAccounts(); if(name==='composer'){loadComposerAccounts();if(!$('#post-copy').value.trim())applyClientDefaults();updateQueueButton();renderCampaignOptions();} if(name==='analytics'){loadSocialAnalytics();initTopPosts();renderReportControls();} if(name==='library'){loadTrends();renderLibraryFilters();renderLibrary();} if(name==='inbox'){renderCommentsPanel();loadServerPosts();showAyrshareInbox();} if(name==='approvals'){renderApprovals();loadServerPosts(true);} if(name==='settings')loadTeam();}
document.addEventListener('click',e=>{const btn=e.target.closest('[data-view]');if(btn)showView(btn.dataset.view);});
