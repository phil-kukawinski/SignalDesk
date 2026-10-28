// Combines and minifies the app's scripts and stylesheet into js/app.min.js and css/app.min.css,
// and points index.html at them with a content hash so browsers pick up each new version.
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
const kb = (text) => `${(Buffer.byteLength(text) / 1024).toFixed(0)} KB`;
console.log(`js/app.min.js ${kb(js)} (from ${kb(source)} in ${files.length} files) · css/app.min.css ${kb(css)}`);
