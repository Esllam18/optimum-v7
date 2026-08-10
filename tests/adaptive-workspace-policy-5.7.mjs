import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(p)=>fs.readFileSync(p,'utf8');
const pkg=JSON.parse(read('package.json'));
const app=read('assets/app.js');
const access=read('assets/access-engine.js');
const platform=read('assets/platform.js');
const styles=read('assets/styles.css');
const runtimeMigration=read('supabase/migrations/20260807170000_phase5_7_adaptive_workspace_policy.sql');
const searchMigration=read('supabase/migrations/20260807171000_phase5_7_search_policy_hardening.sql');

assert.equal(pkg.version,'6.9.0');
// The client must map permissions -> entitlements through permissions.entitlement_key.
assert.match(app,/function permissionEntitlementKey\(key\)/);
assert.match(app,/permission\.key===key\)\?\.entitlement_key/);
assert.doesNotMatch(access,/entitlements\.find\(x=>x\.permission_key===key/);
assert.match(access,/state\.permissions\.find\(x=>x\.key===key\)\?\.entitlement_key/);
// Server policy is the source of truth for effective access, limits and current usage.
assert.match(app,/workspace_runtime_policy/);
assert.match(runtimeMigration,/create or replace function public\.workspace_runtime_policy/);
for(const contract of ['permissions','entitlements','max_members','max_projects','max_storage_bytes','active_members','active_projects','storage_bytes']) assert.ok(runtimeMigration.includes(contract),`Missing runtime policy contract: ${contract}`);
// Feature-only file versioning must be enforced by backend and UI.
assert.match(runtimeMigration,/feature\.file_versioning/);
assert.match(app,/entitlementEnabled\('feature\.file_versioning'\)/);
assert.match(app,/versioning\?`<div class="section-head"/);
// Search cannot be called as a hidden backdoor when module.search is disabled.
assert.match(searchMigration,/has_company_permission\(p_company_id,'search\.use'\)/);
assert.match(searchMigration,/Search is not available for this account/);
// UI surfaces and stale DOM actions are permission/feature gated.
assert.match(app,/const pagePolicy =/);
assert.match(app,/const actionPolicy=/);
assert.match(app,/function guardAction\(action\)/);
assert.match(app,/if\(!navAllowed\(targetPage\)\)/);
assert.match(app,/window\.addEventListener\('focus',[^\n]*syncRuntimePolicy\(true\)[^\n]*organizationOS\?\.syncRemote/);
// Plan limits are reflected before creation, while the DB remains final authority.
for(const contract of ["limitReached('members')","limitReached('projects')","limitReached('storage')",'effectiveLimit(key)','policyUsage(key)']) assert.ok(app.includes(contract),`Missing limit contract: ${contract}`);
// Filtering/search must actually remove authored-display cards from layout.
assert.match(styles,/\.team-member-card\[hidden\].*display:none!important/s);
assert.match(styles,/\.role-studio-card\[hidden\]/);
assert.match(styles,/\.project-card\[hidden\]/);
for(const fn of ['applyTeamFilters','applyRoleFilters','applyProjectFilters']) assert.match(app,new RegExp(`function ${fn}\\(`));
assert.match(app,/team-search.*applyTeamFilters/s);
assert.match(app,/role-search.*applyRoleFilters/s);
assert.match(app,/project-search.*applyProjectFilters/s);
// Platform feature management explains impact instead of acting as a decorative toggle.
assert.match(platform,/These settings actively shape the company UI/);
assert.match(platform,/setCompanyEntitlementFromButton/);
assert.match(platform,/Confirm feature disable/);
assert.match(platform,/linkedPermissions=state\.permissions\.filter\(\(p\)=>p\.entitlement_key===ent\.key\)/);
// Runtime copies must remain byte-identical.
assert.equal(read('public/assets/app.js'),app);
assert.equal(read('public/assets/access-engine.js'),access);
assert.equal(read('public/assets/platform.js'),platform);
assert.equal(read('public/assets/styles.css'),styles);
assert.equal(read('platform-console/assets/platform.js'),platform);
assert.equal(read('platform-console/assets/styles.css'),styles);
assert.equal(read('app/globals.css'),styles);
// No stale cache key in runtime entrypoints.
for(const path of ['index.html','platform.html','app/page.js','app/platform/page.js','platform-console/index.html']){
  const src=read(path);assert.ok(src.includes('6.9.0'),`${path} must reference 6.9.0`);assert.ok(!src.includes('v=5.5.4'),`${path} still references 5.5.4`);
}
console.log('Phase 5.7 adaptive workspace policy checks passed.');
