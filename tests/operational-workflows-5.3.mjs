import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
const app=read('../assets/app.js');
const access=read('../assets/access-engine.js');
const platform=read('../assets/platform.js');
const css=read('../assets/styles.css');
const edge=read('../supabase/functions/identity-provisioning/index.ts');
const migration=read('../supabase/migrations/20260806114000_phase5_3_workflow_reliability.sql');
const pkg=JSON.parse(read('../package.json'));

assert.equal(pkg.version,'6.9.0');
assert.ok(existsSync(new URL('../docs/PHASE_5_3_OPERATIONAL_WORKFLOWS.md',import.meta.url)));
assert.ok(existsSync(new URL('../docs/QA_CHECKLIST_PHASE_5_3.md',import.meta.url)));

for(const fn of ['save_company_role_definition','platform_save_role_template_definition','save_company_workspace_settings','company_activity_feed']) assert.match(migration,new RegExp(`function public\\.${fn}`));
assert.match(migration,/grant execute on function app_private\.can_view_engineering_drawing\(uuid\) to authenticated/);
assert.match(migration,/Select at least one permission/);
assert.match(migration,/permission_count/);

assert.match(edge,/create_company:\s*"company"/);
assert.match(edge,/create_member:\s*"member"/);
assert.match(edge,/reset_temporary_password:\s*"reset"/);
assert.match(edge,/onboarding_status:"pending_owner"/);
assert.match(edge,/service_validate_member_provisioning/);
assert.match(edge,/create_company_invitation/);
assert.match(edge,/service_accept_invitation_for_user/);
assert.doesNotMatch(edge,/account_provisioned/);

assert.match(app,/action:'create_member'/);
assert.match(app,/save_company_role_definition/);
assert.match(access,/save_workspace_settings_draft/);
assert.match(app,/company_activity_feed/);
assert.match(app,/member-role-picker/);
assert.match(app,/provision-side-card premium-side-card/);
assert.match(app,/settings-(?:center|command-center)/);
assert.match(app,/Select at least one permission|اختر صلاحية واحدة/);
assert.ok(app.includes("form.querySelectorAll('button')"));
assert.doesNotMatch(app,/querySelectorAll\('button,input,select,textarea'\)/);

assert.match(platform,/action:'create_company'/);
assert.match(platform,/platform_save_role_template_definition/);
assert.match(platform,/audit-export/);
assert.match(platform,/filteredPlatformAudit/);
assert.match(platform,/pending_owner/);
assert.match(platform,/semiannual/);
assert.match(platform,/annual/);
assert.match(platform,/waived/);
assert.doesNotMatch(platform,/account_provisioned|\['ready','onboarding','completed'\]|value="yearly"/);
assert.ok(platform.includes("form?.querySelectorAll('button')"));
assert.doesNotMatch(platform,/querySelectorAll\('button,input,select,textarea'\)/);

for(const contract of ['Phase 5.3','activity-timeline-item','activity-detail-grid','member-role-picker','premium-side-card','settings-center']) assert.ok(css.includes(contract),`missing CSS contract ${contract}`);
assert.equal(app,read('../public/assets/app.js'));
assert.equal(platform,read('../public/assets/platform.js'));
assert.equal(platform,read('../platform-console/assets/platform.js'));
assert.equal(css,read('../public/assets/styles.css'));
assert.equal(css,read('../platform-console/assets/styles.css'));
assert.equal(css,read('../app/globals.css'));
assert.doesNotMatch(`${app}\n${platform}`,/SUPABASE_SERVICE_ROLE_KEY|service_role/i);

console.log('✓ Phase 5.3 operational workflows, atomic role saves, settings propagation, and audit center passed');
