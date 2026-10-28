// The combined app (js/app.min.js) is safe to build: every app file is listed once, no two files
// declare the same top-level name (joined into one script, that would be an error or a silent
// override), and the bundle in the repo matches the sources.
const ROOT = require('node:path').resolve(__dirname, '../..');
const fs = require('node:fs');
const assert = require('node:assert');
const acorn = require('acorn');
const files = JSON.parse(fs.readFileSync(`${ROOT}/js/app-files.json`, 'utf8'));
const standalone = new Set(['config.js', 'review.js', 'bio-page.js', 'app.min.js']);
const onDisk = fs.readdirSync(`${ROOT}/js`).filter((name) => name.endsWith('.js') && !standalone.has(name));
assert.deepEqual(onDisk.filter((name) => !files.includes(`js/${name}`)), [], 'every app file is in js/app-files.json');
assert.equal(new Set(files).size, files.length, 'no file is listed twice');
assert.equal(files[files.length - 1], 'js/app.js', 'app.js starts the app, so it comes last');
const declared = new Map();
for (const file of files) {
  for (const node of acorn.parse(fs.readFileSync(`${ROOT}/${file}`, 'utf8'), { ecmaVersion: 'latest' }).body) {
    const names = node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration' ? [node.id.name] : node.type === 'VariableDeclaration' ? node.declarations.filter((item) => item.id.type === 'Identifier').map((item) => item.id.name) : [];
    for (const name of names) {
      assert.ok(!declared.has(name), `${name} is declared in both ${declared.get(name)} and ${file}`);
      declared.set(name, file);
    }
  }
}
const html = fs.readFileSync(`${ROOT}/index.html`, 'utf8');
assert.match(html, /<script src="js\/config\.js"><\/script>\s*(<!--[^>]*-->\s*)?<script src="js\/app\.min\.js\?v=[a-z0-9]+"><\/script>/, 'index.html loads config.js, then the bundle');
console.log('bundle tests passed');
