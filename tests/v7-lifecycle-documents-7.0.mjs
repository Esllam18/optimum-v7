import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const project=read('src/v7/pages/ProjectDetailPage.js');
const edits=read('src/v7/components/EntityEditSheets.js');
const lifecycle=read('src/v7/components/LifecycleActionSheet.js');
const docs=read('src/v7/pages/DocumentsPage.js');
const work=read('src/v7/pages/WorkPage.js');
const version=read('src/v7/components/NewVersionSheet.js');
const api=read('src/v7/lib/api.js');
const workMigration=read('supabase/migrations/20260809225541_v7_work_read_performance.sql');
const css=read('src/v7/v7.css');

assert.ok(project.includes("setEditKind(currentKind)"),'Project/Site/Cabinet 360 must expose contextual native edit');
assert.ok(project.includes('<LifecycleActionSheet'),'Entity lifecycle controls must use a deliberate impact/confirmation surface');
for(const rpc of ["api.rpc('save_project'","api.rpc('save_site'","api.rpc('save_site_cabinet'"]) assert.ok(edits.includes(rpc),`${rpc} must back native edit forms`);
for(const rpc of ['archive_project','reactivate_project','archive_site','reactivate_site','archive_site_cabinet','reactivate_site_cabinet']) assert.ok(lifecycle.includes(rpc),`${rpc} lifecycle RPC must be represented`);
assert.ok(lifecycle.includes('project_archive_impact')&&lifecycle.includes('site_archive_impact'),'Archive must review impact before destructive lifecycle change');

assert.ok(docs.includes('const PAGE_SIZE = 50'),'CDE documents must page instead of loading an unbounded folder');
assert.ok(docs.includes("api.select('documents'"),'Normal CDE folder rows must page directly through RLS-protected PostgREST');
assert.ok(docs.includes('offset: page * PAGE_SIZE'),'CDE folder pagination must be server-side');
assert.ok(docs.includes("p_document_limit: 1"),'Workspace snapshot must not preload folder document bodies');
assert.ok(docs.includes('<NewVersionSheet'),'Document 360 must expose immutable new-version flow');
assert.ok(docs.includes("api.select('document_versions'"),'Download must resolve storage metadata through RLS on demand');
assert.ok(docs.includes('api.downloadObject('),'Document 360 downloads must use a secure storage flow');
for(const rpc of ["api.rpc('begin_new_version_upload'","api.rpc('finalize_document_upload'","api.rpc('abort_document_upload'"]) assert.ok(version.includes(rpc),`${rpc} must back new-version lifecycle`);
assert.ok(version.includes('api.deleteObject('),'Failed version upload must remove any uploaded binary before abort');
assert.ok(api.includes('async createSignedUrl(')&&api.includes('async downloadObject('),'V7 API must support secure private-file downloads');

for(const filter of ["p_filters->>'site_id'","p_filters->>'folder_id'","p_filters->>'document_id'"]) assert.ok(workMigration.includes(filter),`Work migration must preserve ${filter}`);
for(const capability of ['can_edit','can_complete','can_claim']) assert.ok(workMigration.includes(capability),`Work migration must preserve ${capability} capability fields`);
assert.ok(workMigration.includes('with base as materialized')&&workMigration.includes('scoped as materialized')&&workMigration.includes('page_ids as materialized'),'Contextual Work filtering should materialize visible/scoped/page sets in the optimized canonical read path');
assert.ok(work.includes('scopedRequest ? Promise.resolve(null)'), 'Scoped Work must skip company-wide dashboard metrics');
assert.ok(work.includes('v7-context-summary'), 'Scoped Work must explain that visible totals belong to the active context');

for(const cls of ['.v7-button--danger','.v7-lifecycle-callout','.v7-version-list','.v7-document-actions']) assert.ok(css.includes(cls),`V7 premium lifecycle/document UI requires ${cls}`);

console.log('V7 lifecycle + document control 7.0 contract: PASS');
