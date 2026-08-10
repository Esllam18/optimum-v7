import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const project = read('src/v7/pages/ProjectDetailPage.js');
const work = read('src/v7/pages/WorkPage.js');
const engineering = read('src/v7/pages/EngineeringPage.js');
const delivery = read('src/v7/pages/DeliveryPage.js');
const shell = read('src/v7/components/Shell.js');
const notifications = read('src/v7/components/NotificationCenter.js');
const nav = read('src/v7/lib/navigation.js');
const api = read('src/v7/lib/api.js');
const css = read('src/v7/v7.css');
const sql = read('supabase/migrations/20260809225541_v7_work_read_performance.sql');

assert.ok(project.includes("api.rpc('site_360'"), 'Project route must open Site 360 natively');
assert.ok(project.includes("api.rpc('cabinet_360'"), 'Project route must open Cabinet 360 natively');
assert.ok(project.includes('<ContextRail'), 'Project/site/cabinet must share one workspace navigation rail');
assert.ok(project.includes("projectAreaHref('documents'"), 'Project context must deep-link into the CDE');
assert.ok(project.includes("projectAreaHref('delivery'"), 'Site context must deep-link into delivery');

assert.ok(nav.includes('projectAreaHref'), 'Cross-module project navigation must use one canonical builder');
assert.ok(nav.includes("if (area === 'work')"), 'Canonical builder must preserve context into Work');
assert.ok(nav.includes("if (area === 'engineering')"), 'Canonical builder must preserve context into Engineering');

assert.ok(work.includes("params.get('project')"), 'Work must accept project context');
assert.ok(work.includes("params.get('site')"), 'Work must accept site context');
assert.ok(work.includes('p_project_id: context.project_id || null'), 'Quick-created tasks must inherit project context');
assert.ok(work.includes('p_site_id: context.site_id || null'), 'Quick-created tasks must inherit site context');
assert.ok(work.includes('p_document_id: context.document_id || null'), 'Quick-created tasks must retain document linkage');

for (const filter of ["p_filters->>'site_id'", "p_filters->>'folder_id'", "p_filters->>'document_id'"]) {
  assert.ok(sql.includes(filter), `Work query migration must implement ${filter}`);
}
assert.ok(sql.includes('with base as materialized') && sql.includes('scoped as materialized') && sql.includes('page_ids as materialized'), 'Optimized Work query must materialize the visible/scoped/page sets instead of recalculating expensive permission/risk work');
assert.ok(sql.includes('site_name'), 'Context-aware Work rows should carry site identity');

assert.ok(engineering.includes("params.get('project')"), 'Engineering must accept project context');
assert.ok(engineering.includes("filters.project_id = `eq.${projectId}`"), 'Engineering must push project filtering to PostgREST');
assert.ok(delivery.includes("params.get('site')"), 'Delivery must accept site context');
assert.ok(delivery.includes('p_site_id: siteId || null'), 'Delivery must push site filtering into the server-side directory query');
assert.ok(delivery.includes("api.rpc('delivery_directory_query'"), 'Delivery must use the scoped paginated V7 directory read model');

assert.ok(shell.includes("router.push('/v7/work?create=task')"), 'Global quick create must execute a real native V7 action');
assert.ok(shell.includes('<NotificationCenter'), 'Notification icon must open a real notification center');
assert.ok(notifications.includes("api.rpc('mark_all_notifications_read'"), 'Notification center must persist read state');
assert.ok(notifications.includes('resolveEntityHref'), 'Notifications must navigate to canonical entity context');
assert.ok(api.includes('async update(table, values'), 'V7 API must support permission-safe table updates through RLS');
assert.ok(css.includes('.v7-context-rail'), 'Integrated context navigation must have dedicated responsive styling');
assert.ok(css.includes('.v7-notification-list'), 'Notification center must have dedicated styling');

console.log('V7 integrated context 7.0 contract: PASS');
