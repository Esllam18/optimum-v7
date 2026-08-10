import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(p)=>fs.readFileSync(p,'utf8');
const pkg=JSON.parse(read('package.json'));
const app=read('assets/app.js');
const access=read('assets/access-engine.js');
const platform=read('assets/platform.js');
const styles=read('assets/styles.css');
const migration=read('supabase/migrations/20260807133000_phase5_5_3_organization_stability.sql');
const hardening=read('supabase/migrations/20260807134500_phase5_5_3_role_scope_approval_hardening.sql');
assert.equal(pkg.version,'6.9.0');
// Member control must be one DB transaction, not a browser-side chain.
assert.match(app,/save_member_control_profile/);
assert.doesNotMatch(app,/api\.rpc\('set_member_role'/);
assert.doesNotMatch(app,/api\.rpc\('set_member_status'/);
assert.doesNotMatch(app,/api\.rpc\('save_member_hr_profile'/);
assert.match(migration,/create or replace function public\.save_member_control_profile/);
// Access 360 must use the real DB subject fields and actually submit role_id.
assert.match(access,/subject_type==='membership'&&x\.subject_id===id/);
assert.match(access,/subject_type==='role'&&x\.subject_id===role\?\.id/);
assert.doesNotMatch(access,/principal_type|principal_id/);
assert.match(access,/p_member:\{role_id:data\.role_id/);
// Partial backend loads are visible and mutation-sensitive.
assert.match(access,/accessLoadWarnings/);
assert.match(access,/stability-banner warning/);
assert.match(platform,/dataWarnings/);
assert.match(platform,/platform-data-warning/);
assert.doesNotMatch(platform,/account_security[^\n]*\.catch\(\(\)=>\[\]\)/);
// Resource scope UI and server validation stay aligned.
assert.match(access,/access-scope-studio/);
assert.match(access,/handleChange\(ev\)/);
assert.match(hardening,/Role scope target is required/);
assert.match(hardening,/must belong to the same company/);
// Templates follow Draft -> Impact -> Publish.
assert.match(access,/action==='clone-role-template'/);
assert.match(access,/openRoleDraft\(null,state\.roleTemplates\.find/);
// Second-approval UX must not claim an immediate publish/offboarding.
assert.match(access,/result\?\.status==='pending_approval'/);
assert.match(access,/Role sent for approval/);
assert.match(access,/Plan awaiting second approval/);
// Direct departure is blocked in ordinary member editing.
assert.match(app,/Final departure uses the Offboarding plan/);
assert.match(migration,/Use the offboarding workflow before marking a member as left/);
// Time inputs show local wall time, not UTC masquerading as local time.
assert.match(app,/function toDateTimeLocal/);
assert.match(app,/toDateTimeLocal\(m\.access_starts_at\)/);
// Workspace save is one clear action but retains version/rollback machinery.
assert.match(access,/save_workspace_settings_draft/);
assert.match(access,/publish_workspace_settings_draft/);
assert.match(access,/saved and published/);
// Backend delegation/tenant hardening.
assert.match(migration,/You cannot change an override for a permission that you do not hold/);
assert.match(migration,/Parent unit must belong to the same company/);
assert.match(migration,/Manager must be an active member of the same company/);
assert.match(migration,/Organization hierarchy cannot contain a cycle/);
// Premium UI rules are not orphaned selectors anymore.
assert.match(styles,/\.access-scope-studio/);
assert.match(styles,/\.stability-banner/);
assert.match(styles,/:focus-visible/);
// Runtime copies must be byte-identical.
assert.equal(read('public/assets/app.js'),app);
assert.equal(read('public/assets/access-engine.js'),access);
assert.equal(read('public/assets/platform.js'),platform);
assert.equal(read('public/assets/styles.css'),styles);
console.log('Phase 5.5.3 organization stability & UX regression checks passed.');

assert.ok(access.includes('affected_members') && access.includes('gained_permissions') && access.includes('lost_permissions'),'role impact UI must consume the live Phase 5.5 RPC field names');

assert.ok(access.includes('high_risk_permissions') && access.includes('governance-risk-summary'),'governance save must preserve and explain the high-risk permission set');
