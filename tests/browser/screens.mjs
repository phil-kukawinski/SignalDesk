// Screenshots of every page for visual review: SHOTS=/dir WIDTH=1440 THEME=light node cdp.mjs screens.mjs
import fs from 'node:fs';
const out = process.env.SHOTS || new URL('.', import.meta.url).pathname;
const width = Number(process.env.WIDTH || 1440);
const VIEWS = (process.env.VIEWS || 'overview,calendar,composer,library,inbox,analytics,clients,social-accounts,approvals,settings').split(',');
export default async ({ send, evaluate, wait, log }) => {
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 700 });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(3500);
  await evaluate(`document.querySelector('#auth-dialog')?.open&&document.querySelector('#auth-dialog').close()`);
  await evaluate(`localStorage.setItem('signaldesk-theme',${JSON.stringify(process.env.THEME || 'light')});applyTheme()`);
  for (const view of VIEWS) {
    await evaluate(`document.querySelector('[data-view="${view}"]')?.click()`); await wait(900);
    await evaluate(`window.scrollTo(0,0)`); await wait(200);
    const height = Math.min(await evaluate(`document.documentElement.scrollHeight`), 6000);
    const overflow = await evaluate(`document.documentElement.scrollWidth > innerWidth + 1 ? document.documentElement.scrollWidth : 0`);
    const { result } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: width > 1000 ? 0.6 : 1 } });
    fs.writeFileSync(`${out}${view}-${width}.png`, Buffer.from(result.data, 'base64'));
    log.push(`${view}: ${height}px tall${overflow ? `, OVERFLOWS sideways to ${overflow}px` : ''}`);
  }
};
