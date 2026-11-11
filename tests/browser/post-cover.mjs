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
    callSocialApi=async(body)=>{__calls.push(body);if(body.action==='set-cover'){const p=serverPosts.find(x=>x.id===body.postId);if(body.url)p.options={...p.options,cover:{url:body.url}};else delete p.options.cover;return{cover:body.url?{url:body.url}:null};}if(body.action==='posts')return{posts:serverPosts,now:new Date().toISOString()};if(body.action==='autopilot')return{feeds:[],items:[]};return{};};
    loadServerPosts=async()=>{refreshPostDialog();};loadPostNotes=()=>{};loadPostHistory=()=>{};
    uploadToStorage=async(file,kind)=>{__uploads.push(file.name+':'+kind);return{url:'https://cdn.test/new-cover.jpg'};};
    uploadCoverImage=save=>save(new Blob(['x'],{type:'image/jpeg'}));
  })()`);
  const panel = (id) => evaluate(`openPostDialog('${id}')`).then(() => wait(200)).then(() => json(`{cover:Boolean(document.querySelector('#post-dialog .post-cover')),button:document.querySelector('[data-post-cover]')?.textContent||'',remove:Boolean(document.querySelector('[data-post-cover-remove]')),state:document.querySelector('#post-dialog .post-cover small')?.textContent||'',img:document.querySelector('#post-dialog .post-cover img')?.getAttribute('src')||''}`));
  const before = await panel('v1');
  log.push('video: ' + JSON.stringify(before));
  if (!before.cover || before.button !== 'Choose cover photo' || before.remove || !/First frame/.test(before.state)) fail('a scheduled video post should offer Choose cover photo: ' + JSON.stringify(before));
  await evaluate(`document.querySelector('[data-post-cover]').click()`); await wait(300);
  const after = await json(`{calls:__calls.filter(c=>c.action==='set-cover'),uploads:__uploads,img:document.querySelector('#post-dialog .post-cover img')?.getAttribute('src')||'',remove:Boolean(document.querySelector('[data-post-cover-remove]'))}`);
  log.push('chosen: ' + JSON.stringify(after));
  if (after.calls.length !== 1 || after.calls[0].postId !== 'v1' || after.calls[0].url !== 'https://cdn.test/new-cover.jpg' || after.uploads.join() !== 'cover.jpg:cover' || after.img !== 'https://cdn.test/new-cover.jpg' || !after.remove) fail('choosing a cover photo should upload it and save it on the post: ' + JSON.stringify(after));
  if (process.env.SHOTS) { const shot = await send('Page.captureScreenshot'); (await import('node:fs')).writeFileSync(process.env.SHOTS + 'post-cover.png', Buffer.from((shot.result || shot).data, 'base64')); }
  await evaluate(`document.querySelector('[data-post-cover-remove]').click()`); await wait(300);
  const removed = await json(`{last:__calls.filter(c=>c.action==='set-cover').pop(),img:Boolean(document.querySelector('#post-dialog .post-cover img'))}`);
  if (removed.last?.url !== null || removed.img) fail('Remove should clear the cover: ' + JSON.stringify(removed));
  const image = await panel('i1');
  if (image.cover) fail('an image post should not show a video cover');
  const published = await panel('v2');
  log.push('published: ' + JSON.stringify(published));
  if (!published.cover || published.button || published.img !== 'https://cdn.test/old.jpg') fail('a published video should show its cover without changing it: ' + JSON.stringify(published));
};
