import fs from 'node:fs';
import assert from 'node:assert/strict';
const dash=fs.readFileSync(new URL('../src/v7/pages/DashboardPage.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/v7/v7.css',import.meta.url),'utf8');
assert.match(dash,/<strong dir="ltr">\{display/);
assert.match(css,/\.v7-capacity-row strong\{unicode-bidi:isolate\}/);
assert.match(css,/@media\(max-width:900px\)[\s\S]*\.v7-delivery-list \.v7-list-main strong[\s\S]*-webkit-line-clamp:2/);
console.log('V7 RTL bidi + mobile title wrapping 7.0 contract: PASS');
