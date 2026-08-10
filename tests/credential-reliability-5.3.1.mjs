import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const read=(p)=>fs.readFileSync(path.join(here,p),'utf8');
const edge=read('../supabase/functions/identity-provisioning/index.ts');
const platform=read('../assets/platform.js');
const app=read('../assets/app.js');
const css=read('../assets/styles.css');
const config=read('../assets/config.js');
const pkg=JSON.parse(read('../package.json'));

assert.equal(pkg.version,'6.9.0');
assert.match(config,/6\.9\.0-site-delivery-claim-intelligence/);
assert.match(edge,/async function verifyTemporaryPassword/);
assert.match(edge,/signInWithPassword\(\{email,password\}\)/);
assert.match(edge,/Temporary credential verification failed/);
assert.match(edge,/return `O\$\{left\}@\$\{right\}`/);
assert.match(edge,/credential_verified/);
assert.match(platform,/class="credential-value credential-password" dir="ltr"/);
assert.match(platform,/Credentials verified|تم اختبار بيانات الدخول/);
assert.match(app,/class="input auth-password-input"[^>]+dir="ltr"/);
assert.match(css,/unicode-bidi:isolate/);
assert.match(css,/unicode-bidi:plaintext/);

console.log('Phase 5.3.1 credential reliability tests passed.');
