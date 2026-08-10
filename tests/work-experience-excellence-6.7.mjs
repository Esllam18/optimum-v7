import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const pkg=JSON.parse(read('package.json'));
const app=read('assets/app.js');
const pubApp=read('public/assets/app.js');
const work=read('assets/work-os.js');
const pubWork=read('public/assets/work-os.js');
const styles=read('assets/styles.css');
const migration=read('supabase/migrations/20260808130000_phase6_7_work_experience_excellence.sql');
const constraint=read('supabase/migrations/20260808131500_phase6_7_automation_due_soon_constraint.sql');
const lockdown=read('supabase/migrations/20260808132500_phase6_7_workflow_template_data_api_lockdown.sql');

assert.equal(pkg.version,'6.9.0');
assert.equal(app,pubApp,'app.js root/public drift');
assert.equal(work,pubWork,'work-os.js root/public drift');
assert.equal(styles,read('public/assets/styles.css'),'styles root/public drift');
assert.equal(styles,read('app/globals.css'),'styles root/app drift');
assert.equal(styles,read('platform-console/assets/styles.css'),'styles root/platform drift');

for(const symbol of ['work_cockpit_snapshot','work_capacity_plan','work_dependency_graph','work_workflow_templates','save_work_workflow_template','instantiate_work_workflow_template'])
  assert.ok(migration.includes(symbol),`6.7 migration missing ${symbol}`);
assert.match(migration,/task\.due_soon/);
assert.match(migration,/risk_level/);
assert.match(migration,/has_blockers/);
assert.match(migration,/notify_watchers/);
assert.match(migration,/notify_reviewer/);
assert.match(migration,/notify_approver/);
assert.match(constraint,/task\.due_soon/,'live/table trigger constraint must include due-soon');
assert.match(lockdown,/revoke all privileges on table public\.work_workflow_templates from anon/i,'workflow templates must not be Data API readable by anon');
assert.match(lockdown,/grant select on table public\.work_workflow_templates to authenticated/i,'workflow templates require explicit authenticated read grant');
assert.match(lockdown,/revoke insert,update,delete,truncate,references,trigger on table public\.work_workflow_templates from authenticated/i,'workflow template writes must stay RPC-only');

for(const marker of ['Work Cockpit','Smart Assignment 2.0','workspaceView','capacityPlannerView','dependencyGraphView','workflowTemplateDialog','workflowInstantiateDialog','saveWorkViewDialog','handleDragStart','handleDrop'])
  assert.ok(work.includes(marker),`Work Experience UI missing ${marker}`);
assert.match(work,/expected_lock_version/,'calendar reschedule must keep optimistic locking');
assert.match(work,/workos-detail-tab/,'Work Item 360 tab contract missing');
assert.match(work,/ASSIGNMENT STRATEGY/,'Smart Assignment strategy UI missing');
assert.match(work,/WHEN/); assert.match(work,/IF/); assert.match(work,/THEN/);
assert.doesNotMatch(work,/name="actions_json"/,'Automation builder must not expose raw actions JSON');
assert.match(work,/save_workspace_saved_view/,'Saved Work Views not wired');
assert.match(app,/handleDragStart/); assert.match(app,/handleDrop/);

for(const cls of ['.workos-cockpit','.workos-capacity-matrix','.workos-dependency-map','.workflow-step-card','.automation-builder','.workos-candidates.smart-v2'])
  assert.ok(styles.includes(cls),`Professional Work UI style missing ${cls}`);

for(const path of ['index.html','platform.html','app/page.js','app/platform/page.js','assets/app.js','assets/api.js','assets/platform.js','platform-console/index.html']) {
  const src=read(path);
  assert.ok(src.includes('6.9.0'),`${path} missing 6.9.0 version/cache key`);
  assert.ok(!src.includes('v=6.6.0'),`${path} still has a 6.6.0 runtime cache key`);
}
console.log('Phase 6.7 Work Experience Excellence static checks passed.');
