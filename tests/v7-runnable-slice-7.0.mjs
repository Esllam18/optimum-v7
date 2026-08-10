import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const api = read('src/v7/lib/api.js');
const work = read('src/v7/pages/WorkPage.js');
const engineering = read('src/v7/pages/EngineeringPage.js');
const people = read('src/v7/pages/PeoplePage.js');
const delivery = read('src/v7/pages/DeliveryPage.js');
const css = read('src/v7/v7.css');

assert.ok(api.includes("localStorage.removeItem(V7_CONFIG.legacySessionStorageKey)"), 'V7 session migration/sign-out must remove stale legacy session state');
assert.ok(api.includes('const parse = (key)'), 'Malformed scoped session data must not prevent legacy-session recovery');

assert.ok(work.includes("api.rpc('create_task'"), 'Work quick create must execute the real create_task RPC');
assert.ok(work.includes('p_assignee_user_ids: [workspace.user.id]'), 'Quick-created work should remain visible in My Work by default');
assert.ok(work.includes('p_offset: page * PAGE_SIZE'), 'Work list must paginate server-side');
assert.ok(work.includes('setPage(value => value + 1)'), 'Work list must expose next-page navigation');
assert.ok(work.includes('data?.capabilities'), 'Work 360 must surface server capabilities rather than assuming editability');
assert.ok(work.includes('normalizeArray(data.events)'), 'Work 360 must surface task activity history');

assert.ok(engineering.includes('useSearchParams'), 'Engineering must honor drawing deep links');
assert.ok(engineering.includes("params.get('drawing')"), 'Engineering deep-link contract must use drawing query identity');
assert.ok(engineering.includes("api.select('engineering_revisions'"), 'Engineering 360 must load revision history on demand');
assert.ok(engineering.includes("api.select('engineering_review_marks'"), 'Engineering 360 must load review marks on demand');
assert.ok(engineering.includes("api.select('engineering_revision_boq'"), 'Engineering 360 must load current revision BOQ on demand');
assert.ok(engineering.includes("api.select('engineering_document_links'"), 'Engineering 360 must retain CDE linkage');
assert.ok(engineering.includes('<DrawingDetail'), 'Engineering route must render a focused drawing detail sheet');

assert.ok(people.includes("params.get('member')"), 'People must support member deep links');
assert.ok(people.includes("api.rpc('member_access_snapshot'"), 'Member 360 must use the effective access snapshot contract');
assert.ok(people.includes('effective_permissions'), 'Member 360 must expose effective permissions');
assert.ok(people.includes('scope_rules'), 'Member 360 must expose access scope rules');

assert.ok(delivery.includes("params.get('package')"), 'Delivery must support package deep links');
assert.ok(delivery.includes("api.rpc('site_claim_package_360'"), 'Delivery 360 must use the canonical site claim package snapshot');
assert.ok(delivery.includes('progress.overall_percent'), 'Delivery 360 must show server-computed readiness');
assert.ok(delivery.includes('requirement.items'), 'Delivery 360 must expose evidence items without copying documents');

for (const cls of ['.v7-form-stack', '.v7-pager', '.v7-mini-table', '.v7-requirements', '.v7-permission-cloud']) {
  assert.ok(css.includes(cls), `V7 CSS must include ${cls}`);
}

console.log('V7 runnable slice 7.0 contract: PASS');
