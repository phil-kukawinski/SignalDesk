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
    uploadedMedia=[{path:'u/v.mp4',url:'https://media.test/v.mp4',name:'launch.mp4',type:'video/mp4'}];sharedMediaPreview={kind:'video',src:window.__video,name:'launch.mp4'};
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

  // Pinterest can post the cover as a still image instead of the video.
  if (await evaluate(`document.querySelector('#pin-cover-row').hidden`)) log.push('[exception] the cover-as-image option should show when a video is attached');
  await evaluate(`(()=>{const box=document.querySelector('#pin-cover-image');box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}));selectVariant('pinterest');})()`); await wait(400);
  const still = JSON.parse(await evaluate(`JSON.stringify({option:buildPostOptionsPayload(['pinterest']).pinterest,img:document.querySelector('.pv-pin #preview-media img')?.getAttribute('src'),hint:document.querySelector('#pin-media-hint').textContent,summary:document.querySelector('#pinterest-summary').textContent})`));
  log.push('pin still: ' + JSON.stringify(still));
  if (!still.option?.coverAsImage || !/cover-\d+\.jpg/.test(still.img || '') || !/still image/.test(still.hint) || !/Cover as image/.test(still.summary)) log.push('[exception] Pinterest should use the cover as an image Pin');
  await evaluate(`selectVariant('all')`); await wait(200);

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
  // Each network's file and shape rules, using known sizes rather than real uploads.
  const fileRules = JSON.parse(await evaluate(`(async()=>{
    const video=(name,width,height,duration)=>{const url='https://x.test/'+name;mediaInfo.set(url,{width,height,duration});return{url,name,type:'video/mp4'};};
    const photo=(name,width,height,size,type='image/jpeg')=>{const url='https://x.test/'+name;mediaInfo.set(url,{width,height});return{url,name,type,size};};
    const check=(platform,media)=>{platformOverrides[platform]={media,preview:null};const found=mediaRuleIssues(platform).map(item=>item.level+': '+item.message);delete platformOverrides[platform];return found.join(' | ');};
    const wide=video('wide.mp4',1920,1080,30),tall=video('tall.mp4',1080,1920,30),webm=video('clip.webm',1080,1920,30),mov=video('clip.mov',1080,1920,30);
    const canvas=document.createElement('canvas');canvas.width=8;canvas.height=6;canvas.getContext('2d').fillRect(0,0,8,6);const webp=await new Promise(done=>canvas.toBlob(done,'image/webp'));
    const converted=await postReadyImage(new File([webp],'photo.webp',{type:'image/webp'})),broken=await postReadyImage(new File(['not an image'],'photo.heic',{type:'image/heic'})),png=new File(['x'],'p.png',{type:'image/png'});
    return JSON.stringify({reelWide:check('instagram',[wide]),reelTall:check('instagram',[tall]),storyWide:check('instagram_story',[wide]),storyShort:check('instagram_story',[video('short.mp4',1080,1920,2)]),igWebm:check('instagram',[webm]),liMov:check('linkedin',[mov]),liLong:check('linkedin',[video('long.mp4',1920,1080,1200)]),liTooLong:check('linkedin',[video('huge.mp4',1920,1080,2000)]),pinWide:check('pinterest',[wide]),fbWide:check('facebook',[wide]),xBig:check('twitter',[photo('big.jpg',1000,1000,6*1048576)]),xSmall:check('twitter',[photo('ok.jpg',1000,1000,4*1048576)]),fbBig:check('facebook',[photo('fb.jpg',1000,1000,11*1048576)]),igGif:check('instagram',[photo('a.gif',1000,1000,1000,'image/gif')]),igTiny:check('instagram',[photo('tiny.jpg',200,200,1000)]),igMixed:check('instagram',[photo('m1.jpg',1000,1000,1000),photo('m2.jpg',1000,1250,1000)]),igSame:check('instagram',[photo('s1.jpg',1000,1000,1000),photo('s2.jpg',1000,1000,1000)]),converted:[converted?.type,converted?.name],broken:broken===null,pngKept:(await postReadyImage(png))===png});
  })()`));
  log.push('format rules: ' + JSON.stringify(fileRules));
  if (!/isn’t 9:16/.test(fileRules.reelWide) || /9:16/.test(fileRules.reelTall) || !/isn’t 9:16/.test(fileRules.storyWide)) fail('Reels and Stories should flag videos that are not 9:16');
  if (!/3 to 60 seconds/.test(fileRules.storyShort) || !/^error: This is a WEBM/.test(fileRules.igWebm) || !/^warn: This is a MOV/.test(fileRules.liMov)) fail('Story length and video file types should be checked');
  if (fileRules.liLong !== '' || !/3 seconds to 30 minutes/.test(fileRules.liTooLong) || !/wider than it is tall/.test(fileRules.pinWide) || fileRules.fbWide !== '') fail('LinkedIn takes up to 30 minutes, wide Pins warn, and wide Facebook videos are fine');
  if (!/^error: A photo is over 5 MB/.test(fileRules.xBig) || fileRules.xSmall !== '' || !/over 10 MB/.test(fileRules.fbBig)) fail('Photos over a network\'s limit should block that network');
  if (!/still image/.test(fileRules.igGif) || !/under 320/.test(fileRules.igTiny) || !/different shapes/.test(fileRules.igMixed) || /different shapes/.test(fileRules.igSame)) fail('Instagram GIFs, tiny photos, and mixed carousels should warn');
  if (fileRules.converted[0] !== 'image/jpeg' || fileRules.converted[1] !== 'photo.jpg' || !fileRules.broken || !fileRules.pngKept) fail('Photos most networks refuse should become JPEGs, and unreadable ones should stop');
  const unsplash = await evaluate(`unsplashCropUrl('https://images.unsplash.com/photo-1?fm=jpg&q=85&w=2160&fit=max',{width:2160,height:1440},'4:5')`);
  if (!/w=1152&fit=crop&h=1440/.test(unsplash)) fail('Unsplash photos should be cropped through their address: ' + unsplash);
};
