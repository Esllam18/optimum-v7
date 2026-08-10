import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');
const staticDir = path.join(root, '.next', 'static');
const publicDir = path.join(root, 'public');
const server = path.join(standalone, 'server.js');

if (!fs.existsSync(server)) {
  console.error('NO-GO — .next/standalone/server.js is missing. Run `npm run build` with output=standalone first.');
  process.exit(1);
}

const copyDir = (src, dest) => {
  if (!fs.existsSync(src)) return;
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
};
copyDir(publicDir, path.join(standalone, 'public'));
copyDir(staticDir, path.join(standalone, '.next', 'static'));

const migrationDir = path.join(root, 'supabase', 'migrations');
const migrations = fs.readdirSync(migrationDir)
  .filter(name => /^\d+_v7_.*\.sql$/.test(name))
  .sort();
const manifest = {
  application: 'optimum-v7',
  release: process.env.NEXT_PUBLIC_OPTIMUM_RELEASE || process.env.GITHUB_SHA || process.env.OPTIMUM_RELEASE || 'local',
  builtAt: new Date().toISOString(),
  node: process.version,
  schemaHead: migrations.at(-1)?.split('_')[0] || null,
  v7Migrations: migrations
};
fs.writeFileSync(path.join(standalone, 'optimum-release.json'), JSON.stringify(manifest, null, 2));
console.log(`GO — standalone deployment prepared at ${standalone}`);
console.log(JSON.stringify(manifest, null, 2));
