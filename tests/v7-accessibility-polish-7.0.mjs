import fs from 'node:fs';
import assert from 'node:assert/strict';
const css=fs.readFileSync(new URL('../src/v7/v7.css',import.meta.url),'utf8');
assert.match(css, /:root\{--v7-muted-2:#6f849d\}/);
assert.match(css, /\[data-theme="light"\]\{--v7-muted-2:#5f7085\}/);
assert.match(css, /button:focus-visible/);
assert.match(css, /prefers-reduced-motion:reduce/);
console.log('V7 accessibility polish 7.0 contract: PASS');
