// Import CSV: the file buttons (labels) line up with the other buttons, text centered.
export default async ({ send, evaluate, wait, log, sampleData }) => {
  const fail = (message) => log.push('[exception] ' + message);
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(3000);
  await sampleData();
  await evaluate(`document.querySelector('#auth-dialog')?.open&&document.querySelector('#auth-dialog').close();showView('composer');document.querySelector('#csv-open').click();const d=document.querySelector('#csv-dialog');if(!d.open)d.showModal();`); await wait(400);
  const boxes = JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('#csv-dialog .auth-actions .file-button')].map(el=>{const b=el.getBoundingClientRect(),r=document.createRange();r.selectNodeContents(el.firstChild);const t=r.getBoundingClientRect();return{h:Math.round(b.height),top:Math.round(t.top-b.top),bottom:Math.round(b.bottom-t.bottom),left:Math.round(t.left-b.left),right:Math.round(b.right-t.right)};}))`));
  log.push('file buttons: ' + JSON.stringify(boxes));
  if (boxes.length !== 2 || boxes.some(b => Math.abs(b.top - b.bottom) > 2 || Math.abs(b.left - b.right) > 2 || b.h > 48)) fail('file button text should be centered in a normal-height button: ' + JSON.stringify(boxes));
  // With a table of rows, the status repeats under the buttons.
  const bottom = JSON.parse(await evaluate(`(async()=>{const day=localIsoDate(addDays(new Date(),2));csvLayout=Object.fromEntries(CSV_COLUMNS.map((c,i)=>[c,i]));csvRows=Array.from({length:8},(_,i)=>[day,'9:30',clients[0].name,'Facebook','Post '+i,'','','']).map(validateCsvRow);renderCsvPreview();document.querySelector('#csv-message').textContent='Uploading media 2 of 8…';await new Promise(r=>setTimeout(r,50));const b=document.querySelector('#csv-message-bottom'),actions=document.querySelector('#csv-schedule').getBoundingClientRect();return JSON.stringify({hidden:b.hidden,text:b.textContent,below:b.getBoundingClientRect().top>=actions.bottom});})()`));
  log.push('bottom status: ' + JSON.stringify(bottom));
  if (bottom.hidden || bottom.text !== 'Uploading media 2 of 8…' || !bottom.below) fail('the status should show under the buttons too: ' + JSON.stringify(bottom));
  await evaluate(`document.querySelector('#csv-message-bottom').scrollIntoView({block:'end'})`); await wait(100);
  if (process.env.SHOTS) { const shot = await send('Page.captureScreenshot'); (await import('node:fs')).writeFileSync(process.env.SHOTS + 'csv-buttons.png', Buffer.from((shot.result || shot).data, 'base64')); }
};
