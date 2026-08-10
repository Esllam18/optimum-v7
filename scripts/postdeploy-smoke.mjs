import process from 'node:process';

const rawBase = String(process.env.BASE_URL || process.argv[2] || '').trim().replace(/\/+$/, '');
if (!rawBase) {
  console.error('NO-GO — BASE_URL is required, e.g. BASE_URL=https://app.example.com npm run release:postdeploy');
  process.exit(2);
}

let base;
try { base = new URL(rawBase); }
catch { console.error(`NO-GO — invalid BASE_URL: ${rawBase}`); process.exit(2); }
const allowHttp = process.env.ALLOW_HTTP === '1';
const expectedRelease = String(process.env.EXPECTED_RELEASE || '').trim();
const local = ['localhost', '127.0.0.1'].includes(base.hostname);
if (base.protocol !== 'https:' && !(allowHttp || local)) {
  console.error('NO-GO — production smoke requires HTTPS (set ALLOW_HTTP=1 only for controlled local/staging use)');
  process.exit(2);
}

const checks = [];
const add = (id, ok, detail, blocking = true) => checks.push({ id, ok: Boolean(ok), detail, blocking });
const request = async (path, init = {}) => {
  const started = performance.now();
  const response = await fetch(new URL(path, base), { redirect: 'follow', signal: AbortSignal.timeout(12_000), ...init });
  const elapsed = Math.round(performance.now() - started);
  return { response, elapsed };
};

try {
  const health = await request('/api/health');
  let healthBody = null;
  try { healthBody = await health.response.json(); } catch {}
  add('health-status', health.response.ok, `GET /api/health -> ${health.response.status} in ${health.elapsed}ms`);
  add('health-service', healthBody?.ok === true && healthBody?.service === 'optimum-v7' && healthBody?.runtime === 'next', `service=${healthBody?.service || 'missing'}; runtime=${healthBody?.runtime || 'missing'}`);
  add('health-schema-head', healthBody?.schemaHead === '20260810221851', `schemaHead=${healthBody?.schemaHead || 'missing'}`);
  if (expectedRelease) add('health-release', healthBody?.release === expectedRelease, `expected=${expectedRelease}; deployed=${healthBody?.release || 'missing'}`);
  add('health-header', health.response.headers.get('x-optimum-app') === 'v7', `x-optimum-app=${health.response.headers.get('x-optimum-app') || 'missing'}`);

  const { response, elapsed } = await request('/v7');
  const html = await response.text();
  add('v7-status', response.ok, `GET /v7 -> ${response.status} in ${elapsed}ms`);
  add('v7-marker', /Optimum · Next|v7-boot|DELIVERY OPERATING SYSTEM/.test(html), 'V7 response contains an Optimum/V7 render marker');
  add('header:nosniff', response.headers.get('x-content-type-options') === 'nosniff', `x-content-type-options=${response.headers.get('x-content-type-options') || 'missing'}`);
  add('header:frame', response.headers.get('x-frame-options') === 'DENY', `x-frame-options=${response.headers.get('x-frame-options') || 'missing'}`);
  add('header:referrer', response.headers.get('referrer-policy') === 'strict-origin-when-cross-origin', `referrer-policy=${response.headers.get('referrer-policy') || 'missing'}`);
  add('header:permissions', Boolean(response.headers.get('permissions-policy')), `permissions-policy=${response.headers.get('permissions-policy') || 'missing'}`);

  const invite = await request('/v7/invite?invite=postdeploy-invalid-token-probe');
  add('invite-route', invite.response.ok, `GET /v7/invite -> ${invite.response.status} in ${invite.elapsed}ms`);

  const favicon = await request('/favicon.svg');
  add('favicon', favicon.response.ok && /image\/svg\+xml/i.test(favicon.response.headers.get('content-type') || ''), `GET /favicon.svg -> ${favicon.response.status}; content-type=${favicon.response.headers.get('content-type') || 'missing'}`);
} catch (error) {
  add('http-runtime', false, error instanceof Error ? error.message : String(error));
}

const blockers = checks.filter(x => x.blocking && !x.ok);
for (const row of checks) console.log(`${row.ok ? 'PASS' : 'FAIL'} ${row.id} — ${row.detail}`);
console.log(`\n${blockers.length ? 'NO-GO' : 'GO'} — ${blockers.length} blocking post-deploy gate(s)`);
if (process.argv.includes('--json')) console.log(JSON.stringify({ go: blockers.length === 0, baseUrl: base.origin, blockers, checks }, null, 2));
process.exitCode = blockers.length ? 1 : 0;
