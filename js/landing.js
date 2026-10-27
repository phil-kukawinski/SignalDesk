// Public landing page (shown when signed out): Sign in buttons and the invite request form.
document.addEventListener('click',event=>{if(event.target.closest('[data-open-signin]')){event.preventDefault();openAuthDialog('signin');}});
$('#invite-request-form')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget,status=$('#invite-request-status'),button=form.querySelector('button[type=submit]'),data=Object.fromEntries(new FormData(form));
  if(!String(data.name||'').trim()){status.textContent='Add your name.';return;}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email||'').trim())){status.textContent='Enter a valid email address.';return;}
  button.disabled=true;status.textContent='Sending…';
  try{
    const response=await fetch('/api/invite-request',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||'That didn’t go through. Try again in a moment.');
    form.innerHTML=`<div class="lp-thanks">${icon('check')}<b>Thanks, ${escapeHtml(String(data.name).trim().split(' ')[0])}!</b><p>Your request is in. We’ll email ${escapeHtml(String(data.email).trim())} when there’s a spot for you.</p></div>`;
  }catch(error){status.textContent=friendlyError(error);button.disabled=false;}
});
