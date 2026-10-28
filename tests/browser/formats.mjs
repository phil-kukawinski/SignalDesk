// Video posts: per-network format warnings, the check before scheduling, and choosing a video cover.
import fs from 'node:fs';
const out = process.env.SHOTS || '';
export default async ({ send, evaluate, wait, log, sampleData }) => {
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1300, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(3000);
  await sampleData();
  await evaluate(`document.querySelector('#auth-dialog')?.open&&document.querySelector('#auth-dialog').close();showView('composer')`); await wait(500);
  // A real 2-second video recorded from a canvas, so frames can be read back.
  await evaluate(`void (async()=>{const c=document.createElement('canvas');c.width=320;c.height=568;const g=c.getContext('2d');const rec=new MediaRecorder(c.captureStream(30),{mimeType:'video/webm'});const parts=[];rec.ondataavailable=e=>parts.push(e.data);rec.start();const t0=performance.now();await new Promise(done=>{const draw=()=>{const t=(performance.now()-t0)/1000;g.fillStyle=t<1?'#2f6db3':'#e0a030';g.fillRect(0,0,320,568);g.fillStyle='#fff';g.font='bold 60px sans-serif';g.fillText(t.toFixed(1),90,300);if(t<2)requestAnimationFrame(draw);else done();};draw();});rec.stop();await new Promise(r=>rec.onstop=r);window.__video=URL.createObjectURL(new Blob(parts,{type:'video/webm'}));})()`);
  await wait(3200);
  await evaluate(`(()=>{cloudFeaturesAvailable=()=>true;activeUser={id:'u',email:'owner@pkworks.co'};currentRole='admin';
    document.querySelector('.account-select').innerHTML=['facebook','instagram','pinterest','twitter'].map(p=>'<label><input type="checkbox" value="'+p+'" checked>'+p+'</label>').join('');
    document.querySelector('#post-copy').value='New video is up';
    const d=new Date(Date.now()+86400000);document.querySelector('#schedule-date').value=localIsoDate(d);document.querySelector('#schedule-time').value='10:00';
    uploadedMedia=[{path:'u/v.webm',url:'https://media.test/v.webm',name:'launch.webm',type:'video/webm'}];sharedMediaPreview={kind:'video',src:window.__video,name:'launch.webm'};
    window.__uploads=0;uploadToStorage=async(file,prefix)=>{__uploads++;window.__coverBlob=file;return{path:'u/'+prefix+'.jpg',url:'https://media.test/'+prefix+'-'+__uploads+'.jpg',name:file.name,type:file.type};};
    window.__sent=null;callSocialApi=async(body)=>{if(body.action==='publish'){__sent=body;return{post:{id:'p',scheduledFor:new Date(Date.now()+86400000).toISOString()},requiresApproval:false};}throw new Error('offline in this test');};
    updatePreview();})()`); await wait(800);

  const alert = JSON.parse(await evaluate(`JSON.stringify({shown:!document.querySelector('#format-alert')?.hidden,blocking:document.querySelector('#format-alert')?.classList.contains('blocking'),text:document.querySelector('#format-alert')?.innerText||''})`));
  log.push('format alert: ' + JSON.stringify(alert));
  if (!alert.shown || alert.blocking || !/Video Pins need to be 4 seconds/.test(alert.text) || !/Reels need to be 3 seconds/.test(alert.text) || /Facebook:|X:/.test(alert.text)) log.push('[exception] a 2-second video should only be warned about for Instagram and Pinterest, without blocking anything');
  const picker = JSON.parse(await evaluate(`JSON.stringify({shown:!document.querySelector('#cover-picker')?.hidden,text:document.querySelector('#cover-picker')?.innerText||''})`));
  log.push('cover picker: ' + picker.text.replace(/\s+/g, ' '));
  if (!picker.shown || !/Used by Facebook, Instagram Reels, Pinterest\./.test(picker.text) || !/X chooses its own/.test(picker.text)) log.push('[exception] the cover picker should say which networks use the cover');

  // Choose a frame at about 1.5 s: it's captured, uploaded, and sent with the post.
  await evaluate(`document.querySelector('[data-cover-frame]').click()`); await wait(1200);
  await evaluate(`(()=>{const r=document.querySelector('.cover-range');r.value='1.5';r.dispatchEvent(new Event('input'));})()`); await wait(800);
  if (out) { const { result } = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(out + 'cover_dialog.png', Buffer.from(result.data, 'base64')); }
  await evaluate(`document.querySelector('[data-cover-use]').click()`); await wait(1200);
  const cover = JSON.parse(await evaluate(`JSON.stringify({cover:postOptions.cover,type:window.__coverBlob?.type,size:window.__coverBlob?.size||0,dialog:document.querySelector('#cover-dialog').open,thumb:document.querySelector('#cover-picker img')?.getAttribute('src')||'',preview:!!document.querySelector('#preview-media .preview-video img')})`));
  log.push('cover: ' + JSON.stringify(cover));
  if (!cover.cover?.url || !(cover.cover.offsetMs >= 1300 && cover.cover.offsetMs <= 1700) || cover.type !== 'image/jpeg' || cover.size < 500 || cover.dialog || !cover.thumb || !cover.preview) log.push('[exception] the chosen frame should be saved as a JPEG cover and shown');
  if (out) { await evaluate(`document.querySelector('#cover-picker').scrollIntoView({block:'center'})`); await wait(300); const { result } = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(out + 'cover_picker.png', Buffer.from(result.data, 'base64')); }

  // TikTok gets its own image (TikTok needs video): scheduling asks first, then posts to the others without it.
  await evaluate(`(()=>{document.querySelector('.account-select').insertAdjacentHTML('beforeend','<label><input type="checkbox" value="tiktok" checked>tiktok</label>');platformOverrides.tiktok={media:[{path:'',url:'https://media.test/still.jpg',name:'still.jpg',type:'image/jpeg'}]};updatePreview();})()`); await wait(300);
  await evaluate(`document.querySelector('#schedule-post').click()`); await wait(500);
  const ask = await evaluate(`document.querySelector('#confirm-dialog')?.open?document.querySelector('#confirm-title').textContent:''`);
  log.push('asked: ' + ask);
  if (!/TikTok/.test(ask)) log.push('[exception] scheduling should warn that TikTok can’t take an image');
  await evaluate(`document.querySelector('#confirm-dialog button[value="yes"]').click()`); await wait(800);
  const sent = JSON.parse(await evaluate(`JSON.stringify(__sent&&{platforms:__sent.platforms,cover:__sent.options.cover})`));
  log.push('sent: ' + JSON.stringify(sent));
  if (!sent || sent.platforms.includes('tiktok') || sent.platforms.length !== 4 || !sent.cover?.url || sent.cover.video) log.push('[exception] the post should go to the other four networks with the cover');

  // Other rules: a Story with two items, X with five images.
  await evaluate(`(()=>{document.querySelector('.account-select').innerHTML=['instagram_story','twitter'].map(p=>'<label><input type="checkbox" value="'+p+'" checked>'+p+'</label>').join('');sharedMediaPreview=null;uploadedMedia=[1,2,3,4,5].map(i=>({path:'',url:'https://media.test/'+i+'.jpg',name:i+'.jpg',type:'image/jpeg'}));updatePreview();})()`); await wait(300);
  const rules = await evaluate(`document.querySelector('#format-alert').innerText`);
  log.push('rules: ' + rules.replace(/\s+/g, ' '));
  if (!/Story takes one/.test(rules) || !/X allows up to 4/.test(rules) ) log.push('[exception] Story and X limits should be flagged');
  if (await evaluate(`!document.querySelector('#cover-picker').hidden`)) log.push('[exception] the cover picker should hide without a video');
  await evaluate(`document.querySelector('#confirm-dialog')?.open&&document.querySelector('#confirm-dialog').close()`);
};
