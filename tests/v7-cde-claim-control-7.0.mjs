import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const docs = read('src/v7/pages/DocumentsPage.js');
const control = read('src/v7/components/DocumentControlSheet.js');
const claims = read('src/v7/components/ClaimEvidenceSheet.js');
const trash = read('src/v7/components/CdeTrashSheet.js');
const delivery = read('src/v7/pages/DeliveryPage.js');
const icons = read('src/v7/components/Icon.js');

for (const rpc of ['rename_document','move_document','set_document_control_status','trash_document']) {
  assert.ok(control.includes(`'${rpc}'`), `Document control must call ${rpc}`);
}
assert.ok(trash.includes("'trash_query'"), 'CDE trash must use the scoped trash read model');
assert.ok(trash.includes("'restore_document'"), 'CDE trash must restore the canonical document');
assert.ok(trash.includes('canRestore'), 'Restore action must remain permission-aware in the V7 UI');
assert.ok(claims.includes("'add_document_to_site_claim'"), 'Document 360 must add canonical documents to claim evidence');
assert.ok(claims.includes("p_inclusion_mode: 'manual'"), 'Manual evidence inclusion mode must be explicit');
assert.ok(docs.includes("'remove_site_claim_item'"), 'Document 360 must remove unlocked claim evidence by item id');
assert.ok(docs.includes("!link.selected_version_id"), 'Pinned/frozen evidence must not expose a remove action');
for (const rpc of ['freeze_site_claim_package','reopen_site_claim_package','submit_site_claim_package']) {
  assert.ok(delivery.includes(`'${rpc}'`), `Delivery 360 must call ${rpc}`);
}
assert.ok(delivery.includes("pkg.status === 'ready'"), 'Submit/reopen controls must be constrained to the ready state');
assert.ok(control.includes("statusOptions = ['working', 'in_review', 'approved', 'rejected', 'superseded']"), 'Document control status list must match backend contract');
for (const icon of ['upload','download','edit','move','trash','archive']) {
  assert.ok(icons.includes(`${icon}:`), `Premium V7 action icon ${icon} must have a real SVG glyph`);
}
console.log('V7 CDE + claim control 7.0 contract: PASS');
