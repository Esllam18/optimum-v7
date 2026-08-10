import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
const app=read('../assets/app.js');
const access=read('../assets/access-engine.js');
const platform=read('../assets/platform.js');
const css=read('../assets/styles.css');
const icons=read('../assets/icons.js');
const api=read('../assets/api.js');
const migration=read('../supabase/migrations/20260806090000_phase5_2_roles_branding_compensation.sql');
const directory=read('../supabase/migrations/20260806091000_phase5_2_platform_identity_directory.sql');
const hardening=read('../supabase/migrations/20260806092000_phase5_2_identity_hr_hardening.sql');
const policyHardening=read('../supabase/migrations/20260806093000_phase5_2_policy_performance_hardening.sql');
const platformServer=read('../platform-console/server.mjs');
const pkg=JSON.parse(read('../package.json'));

assert.equal(pkg.version,'6.9.0');
assert.ok(existsSync(new URL('../docs/PHASE_5_2_ORGANIZATION_IDENTITY_ROLES.md',import.meta.url)));
assert.ok(existsSync(new URL('../docs/QA_CHECKLIST_PHASE_5_2.md',import.meta.url)));

for(const table of ['company_branding','member_compensation','role_templates','role_template_permissions']) assert.match(migration,new RegExp(`create table if not exists public\\.${table}`));
for(const permission of ['branding.view','branding.manage','compensation.view','compensation.manage','roles.create','roles.delete','roles.templates.use']) assert.ok(migration.includes(permission));
for(const fn of ['save_company_branding','save_member_hr_profile','create_company_role','update_company_role','delete_company_role','platform_save_role_template','platform_delete_role_template']) assert.match(migration,new RegExp(`function public\\.${fn}`));
assert.match(migration,/identity-assets/);
assert.match(migration,/enable row level security/);
assert.match(directory,/branding_logo_path/);
assert.match(directory,/salary_amount/);
assert.match(directory,/drop function if exists public\.platform_company_directory/);
assert.match(hardening,/validate_member_compensation_scope/);
assert.match(hardening,/profiles_select_managed_company_members/);
assert.match(policyHardening,/role_template_permissions_permission_key_idx/);
assert.match(policyHardening,/profiles_select_self_colleague_or_managed/);
assert.match(policyHardening,/company_branding_insert/);
assert.match(policyHardening,/compensation_insert/);
assert.match(platformServer,/Content-Security-Policy/);
assert.match(platformServer,/X-Frame-Options/);

assert.match(app,/company-branding/);
assert.match(app,/salary_amount/);
assert.match(app,/avatar_file/);
assert.match(app,/role-template-grid/);
assert.match(app,/(?:create_company_role|save_company_role_definition)/);
assert.match(app,/(?:update_company_role|save_company_role_definition)/);
assert.match(app,/delete_company_role/);
assert.match(app,/save_member_control_profile/);
assert.match(access,/save_workspace_settings_draft/);
assert.match(app,/roles\.templates\.use/);
assert.match(app,/branding\.manage/);
assert.match(app,/compensation\.manage/);
assert.match(app,/Organization OS/);

assert.match(platform,/role-templates/);
assert.match(platform,/(?:platform_save_role_template|platform_save_role_template_definition)/);
assert.match(platform,/platform_delete_role_template/);
assert.match(platform,/branding_logo_path/);
assert.match(platform,/platform-branding/);
assert.match(platform,/salary_amount/);
assert.match(platform,/identity-assets/);

for(const name of ['camera','palette','creditCard']) assert.match(icons,new RegExp(`${name}:`));
for(const contract of ['Phase 5.2','.role-template-grid','.branding-preview','.member-profile-hero','.company-table-logo','.permission-groups-smart']) assert.ok(css.includes(contract));
assert.doesNotMatch(`${app}\n${platform}\n${api}`,/SUPABASE_SERVICE_ROLE_KEY|service_role/i,'browser bundles must not contain service-role secrets');
assert.equal(app,read('../public/assets/app.js'));
assert.equal(platform,read('../public/assets/platform.js'));
assert.equal(css,read('../public/assets/styles.css'));
assert.equal(platform,read('../platform-console/assets/platform.js'));
assert.equal(css,read('../platform-console/assets/styles.css'));

console.log('✓ Phase 5.2 organization identity, people compensation, role studio, and company branding passed');
