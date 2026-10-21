import fs from 'node:fs';
const out = process.env.SHOTS || new URL('.', import.meta.url).pathname;
export default async ({ send, evaluate, wait, log }) => {
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(3500);
  await evaluate(`document.querySelector('#auth-dialog')?.open&&document.querySelector('#auth-dialog').close()`);
  await evaluate(`localStorage.setItem('signaldesk-theme','dark');applyTheme();document.querySelector('[data-view="composer"]').click()`); await wait(800);
  // A big tall graphic, like an uploaded PNG logo.
  await evaluate(`(()=>{const c=document.createElement('canvas');c.width=1600;c.height=2400;const g=c.getContext('2d');g.fillStyle='#5b8db8';g.beginPath();g.arc(800,1200,600,0,7);g.fill();g.fillStyle='#1a1f3a';g.beginPath();g.arc(800,1200,250,0,7);g.fill();const src=c.toDataURL('image/png');uploadedMedia=[{path:'',url:'https://x.supabase.co/storage/v1/object/public/social-media/u/logo.png',name:'logo.png',type:'image/png'}];sharedMediaPreview={kind:'image',src,name:'logo.png'};selectedPlatforms=()=>['facebook','instagram'];updatePreview();})()`);
  await wait(800);
  const shot = async (name) => {
    const rect = await evaluate(`JSON.stringify(document.querySelector('.preview-panel').getBoundingClientRect())`);
    const r = JSON.parse(rect);
    await evaluate(`document.querySelector('.preview-panel').scrollIntoView()`); await wait(300);
    const r2 = JSON.parse(await evaluate(`JSON.stringify(document.querySelector('.preview-panel').getBoundingClientRect())`));
    const { result } = await send('Page.captureScreenshot', { format: 'png', clip: { x: r2.x, y: r2.y, width: r2.width, height: Math.min(r2.height, 1050), scale: 1 } });
    fs.writeFileSync(out + name, Buffer.from(result.data, 'base64'));
    log.push(`${name}: panel ${Math.round(r.width)}x${Math.round(r.height)} | media box ${await evaluate(`(()=>{const m=document.querySelector('#preview-media').getBoundingClientRect(),c=document.querySelector('.social-preview').getBoundingClientRect(),a=document.querySelector('.preview-actions').getBoundingClientRect();return Math.round(m.height)+'px tall, inside card: '+(m.bottom<=a.top+1)})()`)} | note: ${await evaluate(`document.querySelector('#preview-note').hidden?'(none)':document.querySelector('#preview-note').textContent.slice(0,90)`)}`);
  };
  await shot('preview_all.png');
  await evaluate(`selectVariant('instagram')`); await wait(600);
  await shot('preview_ig.png');
};
