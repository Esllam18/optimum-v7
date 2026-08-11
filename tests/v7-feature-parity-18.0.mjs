import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const people = read('src/v7/pages/PeoplePage.js');
const control = read('src/v7/components/MemberControlSheet.js');
const org = read('src/v7/pages/OrganizationPage.js');
const delivery = read('src/v7/pages/DeliveryPage.js');
const css = read('src/v7/v7.css');
const visual = read('tests/v7-responsive-browser.py');
const visualFixture = read('tests/visual/v7-parity-18-fixture.html');
const pkg = JSON.parse(read('package.json'));

for (const needle of [
  "member_access_snapshot",
  "member_security_snapshot",
  "save_member_control_profile",
  "save_member_work_preferences",
  "member_compensation",
  "organization_units",
  "default_project_ids"
]) assert.ok(control.includes(needle), `Member Control 360 missing ${needle}`);

for (const needle of [
  '<MemberControlSheet',
  "bulk_set_member_role",
  "bulk_set_member_status",
  "bulk_restore_member_access",
  'selectedRows',
  'Select visible',
  'إدارة ملف العضو'
]) assert.ok(people.includes(needle), `People parity missing ${needle}`);

for (const needle of [
  'Workspace setup journey',
  'رحلة تجهيز مساحة العمل',
  'Organization Health Center',
  'organization_runtime_revision',
  'setInterval',
  'editUnit',
  "save_organization_unit",
  "save_company_work_settings"
]) assert.ok(org.includes(needle), `Organization OS parity missing ${needle}`);

for (const needle of [
  "site_claim_suggestions",
  "auto_collect_site_claim",
  "add_document_to_site_claim",
  "remove_site_claim_item",
  'Smart collection suggestions',
  'مقترحات التجميع الذكي'
]) assert.ok(delivery.includes(needle), `Delivery collection parity missing ${needle}`);

for (const cls of [
  '.v7-member-control', '.v7-bulk-bar', '.v7-person-row', '.v7-setup-journey', '.v7-health-list', '.v7-claim-suggestions'
]) assert.ok(css.includes(cls), `Tranche 18 premium style missing ${cls}`);

for (const needle of ['parity18-desktop-light-rtl', 'parity18-mobile-dark-ltr']) assert.ok(visual.includes(needle), `Tranche 18 visual matrix missing ${needle}`);
for (const cls of ['v7-bulk-bar','v7-org-overview','v7-member-control','v7-claim-suggestions']) assert.ok(visualFixture.includes(cls), `Tranche 18 visual fixture missing ${cls}`);

assert.ok(pkg.scripts['test:v7'].includes('v7-feature-parity-18.0.mjs'), 'Tranche 18 gate must run in test:v7');
console.log('V7 feature parity tranche 18: GO');
