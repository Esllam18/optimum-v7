import fs from 'node:fs';
import assert from 'node:assert/strict';

const engineering = fs.readFileSync('assets/engineering.js','utf8');
const app = fs.readFileSync('assets/app.js','utf8');
const v7Api = fs.readFileSync('src/v7/lib/api.js','utf8');
const v7Files = fs.readFileSync('src/v7/pages/DocumentsPage.js','utf8');
const v7Projects = fs.readFileSync('src/v7/pages/ProjectsPage.js','utf8');
const v7Work = fs.readFileSync('src/v7/pages/WorkPage.js','utf8');

assert.match(engineering,/engineering_revisions'.*select:'id,company_id,drawing_id,revision_number,revision_code,status,change_note,lock_version/);
assert.doesNotMatch(engineering,/engineering_revisions'.*limit:5000/);
assert.doesNotMatch(engineering,/\['boq',api\.select\('engineering_revision_boq'/);
assert.match(engineering,/ensureRevisionPayload/);
assert.match(engineering,/revisionPayloads:new Map\(\)/);
assert.match(engineering,/select:'id,drawing_id,snapshot,sheet_settings,boq_snapshot,lock_version/);

assert.match(v7Api,/this\.inflight=new Map|this\.inflight = new Map/);
assert.match(v7Api,/cacheTtlMs/);
assert.match(v7Api,/ensureFreshSession/);
assert.match(v7Files,/p_document_limit: 80/);
assert.doesNotMatch(v7Files,/document_picker_query/);
assert.match(v7Projects,/PAGE_SIZE = 36/);
assert.match(v7Projects,/offset: page \* PAGE_SIZE/);
assert.match(v7Work,/search: searchTerm/);

// The legacy application still contains runtime revision polling, but V7 must not
// reproduce it as page-level polling loops. Runtime invalidation will be centralized.
assert.doesNotMatch(v7Api,/setInterval\(/);
assert.doesNotMatch(v7Files,/setInterval\(/);
assert.doesNotMatch(v7Projects,/setInterval\(/);
assert.doesNotMatch(v7Work,/setInterval\(/);
assert.match(app,/loadCompanyData/); // baseline still exists and is intentionally bypassed by /v7.

console.log('V7 performance baseline contract: PASS');
