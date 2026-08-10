import process from 'node:process';

const strict = process.argv.includes('--strict');
const values = {
  NEXT_PUBLIC_SUPABASE_URL: String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: String(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim(),
  NEXT_PUBLIC_OPTIMUM_RELEASE: String(process.env.NEXT_PUBLIC_OPTIMUM_RELEASE || '').trim()
};

const checks = [];
const add = (id, ok, detail, blocking = true) => checks.push({ id, ok: Boolean(ok), detail, blocking });

let parsedUrl = null;
try { parsedUrl = values.NEXT_PUBLIC_SUPABASE_URL ? new URL(values.NEXT_PUBLIC_SUPABASE_URL) : null; }
catch {}

add(
  'supabase-url-present',
  !strict || Boolean(values.NEXT_PUBLIC_SUPABASE_URL),
  values.NEXT_PUBLIC_SUPABASE_URL || (strict ? 'missing' : 'not set; source fallback is permitted only outside strict release mode')
);
add(
  'supabase-url-https',
  !values.NEXT_PUBLIC_SUPABASE_URL || parsedUrl?.protocol === 'https:',
  parsedUrl ? `${parsedUrl.protocol}//${parsedUrl.host}` : 'not evaluated without an explicit URL'
);
add(
  'publishable-key-present',
  !strict || Boolean(values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? 'configured' : (strict ? 'missing' : 'not set; source fallback is permitted only outside strict release mode')
);
add(
  'publishable-key-format',
  !values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || /^sb_publishable_[A-Za-z0-9_-]+$/.test(values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? 'sb_publishable_* expected' : 'not evaluated without an explicit key'
);
add(
  'release-id',
  !strict || Boolean(values.NEXT_PUBLIC_OPTIMUM_RELEASE),
  values.NEXT_PUBLIC_OPTIMUM_RELEASE || (strict ? 'missing' : 'optional outside strict release mode')
);

const blockers = checks.filter(x => x.blocking && !x.ok);
for (const row of checks) console.log(`${row.ok ? 'PASS' : 'FAIL'} ${row.id} — ${row.detail}`);
console.log(`\n${blockers.length ? 'NO-GO' : 'GO'} — ${blockers.length} build environment gate(s)`);
if (process.argv.includes('--json')) console.log(JSON.stringify({ go: blockers.length === 0, strict, blockers, checks }, null, 2));
process.exitCode = blockers.length ? 1 : 0;
