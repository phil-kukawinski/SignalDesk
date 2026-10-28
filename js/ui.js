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
