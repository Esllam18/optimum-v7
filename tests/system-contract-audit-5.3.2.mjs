import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(p)=>fs.readFileSync(path.join(ROOT,p),'utf8');
const active=['assets/app.js','assets/access-engine.js','assets/organization-os.js','assets/platform.js','assets/engineering.js','assets/api.js'];
const source=active.map(read).join('\n');
const sqlFiles=[];
function collectSql(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) collectSql(full);
    else if(entry.name.endsWith('.sql')) sqlFiles.push(full);
  }
}
collectSql(path.join(ROOT,'supabase'));
const migrations=sqlFiles.map(file=>fs.readFileSync(file,'utf8')).join('\n');

const actions=new Set([...source.matchAll(/data-action=["']([^"'${}]+)["']/g)].map(m=>m[1]));
const handled=new Set([
  ...[...source.matchAll(/(?:action|type)\s*===\s*["']([^"']+)["']/g)].map(m=>m[1]),
  ...[...source.matchAll(/case\s+["']([^"']+)["']/g)].map(m=>m[1]),
]);
const actionIgnore=new Set(['close-overlay','close-dialog','dismiss','noop']);
const unhandled=[...actions].filter(x=>!handled.has(x)&&!actionIgnore.has(x));
assert.deepEqual(unhandled,[],`UI actions without a handler: ${unhandled.join(', ')}`);

const forms=new Set([...source.matchAll(/data-form=["']([^"'${}]+)["']/g)].map(m=>m[1]));
const formHandled=new Set([
  ...[...source.matchAll(/(?:type|form\.dataset\.form)\s*===\s*["']([^"']+)["']/g)].map(m=>m[1]),
  ...[...source.matchAll(/case\s+["']([^"']+)["']/g)].map(m=>m[1]),
]);
const formIgnore=new Set(['permission-matrix']);
const unhandledForms=[...forms].filter(x=>!formHandled.has(x)&&!formIgnore.has(x));
assert.deepEqual(unhandledForms,[],`Forms without a submit handler: ${unhandledForms.join(', ')}`);

const rpcNames=new Set([...source.matchAll(/\.rpc\(["']([a-zA-Z0-9_]+)["']/g)].map(m=>m[1]));
const missingRpc=[...rpcNames].filter(name=>!new RegExp(`function\\s+(?:public\\.)?${name}\\s*\\(`,'i').test(migrations));
assert.deepEqual(missingRpc,[],`RPC references missing from migrations: ${missingRpc.join(', ')}`);

assert.doesNotMatch(source,/SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'][^"']+/i,'Service role key must never be shipped to browser assets.');
assert.doesNotMatch(read('assets/app.js'),/identity-provisioning-verified/);
assert.doesNotMatch(read('assets/platform.js'),/identity-provisioning-verified/);
assert.match(read('tests/browser-workflows-5.3.py'),/Path\(__file__\)\.resolve\(\)\.parents\[1\]/,'Browser workflow must test the current package, not an old absolute folder.');

for(const file of ['api.js','platform.js','config.js','styles.css','icons.js']){
  assert.equal(read(`assets/${file}`),read(`public/assets/${file}`),`public/assets/${file} drifted from the canonical asset.`);
  assert.equal(read(`assets/${file}`),read(`platform-console/assets/${file}`),`platform-console/assets/${file} drifted from the canonical asset.`);
}
for(const file of ['app.js','engineering.js','i18n.js']) assert.equal(read(`assets/${file}`),read(`public/assets/${file}`),`public/assets/${file} drifted from the canonical asset.`);

assert.match(migrations,/service_find_auth_user_by_email/);
assert.match(read('supabase/functions/identity-provisioning/index.ts'),/OPTIMUM_ALLOWED_ORIGINS/);
assert.ok(!fs.existsSync(path.join(ROOT,'supabase/functions/identity-provisioning-verified')),'Deprecated wrapper source must be removed.');
console.log(JSON.stringify({ok:true,actions:actions.size,forms:forms.size,rpcs:rpcNames.size},null,2));
