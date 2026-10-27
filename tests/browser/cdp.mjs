// Drive headless Chrome over the DevTools protocol: node cdp.mjs <steps.mjs>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--remote-debugging-port=9333', '--user-data-dir=' + (process.env.PROFILE || fs.mkdtempSync(path.join(os.tmpdir(), 'signaldesk-chrome-'))), '--window-size=1400,1000', 'about:blank'], { stdio: 'ignore' });
let ws;
for (let i = 0; i < 50 && !ws; i++) { try { const list = await (await fetch('http://127.0.0.1:9333/json')).json(); const page = list.find((t) => t.type === 'page'); if (page) ws = new WebSocket(page.webSocketDebuggerUrl); } catch {} if (!ws) await new Promise((r) => setTimeout(r, 200)); }
await new Promise((r) => ws.addEventListener('open', r));
const served = new Set(); const urls = new Map(); let id = 0; const pending = new Map(); const log = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) log.push(`[console.${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  if (m.method === 'Runtime.exceptionThrown') log.push('[exception] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) log.push(`[http ${m.params.response.status}] ${m.params.response.url.slice(0, 160)}`);
  if (m.method === 'Network.requestWillBeSent') urls.set(m.params.requestId, m.params.request.url);
  if (m.method === 'Network.loadingFailed' && !m.params.canceled) log.push(`[failed] ${m.params.errorText} ${(urls.get(m.params.requestId) || m.params.requestId).slice(0, 200)}`);
  if (m.method === 'Fetch.requestPaused') { let path = new URL(m.params.request.url).pathname; if (path === '/') path = '/index.html'; const file = ROOT + path; if (fs.existsSync(file)) served.add(path); if (fs.existsSync(file)) { ws.send(JSON.stringify({ id: ++id, method: 'Fetch.fulfillRequest', params: { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: path.endsWith('.css') ? 'text/css' : path.endsWith('.html') ? 'text/html' : 'text/javascript' }], body: fs.readFileSync(file).toString('base64') } })); } else ws.send(JSON.stringify({ id: ++id, method: 'Fetch.continueRequest', params: { requestId: m.params.requestId } })); return; }
  if (m.method === 'Page.windowOpen') log.push('[popup] ' + m.params.url.slice(0, 300));
});
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
if (process.env.LOCAL_JS) await send('Fetch.enable', { patterns: [{ urlPattern: '*signaldesk-social.vercel.app/js/*' }, { urlPattern: '*signaldesk-social.vercel.app/css/*' }, { urlPattern: 'https://signaldesk-social.vercel.app/' }] });
await send('Runtime.enable'); await send('Network.enable'); await send('Network.setBypassServiceWorker', { bypass: true }); await send('Network.setCacheDisabled', { cacheDisabled: true }); await send('Page.enable');
const steps = (await import(path.resolve(process.argv[2]))).default;
// Sample clients for tests (the app starts empty and signed out).
const sampleData = () => evaluate(fs.readFileSync(path.join(ROOT, 'tests/fixtures/sample.js'), 'utf8'));
try { await steps({ send, evaluate, wait, log, sampleData }); } finally { console.log(log.join('\n')); if (process.env.LOCAL_JS) console.log('[local files served] ' + served.size); ws.close(); chrome.kill(); }
