// Batches 8–10: connecting Bluesky and Mastodon, Plan & usage, two-factor sign-in, the "how did you
// hear" card, browser error reports, approvals on a phone, and the Spanish review page.
import fs from 'node:fs';
const stub = fs.readFileSync(new URL('../fixtures/workspace-stub.js', import.meta.url), 'utf8');
export default async ({ send, evaluate, wait, sampleData }) => {
  const check = async (ok, message) => { if (!ok) await evaluate(`console.error(${JSON.stringify('batch8: ' + message)})`); };
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(2500);
  await sampleData(); await evaluate(stub); await wait(1200);
  await evaluate(`scheduleWorkspaceSave=()=>{};currentRole='admin';window.__calls=[];window.__billing={enabled:false,plan:'beta',status:null,trialEndsAt:null,periodEnd:null,hasBillingAccount:false,credits:null,prices:{},limits:{clients:50,teamMembers:25,storageBytes:null,postsPerDay:150,aiPerDay:30,monthlyCredits:null},usage:{storageBytes:250*1048576,postsToday:3,postsThisMonth:40,aiToday:4}};const real=callSocialApi;callSocialApi=async body=>{__calls.push(body);
    if(body.action==='billing')return __billing;if(body.action==='connect-credentials')return{connected:{platform:body.platform,displayName:'PK Works',username:'pk.bsky.social'}};if(body.action==='heard-from'||body.action==='report-error')return{ok:true};if(body.action==='accounts')return{accounts:[],integrations:{bluesky:true,mastodon:true}};return real(body);};`);

  // Bluesky: Connect opens a form for the handle and app password.
  await evaluate(`showView('social-accounts')`); await wait(600);
  await evaluate(`renderSocialAccountCards([{platform:'bluesky',directAvailable:true,linked:false,status:'disconnected'},{platform:'mastodon',directAvailable:true,linked:false,status:'disconnected'}]);`); await wait(100);
  const buttons = await evaluate(`JSON.stringify(['bluesky','mastodon'].map(p=>Boolean(document.querySelector('[data-connect-provider="'+p+'"]'))))`);
  await check(buttons === '[true,true]', 'Bluesky and Mastodon have Connect buttons: ' + buttons);
  await evaluate(`document.querySelector('[data-connect-provider="bluesky"]').click()`); await wait(200);
  await evaluate(`(()=>{document.querySelector('#cred-a').value='pk.bsky.social';document.querySelector('#cred-b').value='abcd-efgh-ijkl-mnop';document.querySelector('#credential-form').requestSubmit();})()`); await wait(300);
  await check(await evaluate(`JSON.stringify(__calls.find(c=>c.action==='connect-credentials'))`) === JSON.stringify({ action: 'connect-credentials', clientId: await evaluate(`selectedClient('#accounts-client-select').id`), platform: 'bluesky', handle: 'pk.bsky.social', password: 'abcd-efgh-ijkl-mnop' }) && await evaluate(`!document.querySelector('#credential-dialog').open`), 'the Bluesky form sends the handle and app password');

  // Plan & usage: beta wording, usage rows; with billing on, credits and buttons.
  await evaluate(`showView('settings');document.querySelector('[data-settings-go="plan"]').click()`); await wait(400);
  const beta = await evaluate(`JSON.stringify({shown:document.querySelector('#billing-panel').classList.contains('is-current'),chip:document.querySelector('.plan-chip')?.textContent,rows:[...document.querySelectorAll('.usage-row b')].map(b=>b.textContent),buy:document.querySelectorAll('[data-billing-item]').length})`);
  const b = JSON.parse(beta);
  await check(b.shown && b.chip === 'Beta' && b.rows.includes('Storage') && b.rows.includes('AI requests today') && b.buy === 0, 'Plan & usage during the beta: ' + beta);
  await evaluate(`Object.assign(__billing,{enabled:true,plan:'free',credits:{monthly:12,promotional:5,purchased:60},prices:{pro:true,business:true,yearly:true,creditsSmall:true,creditsLarge:true},limits:{...__billing.limits,clients:2,storageBytes:2*1073741824,monthlyCredits:20}});loadBilling();`); await wait(300);
  const paid = await evaluate(`JSON.stringify({chip:document.querySelector('.plan-chip').textContent,credits:[...document.querySelectorAll('.credit-card b')].map(b=>b.textContent),items:[...document.querySelectorAll('[data-billing-item]')].map(b=>b.dataset.billingItem),limit:clientLimit()})`);
  await check(paid === JSON.stringify({ chip: 'Free', credits: ['12', '5', '60'], items: ['pro', 'business', 'credits-small', 'credits-large'], limit: 2 }), 'Plan & usage with billing on: ' + paid);
  const blocked = await evaluate(`(()=>{const before=clients.length;openClientDialog();return document.querySelector('#client-dialog').open;})()`);
  await check(!blocked, 'the client limit follows the plan');

  // Security: turning on two-factor sign-in shows a QR code and checks the code.
  await evaluate(`supabaseClient.auth.mfa={listFactors:async()=>({data:{totp:window.__factors||[],all:[]}}),enroll:async()=>({data:{id:'f1',totp:{qr_code:'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E',secret:'ABC123'}}}),challengeAndVerify:async({code})=>code==='123456'?(window.__factors=[{id:'f1',status:'verified'}],{data:{}}):{error:{message:'Invalid TOTP code entered'}},unenroll:async()=>({}),getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1',nextLevel:'aal2'}})};activeUser={id:'u',email:'owner@pkworks.co'};document.querySelector('[data-settings-go="security"]').click();`); await wait(300);
  await evaluate(`document.querySelector('[data-mfa-on]').click()`); await wait(300);
  await check(await evaluate(`/ABC123/.test(document.querySelector('#mfa-enroll').textContent)`), 'enrolling shows the key');
  await evaluate(`document.querySelector('#mfa-code').value='000000';document.querySelector('#mfa-verify').requestSubmit()`); await wait(200);
  await check(/didn’t match/.test(await evaluate(`document.querySelector('#mfa-message').textContent`)), 'a wrong code is explained');
  await evaluate(`document.querySelector('#mfa-code').value='123456';document.querySelector('#mfa-verify').requestSubmit()`); await wait(300);
  await check(await evaluate(`/Two-factor sign-in is on/.test(document.querySelector('#security-body').textContent)`), 'the right code turns it on');
  const prompt = await evaluate(`(()=>{window.__mfaDone=null;ensureMfa().then(ok=>{window.__mfaDone=ok;});return 'started';})()`); await wait(300);
  await evaluate(`document.querySelector('#mfa-signin-code').value='123456';document.querySelector('#mfa-signin').requestSubmit()`); await wait(300);
  await check(prompt === 'started' && await evaluate(`window.__mfaDone`) === true, 'signing in asks for the code first');

  // How did you hear: once, then gone.
  await evaluate(`localStorage.removeItem('signaldesk-heard-from:'+(activeWorkspace?.id||''));showView('overview');renderHeardFrom();`); await wait(200);
  await check(await evaluate(`Boolean(document.querySelector('#heard-from-card'))`), 'the question shows for admins');
  await evaluate(`(()=>{const r=document.querySelector('#heard-from-card input[value="Other"]');r.checked=true;r.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#heard-other').value='Reddit';document.querySelector('#heard-from-form').requestSubmit();})()`); await wait(200);
  await check(await evaluate(`__calls.find(c=>c.action==='heard-from')?.answer`) === 'Other: Reddit' && await evaluate(`!document.querySelector('#heard-from-card')`), 'the answer is sent and the card goes away');

  // Browser errors are reported once each.
  await evaluate(`reportBrowserError('Boom at line 1','test');reportBrowserError('Boom at line 1','test');reportBrowserError('ResizeObserver loop limit exceeded')`); await wait(100);
  await check(await evaluate(`__calls.filter(c=>c.action==='report-error').length`) === 1, 'each error is reported once, and noise is skipped');

  // Approvals on a phone: cards with full-width buttons.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await evaluate(`showView('approvals')`); await wait(600);
  const phone = await evaluate(`(()=>{const row=document.querySelector('.approval-table-row'),button=row?.querySelector('.approval-actions button');if(!row)return 'none';return JSON.stringify({cols:getComputedStyle(row).gridTemplateColumns.split(' ').length,tall:button.getBoundingClientRect().height>=44,wide:button.getBoundingClientRect().width>120,head:getComputedStyle(document.querySelector('.approval-table-head')).display});})()`);
  if (phone !== 'none') await check(phone === JSON.stringify({ cols: 1, tall: true, wide: true, head: 'none' }), 'approvals fit a phone: ' + phone);
  await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 1000, deviceScaleFactor: 1, mobile: false });

  // Spanish review page.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.pathname.endsWith('review.html')){window.fetch=async(url,init)=>{const body=JSON.parse(init.body);const reply=p=>({ok:true,json:async()=>p});if(body.action==='load')return reply({client:{name:'Revere Rum',language:'es',initials:'RR',color:'#336699',logo:''},workspace:'PK Works',expiresAt:new Date(Date.now()+864e6).toISOString(),campaign:'',posts:[{id:'0'.repeat(36),title:'Barrel day',scheduledFor:new Date(Date.now()+864e5).toISOString(),status:'waiting',clientStatus:null,campaign:'',versions:[{platform:'instagram',label:'Instagram',text:'Barrel day!',media:[]}],notes:[{author:'Ana',body:'Love it',decision:'approved'}]}]});return reply({ok:true});};}` });
  await send('Page.navigate', { url: new URL('../../review.html', import.meta.url).href + '#t=' + 'a'.repeat(43) }); await wait(1200);
  const es = await evaluate(`JSON.stringify({lang:document.documentElement.lang,tabs:[...document.querySelectorAll('[data-portal]')].map(t=>t.textContent),chip:document.querySelector('.review-chip')?.textContent,buttons:[...document.querySelectorAll('.review-buttons button')].map(b=>b.textContent),intro:document.querySelector('#review-intro').textContent,note:document.querySelector('.review-notes li')?.textContent,name:document.querySelector('#review-name').getAttribute('placeholder')})`);
  const e = JSON.parse(es);
  await check(e.lang === 'es' && e.tabs.join('|') === 'Publicaciones|Resultados|Enviar archivos' && e.chip === 'Espera tu aprobación' && e.buttons.join('|') === '✓ Aprobar|Pedir cambios|Solo comentar' && /^1 publicación próxima en los próximos 60 días, 1 espera tu aprobación\. Este enlace funciona hasta el /.test(e.intro) && e.note === 'Ana aprobó: Love it' && e.name === 'Para que el equipo sepa quién revisó', 'Spanish review page: ' + es);
};
