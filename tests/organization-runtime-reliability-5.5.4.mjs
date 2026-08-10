import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(p)=>fs.readFileSync(p,'utf8');
const pkg=JSON.parse(read('package.json'));
const app=read('assets/app.js');
const publicApp=read('public/assets/app.js');
const styles=read('assets/styles.css');
const publicStyles=read('public/assets/styles.css');
const provisioning=read('supabase/functions/identity-provisioning/index.ts');
const provisioning55=read('supabase/functions/identity-provisioning-v55/index.ts');
const legacyGuard=read('supabase/migrations/20260806164500_phase5_4_identity_delegation_guard.sql');
const hotfix=read('supabase/migrations/20260807123000_phase5_5_4_member_provisioning_runtime_fix.sql');

assert.equal(pkg.version,'6.9.0');
// Runtime provisioning must never call the nonexistent PostgreSQL helper again.
for(const src of [legacyGuard,hotfix]){
  assert.doesNotMatch(src,/jsonb_object_length\s*\(/i);
  assert.match(src,/count\(\*\)::integer from jsonb_each/i);
}
// PostgREST errors are plain objects; do not collapse them to the generic "Provisioning failed" string.
assert.match(provisioning,/function errorText\(/);
assert.match(provisioning,/errorText\(error,"Provisioning failed"\)/);
assert.match(provisioning55,/function errorText\(/);
// Same-password must be normalized server-side and localized client-side.
assert.match(provisioning,/same_password/);
assert.match(provisioning55,/same_password/);
assert.match(app,/same_password\|New password should be different/);
assert.match(app,/كلمة المرور الجديدة مطابقة/);
assert.match(app,/استخدم كلمة مرور جديدة مختلفة عن كلمة المرور المؤقتة أو الحالية/);
// Role members must open a dedicated in-context dialog; Team navigation is secondary only.
assert.match(app,/function openRoleMembersDialog\(/);
assert.match(app,/role-members-dialog/);
assert.match(app,/action==='open-role-members'\|\|action==='show-role-members'\)\{openRoleMembersDialog/);
assert.match(app,/action==='open-role-members-team'/);
assert.doesNotMatch(app,/action==='open-role-members'\|\|action==='show-role-members'\)\{state\.teamRoleFilter/);
assert.match(app,/invite-member-for-role/);
assert.match(app,/openInviteDialog\(roleId\)/);
assert.match(app,/preselectRoleId===r\.id\?'checked':''/);
// Runtime copies stay identical.
assert.equal(publicApp,app);
assert.equal(publicStyles,styles);
assert.match(styles,/\.role-member-row/);
assert.match(styles,/\.password-helper/);
console.log('Phase 6.9.0 organization runtime reliability & UX regression checks passed.');


const nextPage = read('app/page.js');
const nextPlatformPage = read('app/platform/page.js');
assert.ok(nextPage.includes('app.js?v=6.9.0'), 'Next.js app page must bust app.js cache with 6.9.0');
assert.ok(nextPlatformPage.includes('platform.js?v=6.9.0'), 'Next.js platform page must bust platform.js cache with 6.9.0');
assert.ok(!nextPage.includes('v=5.5.3') && !nextPlatformPage.includes('v=5.5.3'), 'Next.js runtime pages must not reference the 5.5.3 cache key');

