// Shared interface pieces: confirmation dialog, plain-language errors, loading placeholders.

// confirmAction({title, message, confirm, danger}) opens a small dialog and resolves true or false.
function confirmAction({title='Are you sure?',message='',confirm='Confirm',cancel='Cancel',danger=false}={}){
  return new Promise(resolve=>{
    let dialog=$('#confirm-dialog');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='confirm-dialog';dialog.className='auth-dialog confirm-dialog';dialog.setAttribute('aria-labelledby','confirm-title');document.body.appendChild(dialog);}
    dialog.innerHTML=`<form method="dialog" class="auth-form"><div class="confirm-icon ${danger?'danger':''}">${icon(danger?'alert':'info')}</div><h2 id="confirm-title">${escapeHtml(title)}</h2>${message?`<p class="confirm-message">${escapeHtml(message)}</p>`:''}<div class="confirm-actions"><button class="secondary-button" value="no" type="submit">${escapeHtml(cancel)}</button><button class="primary-button ${danger?'danger-fill':''}" value="yes" type="submit">${escapeHtml(confirm)}</button></div></form>`;
    let settled=false;
    const finish=answer=>{if(settled)return;settled=true;dialog.removeEventListener('close',onClose);if(dialog.open)dialog.close();resolve(answer);};
    const onClose=()=>finish(false);
    dialog.querySelector('form').addEventListener('click',event=>{const button=event.target.closest('button[value]');if(!button)return;event.preventDefault();finish(button.value==='yes');});
    dialog.addEventListener('close',onClose);dialog.showModal();
    dialog.querySelector('[value=yes]').focus();
  });
}

// Turns raw failures into something a person can act on.
function friendlyError(error){
  const message=String(error?.message||error||'');
  if(/Failed to fetch|NetworkError|Load failed|network request/i.test(message))return 'Couldn’t reach SignalDesk. Check your connection and try again.';
  if(/JWT|session.*expired|invalid token|not authenticated/i.test(message))return 'Your sign-in expired. Sign in again to continue.';
  return message||'Something went wrong. Try again in a moment.';
}

// An inline error with an optional Try again button (data-retry="name" is handled by the caller).
function errorHtml(error,retry=''){
  return `<div class="inline-error" role="alert">${icon('alert')}<span>${escapeHtml(friendlyError(error))}</span>${retry?`<button type="button" class="text-button" data-retry="${escapeHtml(retry)}">Try again</button>`:''}</div>`;
}
const RETRY_HANDLERS={};
document.addEventListener('click',event=>{const button=event.target.closest('[data-retry]');if(button&&RETRY_HANDLERS[button.dataset.retry]){event.preventDefault();RETRY_HANDLERS[button.dataset.retry]();}});

// Loading placeholders.
const skeletonLine=(width='100%',height=12)=>`<span class="skeleton" style="width:${width};height:${height}px"></span>`;
function skeletonRows(count=3){return Array.from({length:count},()=>`<div class="skeleton-row"><span class="skeleton skeleton-avatar"></span><div>${skeletonLine('60%',13)}${skeletonLine('35%',11)}</div></div>`).join('');}
function skeletonStatCards(labels){return labels.map(label=>`<div class="stat-card"><div class="stat-top"><span>${escapeHtml(label)}</span></div><div class="stat-number">${skeletonLine('72px',30)}</div><div class="stat-foot">${skeletonLine('110px',11)}</div></div>`).join('');}

// Empty states: a short message and one next step.
function emptyStateHtml({iconName='info',title,body='',action='',actionAttr=''}){
  return `<div class="empty-state">${icon(iconName)}<b>${escapeHtml(title)}</b>${body?`<p>${escapeHtml(body)}</p>`:''}${action?`<button type="button" class="secondary-button" ${actionAttr}>${escapeHtml(action)}</button>`:''}</div>`;
}

// A small ⓘ that explains a term on hover or keyboard focus.
function tip(text){return `<span class="tip" tabindex="0" role="note" aria-label="${escapeHtml(text)}" data-tip="${escapeHtml(text)}">${icon('info')}</span>`;}
const TIPS={
  reach:'How many people saw your posts at least once. Each network counts this a little differently.',
  engagements:'Likes, comments, shares, saves, and clicks added together.',
  rate:'Engagements divided by reach, so posts to big and small audiences compare fairly.',
  published:'Everything posted on the connected accounts in the time frame shown, including posts made outside SignalDesk.',
  source:'“Posted with SignalDesk” are posts scheduled here. “Posted elsewhere” were made directly on the network and brought in by the account sync.',
  utm:'Adds tags to your links so Google Analytics shows which network and campaign the visitor came from.',
  shortlinks:'Swaps links for short SignalDesk links that count clicks per network. Instagram captions keep the original links.',
  reuse:'After it publishes, the post goes back into the client’s posting queue and comes around again after the wait set in the brand kit.'
};
// Static markup marks explainers with <i data-tip-key="reach"></i>.
function hydrateTips(root=document){root.querySelectorAll('i[data-tip-key]').forEach(el=>{const text=TIPS[el.dataset.tipKey];el.outerHTML=text?tip(text):'';});}
hydrateTips();

// Keyboard shortcuts (ignored while typing). ? lists them.
const SHORTCUTS=[['N','New post'],['/','Search everything'],['G then H','Go to Command Center'],['G then C','Go to Content Calendar'],['G then A','Go to Analytics'],['G then S','Go to Social Accounts'],['?','Show shortcuts']];
const GO_KEYS={h:'overview',c:'calendar',a:'analytics',s:'social-accounts',p:'composer',l:'library'};
let goPending=0;
function openShortcuts(){let dialog=$('#shortcuts-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='shortcuts-dialog';dialog.className='auth-dialog confirm-dialog';dialog.setAttribute('aria-labelledby','shortcuts-title');dialog.innerHTML=`<form method="dialog" class="auth-form"><h2 id="shortcuts-title">Keyboard shortcuts</h2><dl class="shortcut-list">${SHORTCUTS.map(([keys,label])=>`<dt>${keys.split(' then ').map(key=>`<kbd>${escapeHtml(key)}</kbd>`).join(' then ')}</dt><dd>${escapeHtml(label)}</dd>`).join('')}<dt><kbd>⌘</kbd> <kbd>K</kbd></dt><dd>Search everything</dd></dl><div class="confirm-actions"><button class="text-button" type="button" data-start-tour>Replay the tour</button><button class="text-button" type="button" data-open-feedback>Send feedback</button><span class="push"></span><button class="secondary-button" value="close">Close</button></div></form>`;document.body.appendChild(dialog);}if(!dialog.open)dialog.showModal();}
document.addEventListener('keydown',event=>{
  if(event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey)return;
  const target=event.target;if(target.closest?.('input,textarea,select,[contenteditable=""],[contenteditable=true]'))return;
  if(document.querySelector('dialog[open]')||document.body.classList.contains('signed-out'))return;
  const key=event.key.toLowerCase();
  if(goPending&&Date.now()-goPending<1200&&GO_KEYS[key]){goPending=0;event.preventDefault();showView(GO_KEYS[key]);return;}
  goPending=0;
  if(key==='g'){goPending=Date.now();return;}
  if(key==='n'){event.preventDefault();showView('composer');setTimeout(()=>$('#post-copy')?.focus(),50);return;}
  if(event.key==='/'){event.preventDefault();$('#search-button')?.click();return;}
  if(event.key==='?'){event.preventDefault();openShortcuts();}
});
$('#footer-shortcuts')?.addEventListener('click',openShortcuts);
// Phone navigation: More opens a sheet with the rest of the pages.
$('#mobile-more')?.addEventListener('click',()=>$('#mobile-more-sheet')?.showModal());
$('#mobile-more-sheet')?.addEventListener('click',event=>{const sheet=event.currentTarget;if(event.target===sheet||event.target.closest('[data-view]'))sheet.close();});

// Beta feedback: a short message that reaches the SignalDesk team, with the page and browser attached.
function openFeedback(kind='problem'){
  let dialog=$('#feedback-dialog');
  if(!dialog){
    dialog=document.createElement('dialog');dialog.id='feedback-dialog';dialog.className='auth-dialog feedback-dialog';dialog.setAttribute('aria-labelledby','feedback-title');
    dialog.innerHTML=`<form class="auth-form" id="feedback-form"><h2 id="feedback-title">Send feedback</h2><p class="feedback-intro">Found a problem or have an idea? It goes straight to the SignalDesk team at PK Works, and we’ll reply by email.</p><div class="view-tabs feedback-kinds" role="radiogroup" aria-label="Type of feedback"><button type="button" role="radio" data-kind="problem">Problem</button><button type="button" role="radio" data-kind="idea">Idea</button><button type="button" role="radio" data-kind="question">Question</button></div><label class="field-label" for="feedback-message">What happened, or what would help?</label><textarea id="feedback-message" class="field" rows="5" maxlength="3000" placeholder="For a problem, tell us what you clicked and what you expected to happen."></textarea><p class="option-hint">We’ll also see which page you were on and your browser, to help us track it down.</p><p class="feedback-status" id="feedback-status" role="status"></p><div class="confirm-actions"><button type="button" class="secondary-button" data-feedback-cancel>Cancel</button><button type="submit" class="primary-button">Send</button></div></form>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('click',event=>{const kindButton=event.target.closest('[data-kind]');if(kindButton)setFeedbackKind(kindButton.dataset.kind);if(event.target.closest('[data-feedback-cancel]')||event.target===dialog)dialog.close();});
    $('#feedback-form').addEventListener('submit',async event=>{
      event.preventDefault();const message=$('#feedback-message').value.trim(),status=$('#feedback-status'),button=event.currentTarget.querySelector('[type=submit]');
      if(message.length<3){status.textContent='Write a few words first.';return;}
      button.disabled=true;status.textContent='Sending…';
      try{await callSocialApi({action:'send-feedback',kind:dialog.dataset.kind,message,context:{view:viewNames[$('.page.active')?.id?.replace('view-','')]||'',url:location.origin+location.pathname,userAgent:navigator.userAgent,viewport:`${innerWidth}×${innerHeight}`}});dialog.close();$('#feedback-message').value='';toast('Thanks! Your feedback was sent. We’ll reply by email.');}
      catch(error){status.textContent=friendlyError(error);}finally{button.disabled=false;}
    });
  }
  setFeedbackKind(kind);$('#feedback-status').textContent='';
  document.querySelectorAll('dialog[open]').forEach(open=>{if(open!==dialog)open.close();});
  if(!dialog.open)dialog.showModal();setTimeout(()=>$('#feedback-message')?.focus(),50);
}
function setFeedbackKind(kind){const dialog=$('#feedback-dialog');if(!dialog)return;dialog.dataset.kind=kind;dialog.querySelectorAll('[data-kind]').forEach(button=>{const on=button.dataset.kind===kind;button.classList.toggle('active',on);button.setAttribute('aria-checked',String(on));});}
document.addEventListener('click',event=>{if(event.target.closest('[data-open-feedback]')){event.preventDefault();openFeedback();}});
// Darkens (or lightens) a text color until it reads clearly on its background (WCAG 4.5:1),
// so client colors picked for looks stay legible. Non-hex colors are left as they are.
function readableOn(fg,bg){const parse=hex=>/^#[0-9a-f]{6}$/i.test(hex||'')?[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)):null,text=parse(fg),back=parse(bg);if(!text||!back)return fg;const lum=([r,g,b])=>{const c=[r,g,b].map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;});return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];},ratio=(a,b)=>{const[x,y]=[lum(a),lum(b)].sort((m,n)=>n-m);return(x+0.05)/(y+0.05);},darker=lum(back)>0.18;let color=text;for(let step=0;step<20&&ratio(color,back)<4.5;step++)color=color.map(v=>Math.round(darker?v*0.9:v+(255-v)*0.12));return '#'+color.map(v=>v.toString(16).padStart(2,'0')).join('');}
// The change from the previous time frame. Very large jumps (usually an account with little
// earlier history) read better as the earlier number than as a percentage.
function periodChangeHtml(total,previous,label){const change=Math.round((total-previous)/previous*1000)/10;if(change>300)return `<span class="trend up">↗ up from ${compactNumber(previous)}</span> the previous ${label}`;return `<span class="trend ${change>=0?'up':'down'}">${change>=0?'↗':'↘'} ${Math.abs(change)}%</span> vs. previous ${label}`;}
// Explainer bubbles float above the page, so cards that clip their contents can't cut them off.
// They sit above the icon, flip below when there isn't room, and stay inside the window.
(function(){let bubble=null,current=null;
  function show(target){const text=target.dataset.tip;if(!text)return;if(!bubble){bubble=document.createElement('div');bubble.className='tip-float';bubble.setAttribute('role','tooltip');}const host=target.closest('dialog[open]')||document.body;if(bubble.parentNode!==host)host.appendChild(bubble);current=target;bubble.textContent=text;bubble.classList.remove('below');bubble.style.left='0px';bubble.style.top='0px';bubble.hidden=false;
    const icon=target.getBoundingClientRect(),box=bubble.getBoundingClientRect(),gap=8,edge=8;let top=icon.top-box.height-gap;if(top<edge){top=icon.bottom+gap;bubble.classList.add('below');}
    const left=Math.min(Math.max(edge,icon.left+icon.width/2-box.width/2),window.innerWidth-box.width-edge);bubble.style.left=`${left}px`;bubble.style.top=`${top}px`;bubble.classList.add('visible');}
  function hide(target){if(target&&target!==current)return;current=null;if(bubble){bubble.classList.remove('visible');bubble.hidden=true;}}
  document.addEventListener('mouseover',event=>{const target=event.target.closest?.('.tip[data-tip],.chart-hit[data-tip]');if(target&&target!==current)show(target);});
  document.addEventListener('mouseout',event=>{const target=event.target.closest?.('.tip[data-tip],.chart-hit[data-tip]');if(target&&!target.contains(event.relatedTarget))hide(target);});
  document.addEventListener('focusin',event=>{if(event.target.matches?.('.tip[data-tip]'))show(event.target);});
  document.addEventListener('focusout',event=>{if(event.target.matches?.('.tip[data-tip]'))hide(event.target);});
  window.addEventListener('scroll',()=>hide(),true);
})();

// Sidebar profile: a small menu for your account, theme, shortcuts, and signing in or out.
function profileMenuHtml(){const signedIn=Boolean(activeUser?.email),theme=(()=>{try{return localStorage.getItem(THEME_KEY)||'system';}catch{return'system';}})();return `${signedIn?`<div class="profile-menu-head"><b>${escapeHtml($('#profile-name')?.textContent||'')}</b><small>${escapeHtml(activeUser.email)}</small></div>`:''}<button type="button" role="menuitem" data-profile-action="account">${icon('users')}Your account</button><div class="profile-menu-theme" role="group" aria-label="Theme"><span>Theme</span><div>${[['system','Auto'],['light','Light'],['dark','Dark']].map(([value,label])=>`<button type="button" role="menuitemradio" aria-checked="${theme===value}" data-profile-theme="${value}">${label}</button>`).join('')}</div></div><button type="button" role="menuitem" data-profile-action="shortcuts">${icon('list')}Keyboard shortcuts</button><button type="button" role="menuitem" data-profile-action="feedback">${icon('send')}Send feedback</button><hr>${signedIn?`<button type="button" role="menuitem" data-profile-action="signout" class="danger">${icon('external')}Sign out</button>`:`<button type="button" role="menuitem" data-profile-action="signin">${icon('external')}Sign in</button>`}`;}
function closeProfileMenu(focus=false){const menu=$('#profile-menu'),button=$('#profile-button');if(menu)menu.hidden=true;button?.setAttribute('aria-expanded','false');if(focus)button?.focus();}
function openProfileMenu(){const button=$('#profile-button');if(!button)return;let menu=$('#profile-menu');if(!menu){menu=document.createElement('div');menu.id='profile-menu';menu.className='profile-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','Account');document.body.appendChild(menu);}menu.innerHTML=profileMenuHtml();menu.hidden=false;const box=button.getBoundingClientRect(),width=240;menu.style.width=`${width}px`;menu.style.left=`${Math.max(8,Math.min(window.innerWidth-width-8,box.left))}px`;menu.style.bottom=`${Math.max(8,window.innerHeight-box.top+6)}px`;button.setAttribute('aria-expanded','true');menu.querySelector('button')?.focus();}
$('#profile-button')?.addEventListener('click',event=>{event.stopPropagation();$('#profile-menu')&&!$('#profile-menu').hidden?closeProfileMenu():openProfileMenu();});
document.addEventListener('click',async event=>{const menu=$('#profile-menu');if(!menu||menu.hidden)return;if(!event.target.closest('#profile-menu')){closeProfileMenu();return;}const themeButton=event.target.closest('[data-profile-theme]');if(themeButton){try{localStorage.setItem(THEME_KEY,themeButton.dataset.profileTheme);}catch{}applyTheme();menu.innerHTML=profileMenuHtml();menu.querySelector(`[data-profile-theme="${themeButton.dataset.profileTheme}"]`)?.focus();return;}const action=event.target.closest('[data-profile-action]')?.dataset.profileAction;if(!action)return;closeProfileMenu();if(action==='account'){showView('settings');showSettingsSection('account');}else if(action==='shortcuts')openShortcuts();else if(action==='feedback')$('[data-open-feedback]')?.click();else if(action==='signin')openAuthDialog('signin');else if(action==='signout'){const{error}=await supabaseClient.auth.signOut();if(error){toast(friendlyError(error));return;}location.reload();}});
document.addEventListener('keydown',event=>{const menu=$('#profile-menu');if(!menu||menu.hidden)return;if(event.key==='Escape'){event.preventDefault();closeProfileMenu(true);return;}if(!['ArrowDown','ArrowUp'].includes(event.key))return;const items=[...menu.querySelectorAll('button')],at=items.indexOf(document.activeElement);event.preventDefault();items[(at+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();});
window.addEventListener('resize',()=>closeProfileMenu());
