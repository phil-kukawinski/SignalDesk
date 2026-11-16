// @mentions in the caption: typing @ suggests accounts this client used before, looks up what's typed,
// and inserts the pick. A wrong result is logged with console.error, which fails the run.
import fs from 'node:fs';
const out = process.env.SHOTS || new URL('.', import.meta.url).pathname;
export default async ({ send, evaluate, wait, log, sampleData }) => {
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(3500);
  await sampleData();
  await evaluate(`document.querySelector('#auth-dialog')?.open&&document.querySelector('#auth-dialog').close()`);
  await evaluate(`localStorage.setItem('signaldesk-theme',${JSON.stringify(process.env.THEME || 'light')});applyTheme();document.querySelector('[data-view="composer"]').click()`); await wait(800);
  await evaluate(`(()=>{
    const client=selectedClient('#client-select');
    serverPosts.push({id:'m1',clientId:client.id,title:'Thanks',status:'published',text:'Big thanks to @revererum and @kitco.supply!',media:[],platformContent:{},options:{instagramOptions:{collaborators:['bostonmakers']}},jobs:[]});
    serverPosts.push({id:'m2',clientId:'someone-else',title:'Other',status:'published',text:'Hi @otherclientonly',media:[],platformContent:{},options:{},jobs:[]});
    window.__lookups=[];
    cloudFeaturesAvailable=()=>true;
    callSocialApi=async(body)=>{if(body.action!=='ig-lookup')throw new Error('offline in this test');window.__lookups.push(body.username);return body.username==='revererum'?{status:'found',username:'revererum',name:'Revere Rum Co.',picture:'',followers:12400}:{status:'unverified'};};
    peopleLookups.clear();
  })()`);
  const typeAt = async (text) => { await evaluate(`(()=>{const f=document.querySelector('#post-copy');f.focus();f.value=${JSON.stringify(text)};f.setSelectionRange(f.value.length,f.value.length);f.dispatchEvent(new Event('input',{bubbles:true}));})()`); await wait(600); };
  const menuText = () => evaluate(`(()=>{const m=document.querySelector('#mention-menu');return m&&!m.hidden?m.innerText.replace(/\\s+/g,' '):'(closed)'})()`);
  const check = async (ok, message) => { if (!ok) await evaluate(`console.error(${JSON.stringify('mentions: ' + message)})`); };

  await typeAt('Shout out to @');
  const all = await menuText(); log.push('after @: ' + all.slice(0, 220));
  await check(/@bostonmakers/.test(all) && /@revererum/.test(all) && /@kitco\.supply/.test(all), 'suggests collaborators and handles from earlier captions: ' + all);
  await check(!/otherclientonly/.test(all), 'only this client’s handles: ' + all);

  await typeAt('Shout out to @rev');
  const narrowed = await menuText(); log.push('after @rev: ' + narrowed.slice(0, 220));
  await check(/@revererum/.test(narrowed) && !/@bostonmakers/.test(narrowed) && /Revere Rum Co\./.test(narrowed), 'narrows and shows who it is: ' + narrowed);
  const r = JSON.parse(await evaluate(`JSON.stringify(document.querySelector('#post-copy').getBoundingClientRect())`));
  const { result } = await send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, r.x - 10), y: Math.max(0, r.y - 10), width: Math.min(r.width + 20, 700), height: r.height + 330, scale: 1 } });
  fs.writeFileSync(out + 'mentions.png', Buffer.from(result.data, 'base64'));
  await evaluate(`document.querySelector('#post-copy').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`); await wait(300);
  const picked = await evaluate(`document.querySelector('#post-copy').value`);
  log.push('after Enter: "' + picked + '" menu ' + await menuText());
  await check(picked === 'Shout out to @revererum ', 'Enter inserts the handle and a space: ' + picked);
  await check((await menuText()) === '(closed)', 'the menu closes after picking');

  // A new name is offered as typed and looked up; arrows and Escape work; mid-text picks keep the rest.
  await typeAt('Hi @newbrand');
  const typed = await menuText(); log.push('typed new: ' + typed.slice(0, 160));
  await check(/@newbrand/.test(typed) && /personal accounts can’t be looked up/.test(typed), 'a new name is offered and checked: ' + typed);
  await check((await evaluate(`window.__lookups.includes('newbrand')`)) === true, 'the typed name is looked up');
  await evaluate(`document.querySelector('#post-copy').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`); await wait(200);
  await check((await menuText()) === '(closed)', 'Escape closes the menu');
  await evaluate(`(()=>{const f=document.querySelector('#post-copy');f.focus();f.value='Thanks @bo for coming';f.setSelectionRange(10,10);f.dispatchEvent(new Event('input',{bubbles:true}));})()`); await wait(400);
  await evaluate(`document.querySelector('#mention-menu .people-option').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}))`); await wait(300);
  const middle = await evaluate(`document.querySelector('#post-copy').value`);
  log.push('mid-text pick: "' + middle + '"');
  await check(middle === 'Thanks @bostonmakers for coming', 'a click inserts mid-sentence without a double space: ' + middle);
  // Emails and plain text don't open it.
  await typeAt('Write to hello@pkworks');
  await check((await menuText()) === '(closed)', 'an email address doesn’t open the menu');
};
