// Photos and videos on posts waiting for approval: thumbnails in Approvals and the post window, and a full-size viewer.
import fs from 'node:fs';
const out = process.env.SHOTS || '';
export default async ({ send, evaluate, wait, log, sampleData }) => {
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*', '*media.test*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(3000);
  await sampleData();
  await evaluate(`document.querySelector('#auth-dialog')?.open&&document.querySelector('#auth-dialog').close()`);
  await evaluate(`(()=>{const at=days=>{const d=new Date();d.setDate(d.getDate()+days);d.setHours(10,0,0,0);return d.toISOString();};
    const media=['https://media.test/a.jpg','https://media.test/clip.mp4','https://media.test/b.png'];
    cloudFeaturesAvailable=()=>true;activeUser={id:'u',email:'owner@pkworks.co'};activeWorkspace={id:'w',name:'PK Works'};currentRole='admin';
    serverPosts=[{id:'p1',clientId:'pk-works',title:'Fall launch',text:'Fall launch',status:'pending_approval',scheduledFor:at(2),createdBy:'u',media,mediaAlt:{},platformContent:{},options:{},jobs:[{id:'j1',platform:'instagram',provider:'direct',status:'held',runAt:at(2)}]}];
    callSocialApi=async()=>{throw new Error('offline in this test');};
    showView('approvals');renderApprovals();})()`); await wait(500);
  const row = JSON.parse(await evaluate(`JSON.stringify({thumbs:document.querySelectorAll('#approval-table .media-thumb').length,videos:document.querySelectorAll('#approval-table .media-thumb video').length,title:document.querySelector('#approval-table .approval-table-row b').textContent})`));
  log.push('approvals row: ' + JSON.stringify(row));
  if (row.thumbs !== 3 || row.videos !== 1 || row.title !== 'Fall launch') log.push('[exception] the approvals row should show all three thumbnails, one of them a video');

  // Clicking the video thumbnail opens the viewer on the video, not the post window.
  await evaluate(`document.querySelectorAll('#approval-table .media-thumb')[1].click()`); await wait(300);
  const viewer = () => evaluate(`JSON.stringify({open:!!document.querySelector('.media-viewer')?.open,video:!!document.querySelector('.media-viewer-stage video[controls]'),img:document.querySelector('.media-viewer-stage img')?.getAttribute('src')||'',count:document.querySelector('.media-viewer-count')?.textContent,post:document.querySelector('#post-dialog').open})`).then(JSON.parse);
  let v = await viewer(); log.push('viewer on video: ' + JSON.stringify(v));
  if (!v.open || !v.video || v.count !== '2 of 3' || v.post) log.push('[exception] the video should open in the viewer with playback controls');
  if (out) { const { result } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1400, height: 1000, scale: 0.6 } }); fs.writeFileSync(out + 'media_viewer.png', Buffer.from(result.data, 'base64')); }
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 }); await wait(150);
  v = await viewer(); log.push('next: ' + v.img + ' ' + v.count);
  if (!v.img.endsWith('b.png')) log.push('[exception] the right arrow should move to the next item');
  await evaluate(`document.querySelector('.media-viewer-close').click()`); await wait(200);
  v = await viewer();
  if (v.open || v.video) log.push('[exception] closing the viewer should stop the video');

  // The post window ("Review") shows the same thumbnails.
  await evaluate(`document.querySelector('#approval-table [data-review="0"]').click()`); await wait(400);
  const dialogThumbs = await evaluate(`document.querySelectorAll('#post-dialog .media-thumb').length`);
  log.push('post window thumbnails: ' + dialogThumbs);
  if (dialogThumbs !== 3) log.push('[exception] the post window should show the post’s photos and video');
  await evaluate(`document.querySelectorAll('#post-dialog .media-thumb')[0].click()`); await wait(300);
  v = await viewer();
  if (!v.open || !v.img.endsWith('a.jpg')) log.push('[exception] a photo in the post window should open full size');
  await evaluate(`document.querySelector('.media-viewer')?.close();document.querySelector('#post-dialog').close()`);
};
