// Combines and minifies the app's scripts and stylesheet into js/app.min.js and css/app.min.css,
// points index.html at them with a content hash so browsers pick up each new version, and writes
// the security headers (including the inline script's hash) into vercel.json.
// usage: npm run bundle   (run after changing anything in js/ or css/app.css)
import fs from 'node:fs';
import crypto from 'node:crypto';
import { transformSync } from 'esbuild';
const root = new URL('..', import.meta.url).pathname;
const read = (file) => fs.readFileSync(root + file, 'utf8');
const hash = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 10);

// Classic scripts share one global scope, so joining them in order behaves like loading them one by one.
const files = JSON.parse(read('js/app-files.json'));
const source = files.map((file) => `/* ${file} */\n${read(file)}\n;`).join('\n');
const js = transformSync(source, { loader: 'js', minify: true, legalComments: 'none', charset: 'utf8' }).code;
const css = transformSync(read('css/app.css'), { loader: 'css', minify: true, legalComments: 'none', charset: 'utf8' }).code;
fs.writeFileSync(root + 'js/app.min.js', js);
fs.writeFileSync(root + 'css/app.min.css', css);

let html = read('index.html');
html = html.replace(/js\/app\.min\.js\?v=[a-z0-9]+/, `js/app.min.js?v=${hash(js)}`).replace(/css\/app\.min\.css\?v=[a-z0-9]+/, `css/app.min.css?v=${hash(css)}`);
fs.writeFileSync(root + 'index.html', html);

// Security headers for every page (not /api/, whose HTML pages set their own). The page's one inline
// script (the theme setter) is allowed by its hash, so no other inline script can run.
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => `'sha256-${crypto.createHash('sha256').update(match[1]).digest('base64')}'`);
const csp = [
  "default-src 'self'",
  `script-src 'self' ${inline.join(' ')} https://cdn.jsdelivr.net https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com",
  'frame-src https://challenges.cloudflare.com',
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests'
].join('; ');
const security = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }
];
const vercel = JSON.parse(read('vercel.json'));
const cached = (source) => ({ source, headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] });
vercel.headers = [
  { source: '/((?!api/).*)', headers: security },
  { source: '/api/(.*)', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }, { key: 'X-Frame-Options', value: 'DENY' }] },
  cached('/js/app.min.js'), cached('/css/app.min.css')
];
fs.writeFileSync(root + 'vercel.json', JSON.stringify(vercel, null, 2) + '\n');
const kb = (text) => `${(Buffer.byteLength(text) / 1024).toFixed(0)} KB`;
console.log(`js/app.min.js ${kb(js)} (from ${kb(source)} in ${files.length} files) · css/app.min.css ${kb(css)}`);
