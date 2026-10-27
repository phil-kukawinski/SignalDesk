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
