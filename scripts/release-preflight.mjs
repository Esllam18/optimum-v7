import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = [];
const add = (id, ok, detail, blocking = true) => result.push({ id, ok: Boolean(ok), blocking, detail });
const exists = p => fs.existsSync(path.join(root, p));
const text = p => fs.readFileSync(path.join(root, p), 'utf8');

const [major, minor] = process.versions.node.split('.').map(Number);
add('node-version', major > 20 || (major === 20 && minor >= 9), `Node ${process.versions.node}; required >=20.9`);

for (const file of ['package.json','package-lock.json','next.config.mjs','app/v7/[[...segments]]/page.js','app/api/health/route.js','src/v7/V7App.js','src/v7/lib/cadCore.js','supabase/functions/v7-member-invitation/index.ts','Dockerfile','.dockerignore','.github/workflows/v7-ci.yml','scripts/release-env-check.mjs','scripts/prepare-standalone.mjs','requirements-visual.txt','.github/workflows/v7-release-handoff.yml']) {
  add(`file:${file}`, exists(file), exists(file) ? 'present' : 'missing');
}

add('standalone-output', /output:\s*['"]standalone['"]/.test(text('next.config.mjs')), 'Next production output is standalone');
add('health-endpoint', /service:\s*['"]optimum-v7['"]/.test(text('app/api/health/route.js')) && /schemaHead/.test(text('app/api/health/route.js')), 'machine-readable V7 health endpoint is present');
add('ci-pipeline', /npm ci --no-audit --no-fund/.test(text('.github/workflows/v7-ci.yml')) && /postdeploy-smoke/.test(text('.github/workflows/v7-ci.yml')) && /docker build/.test(text('.github/workflows/v7-ci.yml')), 'CI installs from lockfile, builds production image and smoke-tests the exact container');
add('release-handoff', /release:env:strict/.test(text('.github/workflows/v7-release-handoff.yml')) && /npm run test:release/.test(text('.github/workflows/v7-release-handoff.yml')) && /npm run build/.test(text('.github/workflows/v7-release-handoff.yml')) && /upload-artifact/.test(text('.github/workflows/v7-release-handoff.yml')), 'manual staging/production handoff is strict, tested and artifact-based');

const pkg = JSON.parse(text('package.json'));
const lock = JSON.parse(text('package-lock.json'));
for (const dep of ['next','react','react-dom']) {
  const locked = lock.packages?.[`node_modules/${dep}`]?.version;
  add(`lock:${dep}`, Boolean(locked), `${dep} lock=${locked || 'missing'} package=${pkg.dependencies?.[dep] || 'missing'}`);
}

const nextBinCandidates = [
  'node_modules/.bin/next',
  'node_modules/next/dist/bin/next'
];
const nextBin = nextBinCandidates.find(exists);
add('next-binary', Boolean(nextBin), nextBin ? `found ${nextBin}` : 'Next dependency is not installed in this environment');

const migrationDir = path.join(root, 'supabase/migrations');
const migrationNames = fs.readdirSync(migrationDir).filter(x => /^\d+_v7_.*\.sql$/.test(x)).sort();
const expected = [
  '20260809225541_v7_work_read_performance.sql',
  '20260809225906_v7_project360_read_performance.sql',
  '20260809230046_v7_engineering_draft_fast_path.sql',
  '20260809230254_v7_site360_read_performance.sql',
  '20260809231816_v7_people_directory_security_contract.sql',
  '20260809232122_v7_dashboard_metrics_performance.sql',
  '20260809232304_v7_delivery_directory.sql',
  '20260810084546_v7_invitation_preview_public_token_scope.sql',
  '20260810092620_v7_client_telemetry.sql',
  '20260810092938_v7_client_telemetry_performance_hardening.sql',
  '20260810221851_v7_feature_parity_saved_views_bulk_cde.sql'
];
add('v7-migration-chain', JSON.stringify(migrationNames) === JSON.stringify(expected), `active=${migrationNames.length}; expected=${expected.length}`);

const v7Files = [];
const walk = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full); else if (/\.(js|jsx|mjs)$/.test(entry.name)) v7Files.push(full);
  }
};
walk(path.join(root, 'src/v7'));
const combined = v7Files.map(f => fs.readFileSync(f,'utf8')).join('\n');
add('legacy-engineering-import', !/from\s+['"][^'"]*assets\/engineering\.js['"]/.test(combined), 'V7 must not import the legacy Engineering UI runtime');
add('legacy-engineering-route', !/location\.(?:assign|href)\s*\(?\s*['"]\/#\/engineering/.test(combined), 'V7 must not redirect CAD authoring to legacy Engineering UI');

const edge = text('supabase/functions/v7-member-invitation/index.ts');
add('edge-jwt-contract', /admin\.auth\.getUser\(token\)/.test(edge), 'Edge function verifies caller session inside the function');
add('edge-origin-allowlist', /configuredOrigins\s*=\s*new Set/.test(edge) && /isAllowedOrigin/.test(edge) && /Application origin is not configured/.test(edge), 'Invite redirects fail closed unless origin is configured (localhost allowed for development)');
add('edge-cors-allowlist', /if \(!origin \|\| !isAllowedOrigin\(origin\)\) return base/.test(edge) && /Forbidden origin/.test(edge), 'CORS no longer reflects arbitrary HTTPS origins');

const baseline = exists('docs/recovery/V7_RECOVERY_BASELINE_20260810T104151Z.json');
const validator = exists('supabase/tests/v7_recovery_validation.sql');
const recoveryCompare = exists('scripts/recovery-compare.mjs');
add('recovery-baseline', baseline && validator && recoveryCompare, baseline && validator && recoveryCompare ? 'baseline + restore validator + comparison tool present' : 'recovery artifacts missing');
add('deploy-env-example', exists('.env.example') && /NEXT_PUBLIC_SUPABASE_URL=/.test(text('.env.example')) && !/sb_secret_|SERVICE_ROLE/.test(text('.env.example')), '.env.example contains public V7 config only');
add('postdeploy-smoke', exists('scripts/postdeploy-smoke.mjs') && /\/api\/health/.test(text('scripts/postdeploy-smoke.mjs')) && /Optimum · Next\|v7-boot\|DELIVERY OPERATING SYSTEM/.test(text('scripts/postdeploy-smoke.mjs')), 'post-deploy health + V7 route/header smoke is present');

const blockers = result.filter(x => x.blocking && !x.ok);
for (const row of result) console.log(`${row.ok ? 'PASS' : 'FAIL'} ${row.id} — ${row.detail}`);
console.log(`\n${blockers.length ? 'NO-GO' : 'GO'} — ${blockers.length} blocking gate(s)`);
if (process.argv.includes('--json')) console.log(JSON.stringify({ go: blockers.length === 0, blockers, checks: result }, null, 2));
process.exitCode = blockers.length ? 1 : 0;
