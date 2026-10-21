// Composer checks: each network's preview, the tag picker, and the after-scheduling flow.
// Saves screenshots to $SHOTS (or this folder) and logs what it finds.
import fs from 'node:fs';
const out = process.env.SHOTS || new URL('.', import.meta.url).pathname;
export default async ({ send, evaluate, wait, log }) => {
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1400, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(3500);
  await evaluate(`document.querySelector('#auth-dialog')?.open&&document.querySelector('#auth-dialog').close()`);
  await evaluate(`localStorage.setItem('signaldesk-theme',${JSON.stringify(process.env.THEME || 'light')});applyTheme();document.querySelector('[data-view="composer"]').click()`); await wait(800);
  await evaluate(`(()=>{const c=document.createElement('canvas');c.width=1600;c.height=2400;const g=c.getContext('2d');g.fillStyle='#f4efe6';g.fillRect(0,0,1600,2400);g.fillStyle='#5b8db8';g.beginPath();g.arc(800,1200,600,0,7);g.fill();g.fillStyle='#1a1f3a';g.font='bold 160px sans-serif';g.textAlign='center';g.fillText('PK WORKS',800,1260);window.__img=c.toDataURL('image/png');
    selectedPlatforms=()=>['facebook','instagram','linkedin','pinterest'];
    const client=selectedClient('#client-select');socialAccountCache.set(client.id,[{platform:'instagram',linked:true,username:'pkworks',displayName:'PK Works'},{platform:'facebook',linked:true,displayName:'PK Works'},{platform:'linkedin',linked:true,displayName:'Phil Kukawinski'}]);
    document.querySelector('#post-copy').value="Your small business isn't small to you. And you deserve support that understands that. We help owners build a brand voice, a content plan, and a social presence that actually brings in customers — without hiring a full marketing department.\\n\\nBook a free 20-minute call this week 👇\\nhttps://www.pkworks.co/ #smallbusiness #marketing @pkworks";
    uploadedMedia=[{path:'',url:'https://x.supabase.co/storage/v1/object/public/social-media/u/logo.png',name:'logo.png',type:'image/png'}];sharedMediaPreview={kind:'image',src:window.__img,name:'logo.png'};updatePreview();})()`);
  await wait(800);
  const shot = async (name) => {
    await evaluate(`document.querySelector('.preview-panel').scrollIntoView({block:'start'})`); await wait(300);
    const r = JSON.parse(await evaluate(`JSON.stringify(document.querySelector('.preview-panel').getBoundingClientRect())`));
    const { result } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: r.x, y: r.y + (await evaluate('scrollY')), width: r.width, height: Math.min(r.height, 1300), scale: 1 } });
    fs.writeFileSync(out + name, Buffer.from(result.data, 'base64'));
  };
  for (const network of ['facebook', 'instagram', 'linkedin', 'pinterest']) {
    await evaluate(`document.querySelector('[data-preview-as="${network}"]')?.click()`); await wait(500);
    log.push(`${network}: label="${await evaluate(`document.querySelector('#preview-platform').textContent`)}" class=${await evaluate(`document.querySelector('.social-preview').className`)} more=${await evaluate(`!!document.querySelector('.pv-more')`)} copy="${(await evaluate(`document.querySelector('#preview-copy').innerText`)).replace(/\s+/g, ' ').slice(0, 70)}…" media inside=${await evaluate(`(()=>{const m=document.querySelector('#preview-media').getBoundingClientRect(),b=document.querySelector('.social-preview').getBoundingClientRect();return m.right<=b.right+1&&m.bottom<=b.bottom+1})()`)} note=${await evaluate(`!document.querySelector('#preview-note').hidden`)}`);
    await shot(`pv_${network}.png`);
  }
  await evaluate(`document.querySelector('.pv-more')?.click()`); await wait(300);
  log.push('after "more": expanded=' + await evaluate(`!document.querySelector('.pv-more')`));
  // Link card: Facebook without media shows the card for the first link.
  await evaluate(`uploadedMedia=[];sharedMediaPreview=null;linkPreviewCache.set('https://www.pkworks.co/',{preview:{title:'PK Works — Marketing Leadership Without the Marketing Department',image:window.__img}});document.querySelector('[data-preview-as="facebook"]').click()`); await wait(400);
  log.push('facebook link card: ' + await evaluate(`document.querySelector('.pv-card')?.innerText.replace(/\\s+/g,' ')`));
  await shot('pv_facebook_link.png');
  await evaluate(`document.querySelector('[data-preview-as="instagram"]').click()`); await wait(300);
  log.push('instagram without media: ' + await evaluate(`document.querySelector('.pv-needs-media')?.textContent`));
  // Tag picker
  await evaluate(`document.querySelector('#instagram-people').hidden=false;document.querySelector('details.option-group').open=true;`);
  const typeInto = async (text) => { await evaluate(`(()=>{const i=document.querySelector('.people-picker[data-for="ig-tags"] .people-input');i.focus();i.value=${JSON.stringify(text)};i.dispatchEvent(new Event('input',{bubbles:true}));})()`); await wait(700); };
  await typeInto('acme.co');
  log.push('picker menu: ' + await evaluate(`document.querySelector('.people-picker[data-for="ig-tags"] .people-menu').innerText.replace(/\\s+/g,' ').slice(0,200)`));
  await evaluate(`document.querySelector('.people-picker[data-for="ig-tags"] .people-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`); await wait(300);
  await typeInto('Bad Name!'); await evaluate(`document.querySelector('.people-picker[data-for="ig-tags"] .people-input').value=''`);
  await typeInto('second_account,'); await wait(300);
  log.push('picker chips: ' + await evaluate(`[...document.querySelectorAll('.people-picker[data-for="ig-tags"] .person-chip')].map(c=>c.dataset.person).join(', ')`) + ' | stored: "' + await evaluate(`postOptions.tags`) + '"');
  await evaluate(`document.querySelector('[data-remove-person="acme.co"]').click()`); await wait(200);
  log.push('after remove: "' + await evaluate(`postOptions.tags`) + '"');
  await evaluate(`(()=>{const i=document.querySelector('.people-picker[data-for="ig-collaborators"] .people-input');for(const n of ['a1','a2','a3']){i.value=n+',';i.dispatchEvent(new Event('input',{bubbles:true}));}})()`); await wait(300);
  log.push('collaborators max: ' + await evaluate(`postOptions.collaborators`) + ' input hidden=' + await evaluate(`document.querySelector('.people-picker[data-for="ig-collaborators"] .people-input').hidden`));
  const r = JSON.parse(await evaluate(`(()=>{const el=document.querySelector('.people-picker[data-for="ig-tags"]');el.scrollIntoView({block:'center'});const b=el.closest('.option-body').getBoundingClientRect();return JSON.stringify(b)})()`));
  await typeInto('pk'); await wait(400);
  const { result } = await send('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: r.y + (await evaluate('scrollY')), width: r.width, height: Math.min(r.height + 220, 700), scale: 1 } });
  fs.writeFileSync(out + 'picker.png', Buffer.from(result.data, 'base64'));
  // After scheduling: confirmation, reset, and calendar.
  log.push('default schedule: ' + await evaluate(`document.querySelector('#schedule-date').value+' '+document.querySelector('#schedule-time').value`) + ' future=' + await evaluate(`new Date(document.querySelector('#schedule-date').value+'T'+document.querySelector('#schedule-time').value)>new Date()`));
  await evaluate(`document.querySelector('#post-copy').value='Copy to clear';postOptions.campaign='Fall';callSocialApi=async()=>({status:'scheduled',post:{id:'p-new',scheduledFor:new Date(Date.now()+3*86400000).toISOString(),reposts:0},queuedComments:1});selectedManual=()=>['tiktok'];loadServerPosts=async()=>{};loadOverview=()=>{};activeUser={id:'u'};`);
  await evaluate(`publishSocialPost(false,false,false)`); await wait(800);
  log.push('dialog: open=' + await evaluate(`document.querySelector('#scheduled-dialog').open`) + ' "' + await evaluate(`document.querySelector('#scheduled-dialog').innerText.replace(/\\s+/g,' ').slice(0,260)`) + '"');
  log.push('networks listed: ' + await evaluate(`[...document.querySelectorAll('#scheduled-networks li')].map(li=>li.innerText.replace(/\\s+/g,' ')).join(' | ')`) + ' | selectedManual now: ' + await evaluate(`JSON.stringify(selectedManual())`));
  log.push('reset: copy="' + await evaluate(`document.querySelector('#post-copy').value`) + '" media=' + await evaluate(`uploadedMedia.length`) + ' tags="' + await evaluate(`postOptions.tags`) + '" campaign="' + await evaluate(`postOptions.campaign`) + '"');
  const d = JSON.parse(await evaluate(`JSON.stringify(document.querySelector('#scheduled-dialog').getBoundingClientRect())`));
  const shotD = await send('Page.captureScreenshot', { format: 'png', clip: { x: d.x, y: d.y + (await evaluate('scrollY')), width: d.width, height: d.height, scale: 1 } });
  fs.writeFileSync(out + 'scheduled.png', Buffer.from(shotD.result.data, 'base64'));
  await evaluate(`callSocialApi=async()=>{throw new Error('offline in this test')}`);
  await evaluate(`document.querySelector('#scheduled-calendar').click()`); await wait(600);
  log.push('calendar: page=' + await evaluate(`document.querySelector('.page.active').id`) + ' cursor=' + await evaluate(`localIsoDate(calCursor)`) + ' dialog closed=' + await evaluate(`!document.querySelector('#scheduled-dialog').open`));
};
