// The livelier look: the line under the greeting says what today holds, posts show their picture on the
// calendar and home list (never a video file, and a broken picture falls back to the text), client cards
// carry the client's color, and empty states have their drawing.
import fs from 'node:fs';
const stub = fs.readFileSync(new URL('../fixtures/workspace-stub.js', import.meta.url), 'utf8');
export default async ({ send, evaluate, wait, sampleData }) => {
  const check = async (ok, message) => { if (!ok) await evaluate(`console.error(${JSON.stringify('look: ' + message)})`); };
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(2500);
  await sampleData(); await evaluate(stub); await evaluate(`scheduleWorkspaceSave=()=>{};currentRole='admin';`); await wait(1200);

  const pulse = JSON.parse(await evaluate(`JSON.stringify([homePulseText({today:1,week:3,pending:2,change:22.7}),homePulseText({today:0,week:3,pending:0,change:0.4}),homePulseText({today:0,week:0,pending:0,change:null}),homePulseText({today:3,week:5,pending:0,change:-12})])`));
  await check(pulse[0] === '1 post goes out today · 2 waiting for approval · Engagement up 22.7% over the last 30 days', 'today, approvals, and engagement: ' + pulse[0]);
  await check(pulse[1] === 'Nothing today, 3 posts this week', 'a quiet day with posts later in the week (tiny changes left out): ' + pulse[1]);
  await check(pulse[2] === 'Nothing scheduled this week yet' && pulse[3] === '3 posts go out today · Engagement down 12% over the last 30 days', 'an empty week, and a drop: ' + JSON.stringify(pulse));
  await check(/goes out today/.test(await evaluate(`document.querySelector('#view-overview .subheading').textContent`)), 'the home screen shows it under the greeting');

  const thumbs = JSON.parse(await evaluate(`JSON.stringify([postThumbUrl({media:['https://x.example/a.jpg']}),postThumbUrl({media:['https://x.example/v.mp4']}),postThumbUrl({media:['https://x.example/v.mp4'],options:{cover:{url:'https://x.example/c.jpg'}}}),postThumbUrl({media:[{url:'https://x.example/o.png'}]}),postThumbUrl({media:['javascript:alert(1)']})])`));
  await check(JSON.stringify(thumbs) === JSON.stringify(['https://x.example/a.jpg', '', 'https://x.example/c.jpg', 'https://x.example/o.png', '']), 'post pictures: images and covers, never videos or other links: ' + JSON.stringify(thumbs));
  await check(await evaluate(`document.querySelectorAll('#upcoming-list .client-avatar.has-thumb img').length>0`), 'the home list shows post pictures');

  await evaluate(`showView('calendar')`); await wait(800);
  await check(await evaluate(`document.querySelectorAll('.timeline-event.has-thumb .ev-thumb').length>0`), 'the calendar shows post pictures');
  await evaluate(`(()=>{const img=document.querySelector('.timeline-event.has-thumb .ev-thumb');img.dispatchEvent(new Event('error'));window.__brokenGone=!img.isConnected&&!document.querySelector('.timeline-event.has-thumb .ev-thumb[src="'+img.getAttribute('src')+'"]')?.isSameNode(img);})()`);
  await check(await evaluate(`window.__brokenGone`), 'a picture that won’t load is removed');

  await evaluate(`showView('clients')`); await wait(600);
  const band = await evaluate(`document.querySelector('.client-card').style.getPropertyValue('--client-color')`);
  await check(/^#[0-9a-f]{6}$/i.test(band), 'client cards carry the client color: ' + band);
  await check(await evaluate(`emptyStateHtml({title:'x'}).includes('empty-art')`), 'empty states have their drawing');
};
