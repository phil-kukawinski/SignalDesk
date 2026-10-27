// Sign in, create an account (invite-only beta), reset a password, and redeem an invite code.
// Modes: signin, signup, reset (request a link), newpass (from the reset email), invite (signed in,
// but no workspace yet), account (signed in).
const AUTH_COPY={
  signin:['Welcome back','Sign in to plan, approve, and publish for your clients.'],
  signup:['Create your account','Use the invite code you were sent, or the email a teammate invited.'],
  reset:['Reset your password','We’ll email you a link to choose a new password.'],
  newpass:['Choose a new password','At least 8 characters.'],
  invite:['Enter your invite code','SignalDesk is invite-only during the beta. Enter the code you were sent to set up your workspace.'],
  account:['Your account','']
};
let authMode='signin',captchaToken='',captchaReady=false;
const INVITE_KEY='signaldesk-invite';
function storedInvite(){try{return sessionStorage.getItem(INVITE_KEY)||'';}catch{return '';}}
function cleanInvite(value){return String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,20);}
function setAuthMode(mode,message=''){authMode=mode;const[title,description]=AUTH_COPY[mode]||AUTH_COPY.signin;$('#auth-title').textContent=title;$('#auth-description').textContent=description;$('#auth-description').hidden=!description;$$('#auth-dialog [data-auth-show]').forEach(el=>{el.hidden=!el.dataset.authShow.split(' ').includes(mode);});$('#auth-tabs').hidden=!['signin','signup'].includes(mode);$$('#auth-tabs [data-auth-mode]').forEach(tab=>{tab.classList.toggle('active',tab.dataset.authMode===mode);tab.setAttribute('aria-selected',String(tab.dataset.authMode===mode));});$('#auth-password').autocomplete=mode==='signin'?'current-password':'new-password';$('#auth-password-label').textContent=mode==='newpass'?'New password':'Password';$('#auth-message').textContent=message;$('#auth-message').classList.remove('ok');if(mode==='account')$('#auth-account-email').textContent=activeUser?.email?`Signed in as ${activeUser.email}`:'';const captcha=$('#auth-captcha');if(captcha)captcha.hidden=!captchaReady||!['signin','signup','reset'].includes(mode);setTimeout(()=>{const first=mode==='invite'?$('#auth-invite-code'):mode==='newpass'?$('#auth-password'):$('#auth-email');if(first&&!first.hidden)first.focus();},30);}
function authNotice(text,ok=false){const el=$('#auth-message');el.textContent=text;el.classList.toggle('ok',ok);}
function openAuthDialog(mode,message=''){const dialog=$('#auth-dialog');if(!dialog)return;if(!supabaseConfigured||!supabaseClient){setAuthMode('signin','Cloud sync isn’t set up on this copy of SignalDesk. Changes are saved in this browser.');$('#auth-sign-in').hidden=true;$('#auth-tabs').hidden=true;if(!dialog.open)dialog.showModal();return;}const invite=storedInvite();if(invite&&$('#auth-invite'))$('#auth-invite').value=invite;setAuthMode(mode||(activeUser?'account':invite?'signup':'signin'),message);renderCaptcha();if(!dialog.open)dialog.showModal();}
// Optional bot check (Cloudflare Turnstile). Turn it on by setting turnstileSiteKey in js/config.js
// and enabling Turnstile under Supabase → Authentication → Attack Protection with the matching secret.
function renderCaptcha(){const key=window.SIGNALDESK_CONFIG?.turnstileSiteKey,box=$('#auth-captcha');if(!key||!box||captchaReady)return;captchaReady=true;box.hidden=!['signin','signup','reset'].includes(authMode);window.onSignalDeskTurnstile=()=>{window.turnstile.render(box,{sitekey:key,callback:token=>{captchaToken=token;},'expired-callback':()=>{captchaToken='';}});};const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onSignalDeskTurnstile&render=explicit';script.async=true;document.head.appendChild(script);}
function captchaOptions(){if(!window.SIGNALDESK_CONFIG?.turnstileSiteKey)return{};if(!captchaToken)throw new Error('Complete the “I’m human” check first.');return{captchaToken};}
function resetCaptcha(){captchaToken='';try{window.turnstile?.reset();}catch{}}
async function submitAuth(){const email=$('#auth-email').value.trim(),password=$('#auth-password').value;const busy=$(`#auth-dialog [data-auth-show~="${authMode}"].primary-button`);if(busy)busy.disabled=true;try{
  if(authMode==='signin'){if(!email||!password)throw new Error('Enter your email and password.');const{error}=await supabaseClient.auth.signInWithPassword({email,password,options:captchaOptions()});if(error)throw error;$('#auth-dialog').close();await loadWorkspaceState();return;}
  if(authMode==='signup'){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Enter a valid email address.');if(password.length<8)throw new Error('Use a password of at least 8 characters.');const code=cleanInvite($('#auth-invite').value);const{data,error}=await supabaseClient.auth.signUp({email,password,options:{data:code?{invite_code:code}:{},emailRedirectTo:location.origin,...captchaOptions()}});if(error)throw error;if(!data.session){authNotice(`Check ${email} for a confirmation link, then sign in here.`,true);setAuthMode('signin',`Check ${email} for a confirmation link, then sign in.`);$('#auth-message').classList.add('ok');return;}$('#auth-dialog').close();await loadWorkspaceState();return;}
  if(authMode==='reset'){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Enter the email you signed up with.');const{error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:location.origin,...captchaOptions()});if(error)throw error;authNotice(`If ${email} has an account, a reset link is on its way. Open it on this device.`,true);return;}
  if(authMode==='newpass'){if(password.length<8)throw new Error('Use a password of at least 8 characters.');const{error}=await supabaseClient.auth.updateUser({password});if(error)throw error;authNotice('Password saved. You’re signed in.',true);setTimeout(async()=>{$('#auth-dialog').close();await loadWorkspaceState();},900);return;}
  if(authMode==='invite'){const code=cleanInvite($('#auth-invite-code').value);if(!code)throw new Error('Enter your invite code.');const{error}=await supabaseClient.rpc('ensure_workspace',{p_invite:code});if(error)throw error;try{sessionStorage.removeItem(INVITE_KEY);}catch{}$('#auth-dialog').close();toast('Welcome to SignalDesk. Your workspace is ready.');await loadWorkspaceState();return;}
}catch(error){authNotice(/rate limit/i.test(error.message)?'Too many attempts or emails right now. Wait a few minutes and try again.':/Email not confirmed/i.test(error.message)?'Confirm your email first: open the link we sent, then sign in.':/Invalid login/i.test(error.message)?'That email and password don’t match an account.':error.message);resetCaptcha();}finally{if(busy)busy.disabled=false;}}
$('#auth-form')?.addEventListener('submit',event=>{event.preventDefault();submitAuth();});
$('#auth-tabs')?.addEventListener('click',event=>{const tab=event.target.closest('[data-auth-mode]');if(tab)setAuthMode(tab.dataset.authMode);});
$('#auth-forgot')?.addEventListener('click',()=>setAuthMode('reset'));
$('#auth-back')?.addEventListener('click',()=>setAuthMode('signin'));
// Signed out, the sign-in box is the whole page: it can't be closed until someone signs in.
const authLocked=()=>document.body.classList.contains('signed-out');
$('#auth-close')?.addEventListener('click',()=>{if(!authLocked())$('#auth-dialog').close();});
$('#auth-dialog')?.addEventListener('click',event=>{if(event.target===$('#auth-dialog')&&!authLocked())$('#auth-dialog').close();});
$('#auth-dialog')?.addEventListener('cancel',event=>{if(authLocked())event.preventDefault();});
$('#auth-sign-out')?.addEventListener('click',async()=>{const{error}=await supabaseClient.auth.signOut();if(error){authNotice(error.message);return;}location.reload();});
$('#auth-account-settings')?.addEventListener('click',()=>{$('#auth-dialog').close();showView('settings');setTimeout(()=>$('#account-panel')?.scrollIntoView({behavior:'smooth',block:'start'}),200);});
// Invite links look like /?invite=CODE; remember the code for the sign-up form.
{const params=new URLSearchParams(location.search),code=cleanInvite(params.get('invite'));if(code){try{sessionStorage.setItem(INVITE_KEY,code);}catch{}params.delete('invite');history.replaceState(null,'',location.pathname+(params.toString()?`?${params}`:'')+location.hash);}}
// Password reset links sign the person in for recovery; ask for the new password.
supabaseClient?.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')openAuthDialog('newpass');});
