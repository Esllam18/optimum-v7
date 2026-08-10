import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const editor = read('src/v7/components/WorkItemEditor.js');
const work = read('src/v7/pages/WorkPage.js');
const calendar = read('src/v7/pages/CalendarPage.js');
const docs = read('src/v7/pages/DocumentsPage.js');
const css = read('src/v7/v7.css');

assert.ok(work.includes("import WorkItemEditor") && work.includes('<WorkItemEditor'), 'Work 360 must expose the full work editor');
assert.ok(editor.includes("'save_work_item'"), 'Full work editor must persist through save_work_item');
assert.ok(editor.includes("'work_assignment_candidates'"), 'Full work editor must use server-side smart assignment scoring');
assert.ok(editor.includes('expected_lock_version'), 'Full work editor must preserve optimistic concurrency protection');
for (const field of ['task_type','priority','start_at','due_at','sla_due_at','estimated_minutes','actual_minutes','required_skills','labels','visibility','open_unassigned','owner_user_id','reviewer_user_id','approver_user_id']) {
  assert.ok(editor.includes(field), `Full work editor must expose ${field}`);
}
assert.ok(editor.includes('الإسناد الذكي') && editor.includes('حفظ كل التعديلات'), 'Full work editor must ship Arabic labels');
assert.ok(calendar.includes('CalendarScheduleSheet'), 'Calendar must expose event scheduling sheet');
assert.ok(calendar.includes("'work_task_detail'") && calendar.includes("'save_work_item'"), 'Calendar rescheduling must read lock version and save through work engine');
assert.ok(calendar.includes('حفظ الجدولة') && calendar.includes('فتح Work 360'), 'Calendar scheduling must ship Arabic interaction labels');
assert.ok(docs.includes('recent_activity') && docs.includes('نشاط المستند'), 'Document 360 must expose its audit/activity feed');
assert.ok(docs.includes('المشروع 360') && docs.includes('فتح المجلد') && docs.includes('الموقع 360'), 'Document 360 must expose CDE navigation back to project/site/folder context');
assert.equal((docs.match(/<UploadDocumentsSheet\b/g) || []).length, 1, 'Documents page must render a single upload sheet');
assert.ok(css.includes('.v7-candidate-grid') && css.includes('.v7-calendar-agenda-link'), 'Parity 16 responsive interaction styles are required');
console.log('V7 feature parity tranche 16: GO');
