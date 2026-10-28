// Accessibility check with axe-core on every view (light and dark) and the main dialogs.
// Reports serious and critical problems; npm test fails on them.
import fs from 'node:fs';
const axe = fs.readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
export default async ({ send, evaluate, wait, log, sampleData }) => {
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: new URL('../../index.html', import.meta.url).href }); await wait(3000);
  await sampleData();
  await evaluate(axe);
  await evaluate(`document.querySelector('#auth-dialog')?.open&&document.querySelector('#auth-dialog').close();cloudFeaturesAvailable=()=>true;activeUser={id:'u',email:'owner@pkworks.co'};currentRole='admin';callSocialApi=async()=>{throw new Error('offline in this test')};`);
  const seen = new Map();
  const check = async (where) => {
    const found = JSON.parse(await evaluate(`(async()=>{const r=await axe.run(document,{resultTypes:['violations'],runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});return JSON.stringify(r.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.slice(0,4).map(n=>n.target.join(' ')+(n.any?.[0]?.message?' — '+n.any[0].message:''))})));})()`));
    for (const v of found) { const key = v.id + v.nodes[0]; if (!seen.has(key)) seen.set(key, { ...v, where }); }
  };
  for (const theme of ['light', 'dark']) {
    await evaluate(`localStorage.setItem('signaldesk-theme','${theme}');applyTheme()`);
    for (const view of ['overview', 'calendar', 'composer', 'library', 'inbox', 'analytics', 'clients', 'social-accounts', 'approvals', 'settings']) { await evaluate(`showView('${view}')`); await wait(500); await check(`${view} (${theme})`); }
  }
  await evaluate(`localStorage.setItem('signaldesk-theme','light');applyTheme();openNotificationPreferences()`); await wait(300); await check('notification preferences');
  await evaluate(`document.querySelectorAll('dialog[open]').forEach(d=>d.close());document.querySelector('[data-open-feedback]')?.click()`); await wait(300); await check('feedback');
  await evaluate(`document.querySelectorAll('dialog[open]').forEach(d=>d.close())`);
  for (const v of seen.values()) log.push(`[${process.env.A11Y_REPORT ? 'a11y' : 'exception'}] ${v.impact} ${v.id} (${v.where}): ${v.help} → ${v.nodes.join(' | ')}`);
  log.push(`accessibility: ${seen.size} serious or critical problem${seen.size === 1 ? '' : 's'}`);
};
