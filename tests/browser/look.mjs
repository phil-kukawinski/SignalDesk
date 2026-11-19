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

  // Who did what: names from the posts list, "you" for yourself, and the approver when it's someone else.
  const people = JSON.parse(await evaluate(`(()=>{activeUser={id:'me'};Object.assign(teamNames,{sam:'Sam',lee:'Lee'});return JSON.stringify([postPeopleText({createdBy:'sam',status:'scheduled'}),postPeopleText({createdBy:'sam',approvedBy:'lee',status:'scheduled'}),postPeopleText({createdBy:'me',status:'pending_approval'}),postPeopleText({createdBy:'sam',approvedBy:'sam',status:'published'}),postPeopleText({source:'autopilot',approvedBy:'me'}),postPeopleText({createdBy:'gone',status:'scheduled'})]);})()`));
  await check(JSON.stringify(people) === JSON.stringify(['Scheduled by Sam', 'Scheduled by Sam · approved by Lee', 'Submitted by you', 'Scheduled by Sam', 'Autopilot · approved by you', 'Scheduled by a teammate']), 'who scheduled and approved: ' + JSON.stringify(people));

  // The channel boxes: All networks starts unchecked; checking one shows just that network; clearing it goes back.
  await evaluate(`showView('overview')`); await wait(600);
  const boxes = await evaluate(`[...document.querySelectorAll('#view-overview [data-rank-network]')].map(b=>b.dataset.rankNetwork+':'+b.checked).join(',')`);
  await check(/instagram:false/.test(boxes) && !/true/.test(boxes) && trendModeIs('all', await evaluate(`trendMode()`)), 'All networks starts with every box unchecked: ' + boxes);
  await evaluate(`(()=>{const b=document.querySelector('#view-overview [data-rank-network="instagram"]');b.checked=true;b.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(200);
  const one = await evaluate(`trendMode()+'|'+[...document.querySelectorAll('#view-overview [data-rank-network]')].filter(b=>b.checked).map(b=>b.dataset.rankNetwork).join(',')+'|'+document.querySelector('#view-overview [data-trend-mode="networks"]').getAttribute('aria-checked')`);
  await check(one === 'networks|instagram|true', 'checking Instagram switches to By network with only Instagram: ' + one);
  await evaluate(`(()=>{const b=document.querySelector('#view-overview [data-rank-network="instagram"]');b.checked=false;b.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(200);
  await check(await evaluate(`trendMode()`) === 'all', 'clearing the last box goes back to All networks');
  // Import: file names with spaces stay whole; | separates files; links separated by spaces still split.
  const lists = await evaluate(`JSON.stringify([csvMediaList('Fall Kit 1.png|Fall Kit 2.png'),csvMediaList(' 1.png | 2.mp4 '),csvMediaList('https://a.example/1.jpg https://a.example/2.jpg'),csvMediaList('My photo.png'),csvMediaList('')])`);
  await check(lists === JSON.stringify([['Fall Kit 1.png', 'Fall Kit 2.png'], ['1.png', '2.mp4'], ['https://a.example/1.jpg', 'https://a.example/2.jpg'], ['My photo.png'], []]), 'media_url lists: ' + lists);
};
function trendModeIs(want, got) { return want === got; }
