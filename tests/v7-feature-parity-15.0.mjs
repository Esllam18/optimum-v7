import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const work = read('src/v7/components/WorkTaskActions.js');
const attachment = read('src/v7/components/TaskAttachmentSheet.js');
const docs = read('src/v7/pages/DocumentsPage.js');
const folders = read('src/v7/components/FolderControlSheet.js');
const storage = read('src/v7/components/StorageIntelligenceSheet.js');
const workPage = read('src/v7/pages/WorkPage.js');
const css = read('src/v7/v7.css');

for (const rpc of ['set_task_status','claim_task','add_task_comment','toggle_task_checklist_item','add_task_checklist_item','save_task_dependency','delete_task_dependency']) {
  assert.ok(work.includes(`'${rpc}'`), `Work 360 must call ${rpc}`);
}
for (const rpc of ['begin_task_attachment_upload','finalize_task_attachment_upload','abort_task_attachment_upload']) {
  assert.ok(attachment.includes(`'${rpc}'`), `Task attachment flow must call ${rpc}`);
}
for (const rpc of ['create_folder','rename_folder','move_folder','trash_folder']) {
  assert.ok(folders.includes(`'${rpc}'`), `CDE folder control must call ${rpc}`);
}
assert.ok(storage.includes("'company_storage_intelligence'"), 'Storage intelligence must use company_storage_intelligence');
for (const permission of ['files.create_folder','files.rename','files.move','files.archive']) {
  assert.ok(docs.includes(`'${permission}'`), `Documents page must honor ${permission}`);
}
assert.ok(workPage.includes('<WorkTaskActions'), 'Work detail must expose live task actions');
assert.ok(docs.includes('<FolderControlSheet') && docs.includes('<StorageIntelligenceSheet'), 'Documents must expose folder control and storage intelligence');
assert.ok(work.includes('سبب الحجب') && work.includes('قائمة التحقق') && work.includes('المحادثة'), 'Work execution controls must ship Arabic labels');
assert.ok(folders.includes('إعادة تسمية المجلد') && storage.includes('ذكاء التخزين'), 'CDE parity surfaces must ship Arabic labels');
assert.ok(css.includes('.v7-checklist-live') && css.includes('.v7-panel-actions'), 'Parity 15 responsive styles are required');
console.log('V7 feature parity tranche 15: GO');
