import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const migration = read('supabase/migrations/20260810221851_v7_feature_parity_saved_views_bulk_cde.sql');
const saved = read('src/v7/components/SavedWorkViews.js');
const work = read('src/v7/pages/WorkPage.js');
const intel = read('src/v7/pages/WorkIntelligencePage.js');
const docs = read('src/v7/pages/DocumentsPage.js');
const cad = read('src/v7/components/CadWorkspace.js');
const api = read('src/v7/lib/api.js');
const health = read('app/api/health/route.js');
const smoke = read('scripts/postdeploy-smoke.mjs');
const preflight = read('scripts/release-preflight.mjs');
const css = read('src/v7/v7.css');

assert.ok(migration.includes("'work.tasks'") && migration.includes("'files.workspace'"), 'Saved-view backend must support Work and Files parity view keys');
assert.ok(migration.includes('bulk_set_document_control_status') && migration.includes('bulk_trash_documents'), 'CDE must expose bounded canonical bulk actions');
assert.ok(migration.includes('cardinality(v_ids)>100'), 'CDE bulk actions must be bounded to 100 rows');
assert.ok(migration.includes('grant execute on function public.bulk_set_document_control_status') && migration.includes('to authenticated'), 'Bulk CDE actions must be authenticated only');

assert.ok(saved.includes("view_key: 'eq.work.tasks'") && saved.includes("'save_workspace_saved_view'") && saved.includes("'delete_workspace_saved_view'"), 'Work saved views must load, save and delete through the canonical saved-view contract');
assert.ok(saved.includes('حفظ العرض الحالي') && saved.includes('العروض المحفوظة'), 'Work saved views must ship Arabic interaction labels');
assert.ok(work.includes("import SavedWorkViews") && work.includes('<SavedWorkViews'), 'Work queue must expose saved views');
assert.ok(saved.includes('autoApplyDefault') && saved.includes('is_default'), 'Work saved views must restore the user default view without overriding explicit routed filters');

assert.ok(intel.includes('capacityFrom') && intel.includes('moveCapacity') && intel.includes("onMove(-14)") && intel.includes("onMove(14)"), 'Capacity planning must support traversing planning windows');
assert.ok(intel.includes('فوق القدرة') && intel.includes('سعة متاحة'), 'Capacity planning must ship Arabic decision metrics');

assert.ok(api.includes('async deleteRows('), 'V7 API must expose RLS-aware row deletion for favorites and saved resources');
assert.ok(docs.includes('favoriteRows') && docs.includes("id: `in.(${ids.join(',')})`"), 'CDE favorite documents must load across the current project/site scope, not only the current page');
assert.ok(docs.includes("api.select('favorites'") && docs.includes("toggleFavorite('document'") && docs.includes("toggleFavorite('folder'"), 'CDE must restore user favorites for documents and folders');
assert.ok(docs.includes("'bulk_set_document_control_status'") && docs.includes("'bulk_trash_documents'"), 'CDE must wire bulk lifecycle actions to canonical RPCs');
assert.ok(docs.includes('selectedDocuments') && docs.includes('إرسال للمراجعة') && docs.includes('إلى السلة'), 'CDE bulk selection must be actionable and Arabic-localized');

assert.ok(cad.includes('diffEngineeringSnapshots') && cad.includes('compareRevisionId'), 'CAD must restore revision comparison using the native geometry snapshot diff core');
assert.ok(cad.includes('optimum.v7.cad.favorites') && cad.includes('favoriteCodes') && cad.includes('المفضلة'), 'CAD library must restore persistent element favorites');
assert.ok(cad.includes('مقارنة المراجعة') && cad.includes('diffTotals'), 'CAD revision comparison must surface Arabic comparison totals');

assert.ok(health.includes("20260810221851"), 'Health endpoint must report the Tranche 17 production schema head');
assert.ok(smoke.includes("20260810221851"), 'Post-deploy smoke must require the Tranche 17 schema head');
assert.ok(preflight.includes('20260810221851_v7_feature_parity_saved_views_bulk_cde.sql'), 'Release preflight must require the Tranche 17 migration');
assert.ok(read('src/v7/components/Icon.js').includes('star:') && read('src/v7/components/Icon.js').includes('filter:'), 'Restored controls must use real V7 icons instead of the fallback grid');
assert.ok(css.includes('.v7-saved-view-bar') && css.includes('.v7-cde-bulk-bar') && css.includes('.v7-cad-revision-diff'), 'Tranche 17 responsive UI styles are required');

console.log('V7 feature parity tranche 17: GO');
