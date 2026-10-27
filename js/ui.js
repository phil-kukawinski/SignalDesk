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
  published:'Everything posted on the connected accounts in the last 30 days, including posts made outside SignalDesk.',
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
function openShortcuts(){let dialog=$('#shortcuts-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='shortcuts-dialog';dialog.className='auth-dialog confirm-dialog';dialog.setAttribute('aria-labelledby','shortcuts-title');dialog.innerHTML=`<form method="dialog" class="auth-form"><h2 id="shortcuts-title">Keyboard shortcuts</h2><dl class="shortcut-list">${SHORTCUTS.map(([keys,label])=>`<dt>${keys.split(' then ').map(key=>`<kbd>${escapeHtml(key)}</kbd>`).join(' then ')}</dt><dd>${escapeHtml(label)}</dd>`).join('')}<dt><kbd>⌘</kbd> <kbd>K</kbd></dt><dd>Search everything</dd></dl><div class="confirm-actions"><button class="secondary-button" value="close">Close</button></div></form>`;document.body.appendChild(dialog);}if(!dialog.open)dialog.showModal();}
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
