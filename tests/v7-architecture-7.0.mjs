import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));

const required = [
  'app/v7/layout.js',
  'app/v7/[[...segments]]/page.js',
  'src/v7/V7App.js',
  'src/v7/v7.css',
  'src/v7/lib/api.js',
  'src/v7/lib/workspace.js',
  'src/v7/lib/navigation.js',
  'src/v7/components/Shell.js',
  'src/v7/components/SearchCommand.js',
  'src/v7/components/SideSheet.js',
  'src/v7/pages/DashboardPage.js',
  'src/v7/pages/ProjectsPage.js',
  'src/v7/pages/WorkPage.js',
  'src/v7/pages/DocumentsPage.js',
  'src/v7/pages/EngineeringPage.js'
];
required.forEach(file => assert.ok(exists(file), `${file} must exist`));

const route = read('app/v7/[[...segments]]/page.js');
const layout = read('app/v7/layout.js');
const app = read('src/v7/V7App.js');
const api = read('src/v7/lib/api.js');
const files = read('src/v7/pages/DocumentsPage.js');
const work = read('src/v7/pages/WorkPage.js');
const dashboard = read('src/v7/pages/DashboardPage.js');
const projects = read('src/v7/pages/ProjectsPage.js');
const nav = read('src/v7/lib/navigation.js');
const engineering = read('src/v7/pages/EngineeringPage.js');

assert.ok(!route.includes('assets/app.js'), 'V7 route must not inject legacy application shell');
assert.ok(layout.includes("src/v7/v7.css"), 'V7 global stylesheet must be imported from an App Router layout');
assert.ok(!route.includes('v7.css'), 'V7 page must not import global CSS directly');
assert.ok(app.includes('bootstrapWorkspace'), 'V7 must use focused workspace bootstrap');
assert.ok(app.indexOf('bootError') < app.indexOf('!api.session || !workspace'), 'Boot errors must be surfaced before the login fallback');
assert.ok(app.includes('!workspace.company'), 'No-membership state must be explicit');

assert.ok(api.includes('this.inflight'), 'API must dedupe in-flight reads');
assert.ok(api.includes('refreshPromise'), 'API must serialize token refresh');
assert.ok(api.includes('__OPTIMUM_V7_METRICS__'), 'API timings must be observable in the browser');
assert.ok(api.includes('markAssetFailed'), 'Broken signed assets must enter failure backoff');
assert.ok(api.includes("sessionStorageKey: 'optimum.session.v2.client'") === false, 'Session key belongs in config rather than API implementation');
assert.ok(read('src/v7/lib/config.js').includes("sessionStorageKey: 'optimum.session.v2.client'"), 'V7 must reuse the scoped 6.9 client session');

assert.ok(files.includes("api.rpc('file_workspace_snapshot'"), 'Files route must use the server-side workspace snapshot');
assert.ok(files.includes("api.rpc('document_search_v2'"), 'Document search must remain server-side');
assert.ok(!files.includes('document_picker_query'), 'Files route must not fan out document picker calls across projects');
assert.ok(files.includes('document_360'), 'Document deep links must load Document 360 context');
assert.ok(files.includes('useSearchParams'), 'Document route must honor exact project/site/folder/document context');

assert.ok(work.includes("status: status === 'open' ? 'active'"), 'Work open filter must match the database contract');
assert.ok(work.includes("scope: 'my'"), 'Work route should default to the current user scope');
assert.ok(work.includes("api.rpc('work_task_detail'"), 'Task deep links must load Work 360 detail');
assert.ok(!work.includes("status: ['todo'"), 'Work filters must not send arrays to the v6.1 RPC contract');
assert.ok(dashboard.includes('metrics?.my_todo'), 'Dashboard must use the live work_dashboard_metrics contract');
assert.ok(dashboard.includes('usage.active_projects'), 'Dashboard project count must come from runtime policy usage, not a limited recent-project page');
assert.ok(projects.includes('offset: page * PAGE_SIZE'), 'Projects must page server-side');
assert.ok(projects.includes("or: `(name.ilike.*${searchTerm}*"), 'Project search must be pushed to PostgREST instead of filtering the loaded page');

assert.ok(nav.includes("resolve_entity_context"), 'Cross-module navigation must resolve canonical entity context on the server');
assert.ok(nav.includes("/v7/documents"), 'Canonical navigation must route documents/folders to CDE');
assert.ok(nav.includes("/v7/work?task="), 'Canonical navigation must route tasks to Work 360');
assert.ok(nav.includes("/v7/engineering?drawing="), 'Canonical navigation must retain drawing identity');
assert.ok(!engineering.includes("location.assign('/#/engineering')"), 'V7 Engineering must no longer depend on the 6.9 UI runtime');
assert.ok(read('src/v7/components/CadWorkspace.js').includes("from '../lib/cadCore'"), 'V7 CAD must use its extracted native core module');

console.log('V7 architecture 7.0 contract: PASS');
