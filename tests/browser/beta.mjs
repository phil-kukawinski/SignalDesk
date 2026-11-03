// Invite-only beta screens: sign-in modes, invite links, a fresh workspace's first run, Add client
// with Fill from website, and Settings (account deletion, beta invites). Screenshots go to $SHOTS.
import fs from 'node:fs';
const out = process.env.SHOTS || '';
export default async ({ send, evaluate, wait, log }) => {
  const shot = async (selector, name) => { if (!out) return; const r = JSON.parse(await evaluate(`JSON.stringify(document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect())`)); if (!r.width || !r.height) return; const { result } = await send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, r.x), y: Math.max(0, r.y) + (await evaluate('scrollY')), width: Math.min(r.width, 1400), height: Math.min(r.height, 1400), scale: 1 } }); fs.writeFileSync(out + name, Buffer.from(result.data, 'base64')); };
  // Never reach the real Supabase project from a test.
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href + '?invite=ab-12cd34' }); await wait(3000);
  // Sign-in box (cloud configured): an invite link opens Create account with the code filled in.
  await evaluate(`window.__auth=[];Object.assign(supabaseClient.auth,{signInWithPassword:async(a)=>{__auth.push(['signin',a.email]);return{error:{message:'Invalid login credentials'}}},signUp:async(a)=>{__auth.push(['signup',a.email,a.options.data.invite_code]);return{data:{session:null}}},resetPasswordForEmail:async(e,o)=>{__auth.push(['reset',e,o.redirectTo]);return{}},updateUser:async()=>({}),signOut:async()=>({})});supabaseClient.rpc=async(name,args)=>{__auth.push(['rpc',name,args]);return{error:args?.p_invite==='BADCODE1'?{message:'That invite code isn’t valid. It may be mistyped, used up, or expired.',hint:'invite_invalid'}:null}};`);
  log.push('invite remembered: ' + await evaluate(`sessionStorage.getItem('signaldesk-invite')`) + ' | url cleaned: ' + await evaluate(`!location.search.includes('invite')`));
  await evaluate(`openAuthDialog()`); await wait(300);
  log.push('opens in: ' + await evaluate(`authMode`) + ' | code field: ' + await evaluate(`document.querySelector('#auth-invite').value`) + ' | invite field visible: ' + await evaluate(`!document.querySelector('#auth-invite').hidden`));
  await shot('#auth-dialog', 'beta_signup.png');
  await evaluate(`document.querySelector('#auth-email').value='new@agency.test';document.querySelector('#auth-password').value='short';document.querySelector('#auth-form').requestSubmit()`); await wait(200);
  log.push('short password: ' + await evaluate(`document.querySelector('#auth-message').textContent`));
  await evaluate(`document.querySelector('#auth-password').value='long-enough-1';document.querySelector('#auth-form').requestSubmit()`); await wait(300);
  log.push('sign-up sent: ' + await evaluate(`JSON.stringify(__auth.at(-1))`) + ' | now: ' + await evaluate(`authMode`) + ' | message: ' + await evaluate(`document.querySelector('#auth-message').textContent`));
  await evaluate(`document.querySelector('[data-auth-mode="signin"]').click();document.querySelector('#auth-password').value='wrong-pass-1';document.querySelector('#auth-form').requestSubmit()`); await wait(300);
  log.push('wrong password: ' + await evaluate(`document.querySelector('#auth-message').textContent`));
  await evaluate(`document.querySelector('#auth-forgot').click()`); await wait(200);
  log.push('forgot → ' + await evaluate(`authMode`) + ' | password hidden: ' + await evaluate(`document.querySelector('#auth-password').hidden`));
  await evaluate(`document.querySelector('#auth-form').requestSubmit()`); await wait(300);
  log.push('reset sent: ' + await evaluate(`JSON.stringify(__auth.at(-1))`) + ' | ' + await evaluate(`document.querySelector('#auth-message').textContent`));
  // Signed in but no workspace: invite step.
  await evaluate(`openAuthDialog('invite')`); await wait(200);
  await evaluate(`document.querySelector('#auth-invite-code').value='badcode1';document.querySelector('#auth-form').requestSubmit()`); await wait(300);
  log.push('bad code: ' + await evaluate(`document.querySelector('#auth-message').textContent`));
  await shot('#auth-dialog', 'beta_invite.png');
  await evaluate(`document.querySelector('#auth-dialog').close()`);
  // A fresh workspace (simulated): checklist, empty clients, Add client → Fill from website.
  await evaluate(`cloudFeaturesAvailable=()=>true;activeUser={id:'u1',email:'new.person@agency.test'};activeWorkspace={id:'w-fresh',name:'My workspace'};currentRole='admin';clients.splice(0);serverPosts=[];overviewSummary=null;document.querySelectorAll('.settings-form .field')[0].value='My workspace';
    callSocialApi=async(body)=>{window.__api=(window.__api||[]).concat(body.action);if(body.action==='brand-from-site')return{brand:{site:{url:'https://harbor.test/',title:'Harbor Coffee'},description:'Small-batch roaster.',voice:'Warm and neighborly.',requiredHashtags:'#HarborCoffee',avoidWords:'cheapest',watchTerms:'Harbor Coffee',colors:['#7a4b2a','#e7b75f'],logo:'https://harbor.test/logo.png',social:{instagram:'https://instagram.com/harborcoffee'}}};if(body.action==='platform-status')return{inviteOnly:true,invites:[{code:'7KQ2MX4P',label:'Harbor Coffee',maxUses:1,uses:1,status:'used',expiresAt:new Date(Date.now()+86400000*20).toISOString(),link:'https://x/?invite=7KQ2MX4P',redeemedBy:[{email:'owner@harbor.test'}]},{code:'P3ZQ8WNA',label:'',sentTo:'friend@agency.test',maxUses:5,uses:0,status:'active',expiresAt:new Date(Date.now()+86400000*9).toISOString(),link:'https://x/?invite=P3ZQ8WNA',redeemedBy:[]}],errors:[]};if(body.action==='account-plan')return{workspace:'w-fresh',soleMember:true,members:1,blocked:null};if(body.action==='system-status')return{checkedAt:new Date().toISOString(),counts:{ok:1},checks:[],problems:[]};throw new Error('offline in this test');};
    scheduleWorkspaceSave=()=>{};renderWorkspaceSwitcher();showView('overview');renderOnboarding();`); await wait(500);
  log.push('checklist: ' + await evaluate(`document.querySelector('#onboarding-panel')?.innerText.replace(/\\s+/g,' ').slice(0,260)`));
  await shot('#onboarding-panel', 'beta_checklist.png');
  await evaluate(`showView('clients')`); await wait(300);
  log.push('empty clients: ' + await evaluate(`document.querySelector('#client-grid').innerText.replace(/\\s+/g,' ')`));
  await evaluate(`document.querySelector('[data-empty-add-client]').click()`); await wait(300);
  await shot('#client-dialog', 'beta_add_client.png');
  await evaluate(`document.querySelector('#client-name').value='Harbor Coffee Co.';document.querySelector('#client-website').value='harbor.test';document.querySelector('#client-form').requestSubmit()`); await wait(1200);
  log.push('client added: ' + await evaluate(`JSON.stringify(clients.map(c=>[c.id,c.initials,c.website]))`) + ' | brand kit open: ' + await evaluate(`document.querySelector('#brand-dialog').open`));
  log.push('brand filled: voice="' + await evaluate(`document.querySelector('#brand-voice').value`) + '" color=' + await evaluate(`document.querySelector('#brand-color-1').value`) + ' highlighted=' + await evaluate(`document.querySelectorAll('#brand-form .ai-filled').length`) + ' | status: ' + await evaluate(`document.querySelector('#brand-fill-status').textContent.slice(0,160)`));
  await shot('#brand-dialog', 'beta_brand.png');
  await evaluate(`document.querySelector('#brand-dialog').close()`);
  await evaluate(`renderOnboarding()`); await wait(200);
  await evaluate(`onboardingOpen=true;renderOnboarding()`);
  log.push('checklist after client: ' + await evaluate(`document.querySelector('#onboarding-panel .onboarding-steps').innerText.replace(/\\s+/g,' ').slice(0,200)`));
  // Settings: account and beta invites.
  await evaluate(`showView('settings')`); await wait(800);
  log.push('settings: account=' + await evaluate(`!document.querySelector('#account-panel').hidden`) + ' beta=' + await evaluate(`!document.querySelector('#beta-panel').hidden`) + ' rows=' + await evaluate(`document.querySelectorAll('#beta-list tr').length`) + ' nav beta link=' + await evaluate(`!document.querySelector('[data-settings-go="beta"]').hidden`));
  await shot('#beta-panel', 'beta_invites.png');
  await evaluate(`document.querySelector('#account-delete').click()`); await wait(400);
  log.push('delete dialog: ' + await evaluate(`document.querySelector('#delete-detail').textContent.slice(0,120)`) + ' | button disabled: ' + await evaluate(`document.querySelector('#delete-go').disabled`));
  await evaluate(`const i=document.querySelector('#delete-confirm');i.value='DELETE';i.dispatchEvent(new Event('input',{bubbles:true}))`);
  log.push('after typing DELETE, enabled: ' + await evaluate(`!document.querySelector('#delete-go').disabled`));
  await shot('#delete-dialog', 'beta_delete.png');
  await evaluate(`document.querySelector('#delete-dialog').close()`);

  // Change password while signed in: checks the two match, then saves through the session.
  await evaluate(`window.__pw=[];supabaseClient.auth.updateUser=async(body)=>{__pw.push(body.password);return{error:null};}`);
  await evaluate(`document.querySelector('#password-change').click()`); await wait(200);
  if (await evaluate(`document.querySelector('#password-form').hidden`)) log.push('[exception] Change password should open the form');
  const typePw = (a, b) => evaluate(`document.querySelector('#password-new').value=${JSON.stringify(a)};document.querySelector('#password-again').value=${JSON.stringify(b)};document.querySelector('#password-form').requestSubmit()`);
  await typePw('longenough1', 'different22'); await wait(200);
  const mismatch = await evaluate(`document.querySelector('#password-message').textContent`);
  if (!/don’t match/.test(mismatch) || await evaluate(`__pw.length`)) log.push('[exception] mismatched passwords should not save: ' + mismatch);
  await shot('#account-panel', 'account_password.png');
  await typePw('longenough1', 'longenough1'); await wait(300);
  const saved = JSON.parse(await evaluate(`JSON.stringify({pw:__pw,hidden:document.querySelector('#password-form').hidden,button:!document.querySelector('#password-change').hidden})`));
  log.push('password change: ' + JSON.stringify(saved));
  if (saved.pw.join() !== 'longenough1' || !saved.hidden || !saved.button) log.push('[exception] matching passwords should save and close the form');

  // Profile: a name and photo replace the email-based badges, and replacing a photo removes the old file.
  await evaluate(`showView('settings')`); await wait(300);
  await evaluate(`(()=>{window.__profile={updates:[],uploads:[],removed:[]};const base='https://x.supabase.co/storage/v1/object/public/social-media/'+activeUser.id+'/';supabaseClient.auth.updateUser=async body=>{__profile.updates.push(body.data);return{data:{user:{...activeUser,user_metadata:{...activeUser.user_metadata,...body.data}}},error:null};};uploadToStorage=async(file,prefix)=>{const url=base+prefix+'-'+(__profile.uploads.length+1)+'.jpg';__profile.uploads.push({prefix,type:file.type,size:file.size});return{url,path:'',name:file.name,type:file.type};};supabaseClient.storage.from=()=>({remove:async paths=>{__profile.removed.push(...paths);return{};}});})()`);
  const typeName = (name) => evaluate(`(()=>{const input=document.querySelector('#profile-display-name');input.value=${JSON.stringify(name)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const pickPhoto = (color, width, height) => evaluate(`(async()=>{const c=document.createElement('canvas');c.width=${width};c.height=${height};const g=c.getContext('2d');g.fillStyle='${color}';g.fillRect(0,0,${width},${height});const blob=await new Promise(r=>c.toBlob(r,'image/png'));await chooseProfilePhoto(new File([blob],'me.png',{type:'image/png'}));})()`);
  await typeName('  Sam   Rivera '); await pickPhoto('#2f6db3', 800, 400); await wait(200);
  await shot('#account-panel', 'account_profile.png');
  const photoSize = JSON.parse(await evaluate(`(async()=>{const b=await createImageBitmap(profileNewPhoto);return JSON.stringify([b.width,b.height,profileNewPhoto.type]);})()`));
  if (photoSize.join() !== '256,256,image/jpeg') log.push('[exception] the photo should become a 256-pixel square JPEG: ' + photoSize);
  await evaluate(`document.querySelector('#profile-form').requestSubmit()`); await wait(300);
  const profile = JSON.parse(await evaluate(`JSON.stringify({update:__profile.updates.at(-1),name:document.querySelector('#profile-name').textContent,img:document.querySelector('.profile .avatar img')?.getAttribute('src')||'',top:document.querySelector('#top-avatar img')?.getAttribute('src')||''})`));
  log.push('profile: ' + JSON.stringify(profile.update));
  if (profile.update.display_name !== 'Sam Rivera' || !/avatar-1\.jpg$/.test(profile.update.avatar_url) || profile.name !== 'Sam Rivera' || profile.img !== profile.update.avatar_url || profile.top !== profile.update.avatar_url) log.push('[exception] saving should show the new name and photo everywhere');
  await pickPhoto('#e0a030', 300, 300); await evaluate(`document.querySelector('#profile-form').requestSubmit()`); await wait(300);
  const replaced = JSON.parse(await evaluate(`JSON.stringify(__profile.removed)`));
  if (replaced.length !== 1 || !/\/avatar-1\.jpg$/.test(replaced[0])) log.push('[exception] replacing a photo should remove the old file: ' + replaced);
  await evaluate(`document.querySelector('#profile-photo-remove').click();document.querySelector('#profile-form').requestSubmit()`); await wait(300);
  const removed = JSON.parse(await evaluate(`JSON.stringify({avatar:__profile.updates.at(-1).avatar_url,initials:document.querySelector('.profile .avatar').textContent,img:Boolean(document.querySelector('.profile .avatar img'))})`));
  if (removed.avatar !== '' || removed.img || removed.initials !== 'SR') log.push('[exception] removing the photo should fall back to initials: ' + JSON.stringify(removed));
  // A failed upload changes nothing, and an unsupported file is refused with a message.
  const before = await evaluate(`__profile.updates.length`);
  await evaluate(`uploadToStorage=async()=>null`); await pickPhoto('#000000', 100, 100); await evaluate(`document.querySelector('#profile-form').requestSubmit()`); await wait(200);
  if (await evaluate(`__profile.updates.length`) !== before || !/didn’t upload/.test(await evaluate(`document.querySelector('#profile-message').textContent`))) log.push('[exception] a failed upload should leave the profile alone');
  await evaluate(`chooseProfilePhoto(new File(['x'],'x.gif',{type:'image/gif'}))`); await wait(100);
  if (!/JPG, PNG, or WebP/.test(await evaluate(`document.querySelector('#profile-message').textContent`))) log.push('[exception] an unsupported file should be refused');
};
