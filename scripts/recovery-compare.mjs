import fs from 'node:fs';
import process from 'node:process';

const [baselinePath, restoredPath] = process.argv.slice(2).filter(x => !x.startsWith('--'));
if (!baselinePath || !restoredPath) {
  console.error('Usage: node scripts/recovery-compare.mjs <baseline.json> <restored-validation.json> [--json]');
  process.exit(2);
}

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const baseline = read(baselinePath);
const restoredRaw = read(restoredPath);
const restored = restoredRaw.recovery_baseline || restoredRaw.result || restoredRaw;
const counts = restored.counts || {};
const fingerprints = restored.fingerprints || {};
const invariants = restored.invariants || {};

const checks = [];
const add = (id, ok, detail) => checks.push({ id, ok: Boolean(ok), detail });

for (const [key, expected] of Object.entries(baseline.counts || {})) {
  if (key === 'captured_at') continue;
  add(`count:${key}`, String(counts[key]) === String(expected), `expected=${expected}; restored=${counts[key] ?? 'missing'}`);
}
for (const [key, expected] of Object.entries(baseline.fingerprints || {})) {
  add(`fingerprint:${key}`, String(fingerprints[key]) === String(expected), `expected=${expected}; restored=${fingerprints[key] ?? 'missing'}`);
}
for (const [key, value] of Object.entries(invariants)) {
  add(`invariant:${key}`, Number(value) === 0, `restored=${value}`);
}
for (const key of Object.keys(baseline.invariants || {})) {
  if (!(key in invariants)) add(`invariant:${key}`, false, 'missing from restored validation');
}

const failed = checks.filter(x => !x.ok);
for (const row of checks) console.log(`${row.ok ? 'PASS' : 'FAIL'} ${row.id} — ${row.detail}`);
console.log(`\n${failed.length ? 'NO-GO' : 'GO'} — ${failed.length} recovery mismatch(es)`);
if (process.argv.includes('--json')) console.log(JSON.stringify({ go: failed.length === 0, failed, checks }, null, 2));
process.exitCode = failed.length ? 1 : 0;
