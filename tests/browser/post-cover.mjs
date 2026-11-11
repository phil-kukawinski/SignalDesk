// Calendar post panel: a scheduled video post offers “Choose cover photo”, saves it with set-cover, and can remove it.
export default async ({ send, evaluate, wait, log, sampleData }) => {
  const fail = (message) => log.push('[exception] ' + message);
  const json = async (expression) => JSON.parse(await evaluate(`JSON.stringify(${expression})`));
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(3000);
  await sampleData();
  await evaluate(`document.querySelector('#auth-dialog')?.open&&document.querySelector('#auth-dialog').close();(()=>{
    cloudFeaturesAvailable=()=>true;activeUser={id:'u1',email:'owner@studio.test'};activeWorkspace={id:'w1',name:'Studio'};currentRole='admin';
    const at=days=>new Date(Date.now()+days*86400000).toISOString(),pk=clients[0].id;
    const post=(id,title,media,status='scheduled',options={})=>({id,clientId:pk,title,text:title,status,source:'composer',scheduledFor:at(status==='published'?-1:2),campaign:'',media,platformContent:{},mediaAlt:{},options,jobs:[{id:id+'j',platform:'instagram',provider:'direct',status:status==='published'?'published':'queued'}]});
    serverPosts=[post('v1','Video post',['https://cdn.test/clip.mp4']),post('i1','Image post',['https://cdn.test/a.png']),post('v2','Published video',['https://cdn.test/old.mp4'],'published',{cover:{url:'https://cdn.test/old.jpg'}})];serverPostsLoadedAt=Date.now();
    window.__calls=[];window.__uploads=[];
    callSocialApi=async(body)=>{__calls.push(body);if(body.action==='set-cover'){const p=serverPosts.find(x=>x.id===body.postId);const cover={...(body.url?{url:body.url}:{}),...(Number.isInteger(body.offsetMs)?{offsetMs:body.offsetMs}:{})};if(Object.keys(cover).length)p.options={...p.options,cover};else delete p.options.cover;return{cover};}if(body.action==='posts')return{posts:serverPosts,now:new Date().toISOString()};if(body.action==='autopilot')return{feeds:[],items:[]};return{};};
    loadServerPosts=async()=>{refreshPostDialog();};loadPostNotes=()=>{};loadPostHistory=()=>{};
    uploadToStorage=async(file,kind)=>{__uploads.push(file.name+':'+kind);return{url:'https://cdn.test/new-cover.jpg'};};
    uploadCoverImage=save=>save(new Blob(['x'],{type:'image/jpeg'}));
  })()`);
  const panel = (id) => evaluate(`openPostDialog('${id}')`).then(() => wait(200)).then(() => json(`{cover:Boolean(document.querySelector('#post-dialog .post-cover')),button:document.querySelector('[data-post-cover]')?.textContent||'',frame:Boolean(document.querySelector('[data-post-cover-frame]')),remove:Boolean(document.querySelector('[data-post-cover-remove]')),state:document.querySelector('#post-dialog .post-cover small')?.textContent||'',img:document.querySelector('#post-dialog .post-cover img')?.getAttribute('src')||''}`));
  const before = await panel('v1');
  log.push('video: ' + JSON.stringify(before));
  if (!before.cover || before.button !== 'Choose cover photo' || !before.frame || before.remove || !/First frame/.test(before.state)) fail('a scheduled video post should offer Choose cover photo: ' + JSON.stringify(before));
  await evaluate(`document.querySelector('[data-post-cover]').click()`); await wait(300);
  const after = await json(`{calls:__calls.filter(c=>c.action==='set-cover'),uploads:__uploads,img:document.querySelector('#post-dialog .post-cover img')?.getAttribute('src')||'',remove:Boolean(document.querySelector('[data-post-cover-remove]'))}`);
  log.push('chosen: ' + JSON.stringify(after));
  if (after.calls.length !== 1 || after.calls[0].postId !== 'v1' || after.calls[0].url !== 'https://cdn.test/new-cover.jpg' || after.uploads.join() !== 'cover.jpg:cover' || after.img !== 'https://cdn.test/new-cover.jpg' || !after.remove) fail('choosing a cover photo should upload it and save it on the post: ' + JSON.stringify(after));
  if (process.env.SHOTS) { const shot = await send('Page.captureScreenshot'); (await import('node:fs')).writeFileSync(process.env.SHOTS + 'post-cover.png', Buffer.from((shot.result || shot).data, 'base64')); }
  await evaluate(`document.querySelector('[data-post-cover-remove]').click()`); await wait(300);
  const removed = await json(`{last:__calls.filter(c=>c.action==='set-cover').pop(),img:Boolean(document.querySelector('#post-dialog .post-cover img'))}`);
  if (removed.last?.url !== null || removed.img) fail('Remove should clear the cover: ' + JSON.stringify(removed));
  // Choose a frame: the Studio's frame picker on the post's own video, saved as an image plus its time.
  await evaluate(`void (async()=>{const c=document.createElement('canvas');c.width=320;c.height=568;const g=c.getContext('2d');const rec=new MediaRecorder(c.captureStream(30),{mimeType:'video/webm'});const parts=[];rec.ondataavailable=e=>parts.push(e.data);rec.start();const t0=performance.now();await new Promise(done=>{const draw=()=>{const t=(performance.now()-t0)/1000;g.fillStyle=t<1?'#2f6db3':'#e0a030';g.fillRect(0,0,320,568);if(t<2)requestAnimationFrame(draw);else done();};draw();});rec.stop();await new Promise(r=>rec.onstop=r);const p=serverPosts.find(x=>x.id==='v1');p.media=[URL.createObjectURL(new Blob(parts,{type:'video/webm'}))+'#clip.webm'];delete p.options.cover;window.__videoReady=true;})()`);
  await wait(3200);
  await panel('v1');
  await evaluate(`__uploads.length=0;document.querySelector('[data-post-cover-frame]').click()`); await wait(1200);
  const picker = await json(`{open:document.querySelector('#cover-dialog')?.open||false,ready:!document.querySelector('[data-cover-use]')?.disabled}`);
  if (!picker.open || !picker.ready) fail('Choose a frame should open the frame picker on the post’s video: ' + JSON.stringify(picker));
  await evaluate(`const r=document.querySelector('.cover-range');r.value='1.5';r.dispatchEvent(new Event('input'))`); await wait(800);
  await evaluate(`document.querySelector('[data-cover-use]').click()`); await wait(1200);
  const framed = await json(`{call:__calls.filter(c=>c.action==='set-cover').pop(),uploads:__uploads,open:document.querySelector('#cover-dialog').open,state:document.querySelector('#post-dialog .post-cover small')?.textContent||''}`);
  log.push('frame: ' + JSON.stringify(framed));
  if (framed.open || framed.uploads.join() !== 'cover.jpg:cover' || framed.call?.url !== 'https://cdn.test/new-cover.jpg' || !(framed.call?.offsetMs >= 1300 && framed.call?.offsetMs <= 1700) || !/^Frame at 1\.[3-7] s$/.test(framed.state)) fail('a chosen frame should upload as the cover with its time: ' + JSON.stringify(framed));
  const image = await panel('i1');
  if (image.cover) fail('an image post should not show a video cover');
  const published = await panel('v2');
  log.push('published: ' + JSON.stringify(published));
  if (!published.cover || published.button || published.img !== 'https://cdn.test/old.jpg') fail('a published video should show its cover without changing it: ' + JSON.stringify(published));
};
