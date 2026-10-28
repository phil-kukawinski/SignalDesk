// Checks the browser app's source files for mistakes that tests can miss: names used but never
// defined (typos), duplicate keys, unreachable code. The app's files share one global scope, so
// everything declared at the top level of any of them counts as defined. Run: npx eslint js
import fs from 'node:fs';
import * as acorn from 'acorn';
import globals from 'globals';
const files = JSON.parse(fs.readFileSync('js/app-files.json', 'utf8'));
const shared = {};
for (const file of [...files, 'js/config.js']) {
  for (const node of acorn.parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 'latest' }).body) {
    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') shared[node.id.name] = 'writable';
    if (node.type === 'VariableDeclaration') for (const item of node.declarations) if (item.id.type === 'Identifier') shared[item.id.name] = 'writable';
  }
}
// Functions the media viewer publishes as window.* (it's also loaded on its own by review.html).
for (const name of fs.readFileSync('js/media-viewer.js', 'utf8').matchAll(/window\.([A-Za-z]+)\s*=/g)) shared[name[1]] = 'readonly';
const rules = { 'no-undef': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'error', 'no-self-assign': 'error', 'no-dupe-else-if': 'error', 'no-duplicate-case': 'error', 'use-isnan': 'error', 'valid-typeof': 'error', 'no-unsafe-negation': 'error', 'no-cond-assign': ['error', 'except-parens'] };
export default [
  { ignores: ['js/app.min.js', 'node_modules/**'] },
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  { files: ['js/**/*.js'], languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: { ...globals.browser, supabase: 'readonly', turnstile: 'readonly', ...shared } }, rules },
  { files: ['sw.js'], languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: { ...globals.serviceworker } }, rules },
  { files: ['api/**/*.js', 'scripts/**/*.mjs'], languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs', globals: { ...globals.node } }, rules },
  { files: ['scripts/**/*.mjs'], languageOptions: { sourceType: 'module' } }
];
