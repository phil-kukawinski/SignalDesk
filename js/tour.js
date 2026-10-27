// First-run experience: a welcome screen, a guided tour that spotlights the real interface, and
// a small celebration for the first scheduled post. The tour can be replayed from the sidebar,
// the shortcuts list (?), or Settings.

const TOUR_KEY='signaldesk.tour.v1';
const tourSeenKey=()=>`${TOUR_KEY}:${activeUser?.id||'local'}`;
function tourSeen(){try{return localStorage.getItem(tourSeenKey())==='done';}catch{return true;}}
function markTourSeen(){try{localStorage.setItem(tourSeenKey(),'done');}catch{}}
const isPhone=()=>matchMedia('(max-width:700px)').matches;

// Each step: where to go, what to spotlight (first visible match), and what to say.
const TOUR_STEPS=[
  {view:'overview',target:()=>isPhone()?'.mobile-tabs':'#main-nav',title:'Your home base',body:'The Command Center shows what’s scheduled, what needs you, and how posts are doing. Everything else is one click away.'},
  {view:'overview',target:'#overview-client',title:'One client or all of them',body:'Pick a client to see only their posts, approvals, and results. The same choice carries over to Analytics.',optional:true},
  {view:'overview',target:'.approval-panel',title:'Needs your attention',body:'Approvals, failed posts, and accounts to reconnect land here, so nothing slips.',admin:true},
  {view:'composer',target:'.account-select',title:'Write once, post everywhere',body:'Pick the client and tap the accounts this post goes to: Facebook, Instagram (posts and Stories), Threads, LinkedIn, Pinterest, X, YouTube, and TikTok.'},
  {view:'composer',target:'#ai-draft-button',title:'A head start from AI',body:'Describe the post and get a draft for each network in the client’s voice. Then adjust it to taste.'},
  {view:'composer',target:'.preview-column',title:'See it before it goes out',body:'The preview matches each network’s layout, and the checklist catches problems like missing images or broken links.'},
  {view:'composer',target:'#suggested-times',title:'Post at the right moment',body:'One tap picks a good time. As results come in, SignalDesk learns this client’s best times.',optional:true},
  {view:'composer',target:'#composer-actions',title:'Schedule it',body:'Schedule the post, save a draft, or send it for approval. It goes out on time, even with SignalDesk closed.'},
  {view:'calendar',target:'.calendar-panel',title:'Plan the month',body:'Everything planned and already published, in one calendar. Drag a post to move it; use Filter to focus.'},
  {view:'analytics',target:'.analytics-stats',title:'Know what works',body:'Reach, engagement, and audience growth from every source, including posts made outside SignalDesk. Export a report any time.'},
  {view:'social-accounts',target:'#social-account-grid',title:'Connect each client’s accounts',body:'Sign in on each network’s own page. Tokens stay encrypted on the server; SignalDesk never sees passwords.',admin:true},
  {view:'overview',target:'#search-button',title:'Find anything, fast',body:'Search posts, clients, and files with ⌘K. Press ? any time for keyboard shortcuts, like N for a new post.'}
];

let tourIndex=-1,tourSteps=[],tourResize=null;
function tourElements(){
  let layer=$('#tour-layer');
  if(!layer){
    layer=document.createElement('div');layer.id='tour-layer';layer.className='tour-layer';layer.hidden=true;
    layer.innerHTML='<div class="tour-spot" id="tour-spot"></div><div class="tour-card" id="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" tabindex="-1"><div class="tour-progress" id="tour-progress"></div><h2 id="tour-title"></h2><p id="tour-body"></p><div class="tour-actions"><button type="button" class="text-button" id="tour-skip">Skip tour</button><span class="push"></span><button type="button" class="secondary-button" id="tour-back">Back</button><button type="button" class="primary-button" id="tour-next">Next</button></div></div>';
    document.body.appendChild(layer);
    $('#tour-next').addEventListener('click',()=>showTourStep(tourIndex+1));
    $('#tour-back').addEventListener('click',()=>showTourStep(tourIndex-1));
    $('#tour-skip').addEventListener('click',()=>endTour(false));
    layer.addEventListener('click',event=>{if(event.target===layer)showTourStep(tourIndex+1);});
  }
  return layer;
}
function resolveTarget(step){
  const selector=typeof step.target==='function'?step.target():step.target;
  return [...document.querySelectorAll(selector)].find(el=>el.offsetParent!==null&&el.getBoundingClientRect().width>0)||null;
}
function startTour(){
  closeWelcome();document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  const admin=currentRole==='admin';
  tourSteps=TOUR_STEPS.filter(step=>(!step.admin||admin)&&canView(step.view));
  tourElements().hidden=false;document.body.classList.add('touring');
  tourResize=()=>positionTour();window.addEventListener('resize',tourResize);window.addEventListener('scroll',tourResize,{passive:true});
  document.addEventListener('keydown',tourKeys,true);
  showTourStep(0);
}
function tourKeys(event){if(tourIndex<0)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();endTour(false);}else if(event.key==='ArrowRight'){event.preventDefault();showTourStep(tourIndex+1);}else if(event.key==='ArrowLeft'){event.preventDefault();showTourStep(tourIndex-1);}}
function showTourStep(index){
  if(index<0)return;
  if(index>=tourSteps.length){endTour(true);return;}
  const step=tourSteps[index],switching=$('.page.active')?.id!==`view-${step.view}`;
  if(switching)showView(step.view);
  // Let the page render before measuring.
  setTimeout(()=>{
    const target=resolveTarget(step);
    if(!target&&step.optional){tourSteps.splice(index,1);showTourStep(index);return;}
    tourIndex=index;
    $('#tour-title').textContent=step.title;$('#tour-body').textContent=step.body;
    $('#tour-progress').innerHTML=tourSteps.map((_,i)=>`<i class="${i===index?'on':i<index?'done':''}"></i>`).join('')+`<span>${index+1} of ${tourSteps.length}</span>`;
    $('#tour-back').hidden=index===0;
    $('#tour-next').textContent=index===tourSteps.length-1?'Finish':'Next';
    if(target){const rect=target.getBoundingClientRect();if(rect.top<70||rect.bottom>innerHeight-20)target.scrollIntoView({block:rect.height>innerHeight*.6?'start':'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});}
    $('#tour-layer').dataset.target=target?'1':'';
    setTimeout(positionTour,target?260:0);positionTour();
    $('#tour-card').focus({preventScroll:true});
  },switching?280:30);
}
function positionTour(){
  if(tourIndex<0)return;
  const step=tourSteps[tourIndex],target=resolveTarget(step),spot=$('#tour-spot'),card=$('#tour-card'),pad=8;
  if(!target){spot.style.cssText='left:50%;top:50%;width:0;height:0';card.style.cssText='left:50%;top:50%;transform:translate(-50%,-50%)';return;}
  const r=target.getBoundingClientRect(),left=Math.max(6,r.left-pad),top=Math.max(6,r.top-pad),width=Math.min(innerWidth-12,r.width+pad*2),height=Math.min(innerHeight-12,r.height+pad*2);
  spot.style.cssText=`left:${left}px;top:${top}px;width:${width}px;height:${height}px`;
  const cw=Math.min(360,innerWidth-24),ch=card.offsetHeight||190,gap=14;
  let x,y;
  if(isPhone()){x=12;y=top>innerHeight/2?Math.max(12,top-ch-gap):Math.min(innerHeight-ch-12,top+height+gap);}
  else if(left+width+gap+cw<innerWidth-12){x=left+width+gap;y=Math.min(Math.max(12,top),innerHeight-ch-12);}
  else if(top+height+gap+ch<innerHeight-12){x=Math.min(Math.max(12,left),innerWidth-cw-12);y=top+height+gap;}
  else if(top-gap-ch>12){x=Math.min(Math.max(12,left),innerWidth-cw-12);y=top-gap-ch;}
  else{x=Math.max(12,left-gap-cw);y=Math.min(Math.max(12,top),innerHeight-ch-12);}
  card.style.cssText=`left:${x}px;top:${y}px;width:${cw}px`;
}
function endTour(finished){
  tourIndex=-1;markTourSeen();
  const layer=$('#tour-layer');if(layer)layer.hidden=true;document.body.classList.remove('touring');
  window.removeEventListener('resize',tourResize);window.removeEventListener('scroll',tourResize);document.removeEventListener('keydown',tourKeys,true);
  showView('overview');
  if(finished){celebrate();toast(clients.length?'You’re all set. Create your first post whenever you’re ready.':'You’re all set. Start by adding your first client.');}
}

// Welcome screen for someone's first visit.
function openWelcome(){
  let dialog=$('#welcome-dialog');
  if(!dialog){
    dialog=document.createElement('dialog');dialog.id='welcome-dialog';dialog.className='auth-dialog welcome-dialog';dialog.setAttribute('aria-labelledby','welcome-title');
    document.body.appendChild(dialog);
    dialog.addEventListener('click',event=>{if(event.target.closest('[data-welcome="tour"]'))startTour();else if(event.target.closest('[data-welcome="skip"]')){markTourSeen();closeWelcome();}});
    dialog.addEventListener('cancel',()=>markTourSeen());
  }
  const first=(activeUser?.user_metadata?.name||activeUser?.email||'').split(/[\s@.]/)[0];
  const name=first?first.charAt(0).toUpperCase()+first.slice(1):'';
  dialog.innerHTML=`<div class="welcome-hero" aria-hidden="true"><span class="signal-mark welcome-mark"><svg viewBox="0 0 40 40" focusable="false"><path d="m12 14 5.5 4M23 18l5.5-5.5M23 22l5.5 5.5M17.5 22l-5.5 5.5" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/><circle cx="20" cy="20" r="4.5" fill="currentColor"/><circle cx="10" cy="12" r="3" fill="currentColor"/><circle cx="30" cy="10" r="3" fill="currentColor"/><circle cx="30" cy="30" r="3" fill="currentColor"/><circle cx="10" cy="30" r="3" fill="currentColor"/></svg></span><div class="welcome-orbit">${['facebook','instagram','threads','linkedin','pinterest','twitter','youtube','tiktok'].map((network,index)=>{const angle=index/8*Math.PI*2-Math.PI/2;return `<i class="platform-icon ${network}" style="translate:${Math.round(Math.cos(angle)*150)}px ${Math.round(Math.sin(angle)*52)}px"></i>`;}).join('')}</div></div>
  <div class="auth-form welcome-body"><h2 id="welcome-title">Welcome to SignalDesk${name?`, ${escapeHtml(name)}`:''}</h2><p>Plan, approve, and publish for every client from one place.</p>
  <ul class="welcome-points"><li>${icon('edit')}<span><b>Write once</b> and tailor it for each network</span></li><li>${icon('calendar')}<span><b>Schedule everything</b>; it posts on time, even with SignalDesk closed</span></li><li>${icon('heart')}<span><b>See what works</b> across every account, from every source</span></li></ul>
  <div class="welcome-actions"><button type="button" class="primary-button" data-welcome="tour">${icon('sparkles')}Take the 1-minute tour</button><button type="button" class="text-button" data-welcome="skip">I’ll explore on my own</button></div></div>`;
  if(!dialog.open)dialog.showModal();
}
function closeWelcome(){const dialog=$('#welcome-dialog');if(dialog?.open)dialog.close();}
function maybeWelcome(){if(!cloudFeaturesAvailable()||tourSeen()||document.body.classList.contains('signed-out')||document.querySelector('dialog[open]'))return;setTimeout(()=>{if(!tourSeen()&&!document.querySelector('dialog[open]'))openWelcome();},700);}

// Confetti for moments worth marking. Skipped when the person prefers less motion.
function celebrate(){
  if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  const canvas=document.createElement('canvas');canvas.className='confetti';canvas.width=innerWidth*devicePixelRatio;canvas.height=innerHeight*devicePixelRatio;document.body.appendChild(canvas);
  const ctx=canvas.getContext('2d');ctx.scale(devicePixelRatio,devicePixelRatio);
  const colors=['#2f6db3','#5b9be0','#cf5f55','#b9861d','#3f8a5c','#7457c9','#e1306c'];
  const pieces=Array.from({length:140},()=>({x:innerWidth/2+(Math.random()-.5)*120,y:innerHeight*.35,vx:(Math.random()-.5)*14,vy:-Math.random()*13-4,size:5+Math.random()*6,rot:Math.random()*6,vr:(Math.random()-.5)*.3,color:colors[Math.floor(Math.random()*colors.length)],round:Math.random()<.35}));
  const started=performance.now();
  (function frame(now){
    const t=now-started;ctx.clearRect(0,0,innerWidth,innerHeight);
    for(const p of pieces){p.vy+=.32;p.vx*=.99;p.x+=p.vx;p.y+=p.vy;p.rot+=p.vr;ctx.save();ctx.globalAlpha=Math.max(0,1-t/2600);ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.fillStyle=p.color;if(p.round){ctx.beginPath();ctx.arc(0,0,p.size/2,0,7);ctx.fill();}else ctx.fillRect(-p.size/2,-p.size/3,p.size,p.size*.6);ctx.restore();}
    if(t<2600)requestAnimationFrame(frame);else canvas.remove();
  })(started);
}
// The first post someone schedules gets a celebration.
const FIRST_POST_KEY='signaldesk.firstPost';
function celebrateFirstPost(){try{const key=`${FIRST_POST_KEY}:${activeWorkspace?.id||''}`;if(localStorage.getItem(key))return;localStorage.setItem(key,'1');}catch{return;}celebrate();}
if(typeof showScheduledConfirmation==='function'){const showScheduledConfirmationBase=showScheduledConfirmation;showScheduledConfirmation=function(...args){const result=showScheduledConfirmationBase(...args);celebrateFirstPost();return result;};}

// Numbers on the Command Center count up the first time they appear.
let countedUp=false;
function countUpStats(){
  if(countedUp||matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  const numbers=$$('#view-overview .stats-grid .stat-number').filter(el=>!el.querySelector('.skeleton'));
  if(!numbers.length||!$('#view-overview').classList.contains('active'))return;
  countedUp=true;
  numbers.forEach(el=>{
    const node=[...el.childNodes].find(child=>child.nodeType===3&&/\d/.test(child.textContent));if(!node)return;
    const match=node.textContent.match(/^([\d,.]+)(.*)$/);if(!match)return;
    const target=parseFloat(match[1].replace(/,/g,'')),suffix=match[2],decimals=(match[1].split('.')[1]||'').length;if(!target)return;
    const start=performance.now(),duration=700;
    (function tick(now){const p=Math.min(1,(now-start)/duration),eased=1-Math.pow(1-p,3);node.textContent=(target*eased).toFixed(decimals)+suffix;if(p<1)requestAnimationFrame(tick);else node.textContent=match[1]+suffix;})(start);
  });
}
const renderCommandCenterTourBase=renderCommandCenter;
renderCommandCenter=function(){renderCommandCenterTourBase();requestAnimationFrame(countUpStats);};

document.addEventListener('click',event=>{if(event.target.closest('[data-start-tour]')){event.preventDefault();startTour();}});
