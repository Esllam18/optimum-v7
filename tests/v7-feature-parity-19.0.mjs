import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const member = read('src/v7/components/MemberControlSheet.js');
const offboarding = read('src/v7/components/MemberOffboardingPanel.js');
const control = read('src/v7/pages/ControlPage.js');
const settings = read('src/v7/pages/SettingsPage.js');
const css = read('src/v7/v7.css');
const visual = read('tests/v7-responsive-browser.py');
const fixture = read('tests/visual/v7-parity-19-fixture.html');
const pkg = JSON.parse(read('package.json'));

for (const needle of [
  'MemberOffboardingPanel', 'member_compensation', 'compensation.manage', 'salary_amount', 'housing_allowance',
  'save_member_control_profile', "lifecycle_stage === 'offboarding'"
]) assert.ok(member.includes(needle), `Member governance/compensation parity missing ${needle}`);

for (const needle of [
  'prepare_member_offboarding', 'execute_member_offboarding', 'offboarding_plans', 'transfer_to_membership_id',
  'p_options:{ tasks:Boolean(options.tasks), custody:Boolean(options.custody) }', 'pending_approval', 'Plan awaiting second approval'
]) assert.ok(offboarding.includes(needle), `Offboarding workflow parity missing ${needle}`);

for (const needle of [
  'access_governance_settings', 'access_change_requests', 'review_access_change_request', 'save_access_governance_settings',
  'require_second_approval_high_risk', 'require_second_approval_offboarding', 'high_risk_permissions',
  'execute_member_offboarding', 'Pending approval requests', 'طلبات الموافقة المعلقة'
]) assert.ok(control.includes(needle), `Control governance parity missing ${needle}`);

for (const needle of [
  "['security','lock'", "['connections','link'", 'account_security', "fetch('/api/health'", 'primary_contact_name',
  'billing_contact_name', 'technical_contact_name', 'internal_notes', 'onboarding_status', 'Platform connections', 'اتصالات المنصة'
]) assert.ok(settings.includes(needle), `Settings/security parity missing ${needle}`);

for (const cls of [
  '.v7-offboarding-panel', '.v7-governance-policy', '.v7-governance-toggles', '.v7-risk-permission-groups',
  '.v7-approval-list', '.v7-offboarding-queue', '.v7-contact-settings', '.v7-security-settings-grid', '.v7-connection-grid'
]) assert.ok(css.includes(cls), `Tranche 19 premium style missing ${cls}`);

for (const needle of ['parity19-desktop-light-rtl','parity19-mobile-dark-ltr']) assert.ok(visual.includes(needle), `Tranche 19 visual matrix missing ${needle}`);
for (const cls of ['v7-governance-policy','v7-approval-list','v7-offboarding-panel','v7-security-settings-grid','v7-connection-grid']) assert.ok(fixture.includes(cls), `Tranche 19 visual fixture missing ${cls}`);

assert.ok(!settings.includes('SERVICE_ROLE'), 'Settings must never expose service-role material');
assert.ok(!settings.includes('service_role'), 'Settings must never expose service-role material');
assert.ok(pkg.scripts['test:v7'].includes('v7-feature-parity-19.0.mjs'), 'Tranche 19 gate must run in test:v7');
console.log('V7 feature parity tranche 19: GO');
