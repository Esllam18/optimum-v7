import assert from 'node:assert/strict';
import fs from 'node:fs';

const cad = fs.readFileSync('src/v7/components/CadWorkspace.js','utf8');
const engineeringPage = fs.readFileSync('src/v7/pages/EngineeringPage.js','utf8');
const migration = fs.readFileSync('supabase/migrations/20260809225541_v7_work_read_performance.sql','utf8');

for (const fn of ['calculateEngineeringTakeoff','engineeringSnapshotSvg','exportEngineeringDxfCompatible','mapClientPointToSvg','normalizeEngineeringSnapshot','validateEngineeringSnapshot']) {
  assert.match(cad, new RegExp(`\\b${fn}\\b`), `V7 CAD must reuse the tested engineering core: ${fn}`);
}
assert.match(cad,/save_engineering_draft/,'V7 CAD must persist through the canonical engineering save RPC');
assert.match(cad,/begin_engineering_asset_upload/,'V7 CAD must move legacy inline logos to engineering assets');
assert.match(cad,/compactPersistedSettings/,'V7 CAD must strip runtime/signed image data before persistence');
assert.match(cad,/optimum\.v7\.cad\.recovery/,'V7 CAD must keep a local recovery draft');
assert.match(cad,/2400/,'V7 CAD autosave must be idle-coalesced rather than constant polling');
assert.match(cad,/setConnectSourceId/,'V7 CAD must support native node-to-node route creation');
assert.match(cad,/Live quantity takeoff|الحصر المباشر/,'V7 CAD must expose live takeoff');
assert.match(engineeringPage,/dynamic\(\(\) => import\('\.\.\/components\/CadWorkspace'\)/,'CAD workspace must be route-lazy and not inflate Engineering register startup');
assert.match(engineeringPage,/studioOpen/,'Engineering register must open the native workspace contextually');

assert.match(migration,/user_permission_is_unscoped/,'Work performance migration must compute scope shape once');
for (const filter of ['project_id','site_id','folder_id','document_id']) assert.match(migration,new RegExp(`p_filters->>'${filter}'`),`Work query must support ${filter}`);
assert.match(migration,/blocker_stats as materialized/,'Work risk dependencies must be aggregated set-wise');
assert.match(migration,/downstream_stats as materialized/,'Work downstream dependencies must be aggregated set-wise');
assert.match(migration,/page_ids as materialized/,'Work capabilities and counts must be evaluated after pagination');
assert.match(migration,/case when v_unscoped_manage then true else app_private\.can_edit_task/,'can_edit semantics must remain present');
assert.match(migration,/case when v_unscoped_manage then true else app_private\.can_complete_task/,'can_complete semantics must remain present');
assert.match(migration,/v_unscoped_claim/,'can_claim must preserve permission/scope enforcement');

console.log('V7 native CAD + scale-performance contracts: PASS');
