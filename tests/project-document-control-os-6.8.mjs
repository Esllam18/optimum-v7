import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const pkg=JSON.parse(read('package.json'));
const app=read('assets/app.js');
const pubApp=read('public/assets/app.js');
const work=read('assets/work-os.js');
const pubWork=read('public/assets/work-os.js');
const eng=read('assets/engineering.js');
const pubEng=read('public/assets/engineering.js');
const styles=read('assets/styles.css');
const baseSchema=read('supabase/migrations/20260803211107_phase2_files_schema.sql');
const baseFlows=read('supabase/migrations/20260803211211_phase2_files_workflows.sql');
const core=read('supabase/migrations/20260808173000_phase6_8_project_document_control_os.sql');
const cde=read('supabase/migrations/20260808174000_phase6_8_cde_query_navigation.sql');
const blueprints=read('supabase/migrations/20260808175000_phase6_8_blueprints_release_hardening.sql');
const perf=read('supabase/migrations/20260808176000_phase6_8_performance_release_cleanup.sql');

assert.equal(pkg.version,'6.9.0');
assert.equal(app,pubApp,'app.js root/public drift');
assert.equal(work,pubWork,'work-os.js root/public drift');
assert.equal(eng,pubEng,'engineering.js root/public drift');
assert.equal(styles,read('public/assets/styles.css'),'styles root/public drift');
assert.equal(styles,read('app/globals.css'),'styles root/app drift');
assert.equal(styles,read('platform-console/assets/styles.css'),'styles root/platform drift');

for(const marker of ['create table public.folder_templates','create table public.folders','create table public.documents','create table public.document_versions','create type public.document_state','company-files'])
  assert.ok(baseSchema.includes(marker),`Reconstructed Phase 2 schema missing ${marker}`);
for(const marker of ['instantiate_default_folders','begin_document_upload','finalize_document_upload','create_folder','company_files_insert'])
  assert.ok(baseFlows.includes(marker),`Reconstructed Phase 2 workflows missing ${marker}`);

for(const marker of ['save_project','save_site','project_archive_impact','archive_project','reactivate_project','site_archive_impact','archive_site','reactivate_site','project_360','site_360','document_360','company_storage_intelligence','document_search_v2','trash_query','resolve_entity_context','set_document_control_status'])
  assert.ok(core.includes(marker),`6.8 core migration missing ${marker}`);
for(const marker of ['can_upload_company_file_object','can_download_company_file_object','can_delete_company_file_object','notify_resource_members','pg_advisory_xact_lock','project_context_operational'])
  assert.ok(core.includes(marker),`6.8 hardening missing ${marker}`);
assert.match(core,/files\.rename/); assert.match(core,/files\.move/); assert.match(core,/files\.restore/);
assert.doesNotMatch(core,/can_access_storage_object\(name,'files\.(upload|download|manage)'/,'6.8 storage policies must not use company-path-only authorization');

for(const marker of ['file_workspace_snapshot','document_picker_query','websearch_to_tsquery','search_vector','global_search'])
  assert.ok(cde.includes(marker),`CDE query migration missing ${marker}`);
for(const marker of ['project_blueprints','Fiber Delivery','Construction Delivery','save_project_blueprint','revoke insert,update,delete on public.projects from authenticated','revoke insert,update,delete on public.sites from authenticated'])
  assert.ok(blueprints.includes(marker),`Blueprint/release hardening missing ${marker}`);
for(const marker of ['documents_approved_by_idx','project_blueprints_created_by_idx','project_blueprints_folder_template_idx','project_blueprints_global_code_unique'])
  assert.ok(perf.includes(marker),`6.8 performance cleanup missing ${marker}`);

for(const marker of ['Projects Command Center','Project Information & Documents','Project 360','SITE 360','DOCUMENT 360','Storage Intelligence','Workspace Blueprint','navigateToEntity','runFileSearch','openSiteDetails','openStorageIntelligence'])
  assert.ok(app.includes(marker),`PDC client missing ${marker}`);
for(const rpc of ['save_project','save_site','project_360','site_360','document_360','company_storage_intelligence','document_search_v2','trash_query','resolve_entity_context','file_workspace_snapshot','set_document_control_status'])
  assert.ok(app.includes(`'${rpc}'`)||app.includes(`\"${rpc}\"`),`PDC client missing RPC ${rpc}`);
assert.doesNotMatch(app,/\.from\(['"]projects['"]\)\.(insert|update|delete)/,'Project mutations must not use direct Data API writes');
assert.doesNotMatch(app,/\.from\(['"]sites['"]\)\.(insert|update|delete)/,'Site mutations must not use direct Data API writes');
assert.doesNotMatch(app,/api\.select\(['"]document_versions['"],[\s\S]{0,200}limit:\s*10000/,'Files workspace must not globally load 10k versions');
assert.match(app,/Site Delivery & Claim Intelligence · 6\.9\.0/);
assert.match(work,/focusProject\(/,'Work OS must expose project-context focus integration');
assert.match(eng,/document_picker_query/,'Engineering document linking must query documents server-side');
assert.match(eng,/openDocumentDetails/,'Engineering must deep-link to Document 360');

for(const cls of ['.pdc-portfolio-hero','.pdc-project-card','.project360-hero','.site360-hero','.cde-context','.cde-workspace','.cde-document-card','.document360-hero','.storage-intelligence-hero','.blueprint-picker','.trash-control'])
  assert.ok(styles.includes(cls),`Professional PDC UI style missing ${cls}`);
for(const path of ['app/page.js','app/platform/page.js','assets/app.js','assets/api.js','assets/platform.js','platform-console/index.html']) {
  const src=read(path); assert.ok(src.includes('6.9.0'),`${path} missing 6.9.0 marker`); assert.ok(!src.includes('v=6.7.0'),`${path} has stale 6.7 cache key`);
}
console.log('Phase 6.8 Project & Document Control OS static checks passed.');
