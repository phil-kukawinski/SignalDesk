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
  await check(/goes out today|go out today|Nothing today|Nothing scheduled this week/.test(await evaluate(`document.querySelector('#view-overview .subheading').textContent`)), 'the home screen shows it under the greeting');

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
  // Suggest all: fills only the empty image descriptions, keeps one already written, and carries on past a failure.
  await evaluate(`showView('composer')`); await wait(500);
  await evaluate(`(()=>{scheduleDraftSave=()=>{};saveWorkspaceState=async()=>{};window.__altCalls=[];const real=callSocialApi;callSocialApi=async body=>{if(body.action==='alt-text'){__altCalls.push(body.url);await new Promise(r=>setTimeout(r,30));if(body.url.endsWith('c.jpg'))throw new Error('That image couldn’t be read.');return{altText:'Described '+body.url.slice(-5)};}return real(body);};uploadedMedia=[{url:'https://x.example/a.jpg',type:'image/jpeg'},{url:'https://x.example/b.jpg',type:'image/jpeg',alt:'Mine'},{url:'https://x.example/c.jpg',type:'image/jpeg'},{url:'https://x.example/v.mp4',type:'video/mp4'}];renderAltEditor();})()`); await wait(200);
  const label = await evaluate(`document.querySelector('[data-suggest-all-alt]')?.textContent||''`);
  await check(/Suggest the other 2/.test(label), 'the button counts the images still to describe: ' + label);
  await evaluate(`document.querySelector('[data-suggest-all-alt]').click()`); await wait(600);
  const alts = await evaluate(`JSON.stringify({alts:uploadedMedia.map(m=>m.alt||''),calls:__altCalls.sort(),button:Boolean(document.querySelector('[data-suggest-all-alt]'))})`);
  await check(alts === JSON.stringify({ alts: ['Described a.jpg', 'Mine', '', ''], calls: ['https://x.example/a.jpg', 'https://x.example/c.jpg'], button: false }), 'only empty images are described, a failure leaves its box empty: ' + alts);
  // Story series: three files on Stories become three Stories a minute apart; Facebook gets one post with all three.
  const series = JSON.parse(await evaluate(`(async()=>{window.__pub=[];confirmAction=async()=>true;retireScheduledDraft=async()=>null;showScheduledConfirmation=()=>{};resetComposer=()=>{};loadServerPosts=async()=>{};loadOverview=()=>{};updateQueueButton=()=>{};
    const real=callSocialApi;callSocialApi=async body=>{if(body.action==='publish'){__pub.push({p:body.platforms,m:body.mediaUrls,at:body.scheduleDate});return{post:{id:'x'+__pub.length}};}return real(body);};
    uploadedMedia=[1,2,3].map(n=>({url:'https://x.example/'+n+'.jpg',type:'image/jpeg'}));platformOverrides={};
    const start=new Date(Date.now()+86400000);start.setSeconds(0,0);
    const handled=await maybeStorySeries({client:{id:'c',name:'C'},text:'Hi',platforms:['facebook','instagram_story','facebook_story'],manual:[],platformContent:{},options:{},scheduleDate:start.toISOString(),queue:false,now:false,requiresApproval:false});
    const single=await maybeStorySeries({client:{id:'c',name:'C'},text:'Hi',platforms:['facebook'],manual:[],platformContent:{},options:{},scheduleDate:start.toISOString(),queue:false,now:false,requiresApproval:false});
    return JSON.stringify({handled,single,pub:__pub.map(item=>({p:item.p.join('+'),m:item.m.map(u=>u.slice(-5)).join(','),gap:Math.round((Date.parse(item.at)-start.getTime())/60000)}))});})()`));
  await check(series.handled === true && series.single === false && JSON.stringify(series.pub) === JSON.stringify([{ p: 'facebook', m: '1.jpg,2.jpg,3.jpg', gap: 0 }, { p: 'instagram_story+facebook_story', m: '1.jpg', gap: 0 }, { p: 'instagram_story+facebook_story', m: '2.jpg', gap: 1 }, { p: 'instagram_story+facebook_story', m: '3.jpg', gap: 2 }]), 'a Story series: ' + JSON.stringify(series));
  // Colors: each of the first seven clients gets its own, and none is Autopilot's gray or a status color.
  const styles = await evaluate(`JSON.stringify(Array.from({length:7},(_,i)=>clientStyle({id:'k'+i}).cls))`);
  const unique = await evaluate(`(()=>{const saved=[...clients];clients.splice(0,clients.length,...Array.from({length:7},(_,i)=>({id:'k'+i,name:'K'+i})));const list=clients.map(c=>clientStyle(c).cls);clients.splice(0,clients.length,...saved);return new Set(list).size;})()`);
  await check(unique === 7, 'seven clients, seven colors: ' + styles);
};
function trendModeIs(want, got) { return want === got; }
