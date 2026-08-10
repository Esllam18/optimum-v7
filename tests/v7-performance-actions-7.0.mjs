import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const app = read('src/v7/V7App.js');
const dashboard = read('src/v7/pages/DashboardPage.js');
const projects = read('src/v7/pages/ProjectsPage.js');
const projectCreate = read('src/v7/components/ProjectCreateSheet.js');
const documents = read('src/v7/pages/DocumentsPage.js');
const projectDetail = read('src/v7/pages/ProjectDetailPage.js');
const siteCreate = read('src/v7/components/SiteCreateSheet.js');
const cabinetCreate = read('src/v7/components/CabinetCreateSheet.js');
const upload = read('src/v7/components/UploadDocumentsSheet.js');
const api = read('src/v7/lib/api.js');

assert.ok(app.includes("import dynamic from 'next/dynamic'"), 'V7 routes must use Next dynamic loading');
for (const page of ['DashboardPage','ProjectsPage','ProjectDetailPage','WorkPage','DocumentsPage','EngineeringPage','PeoplePage','DeliveryPage','ControlPage']) {
  assert.ok(app.includes(`const ${page} = lazyPage(`), `${page} must be route-chunked`);
}
assert.ok(app.includes("const SearchCommand = dynamic("), 'Global search should be loaded only when needed');
assert.ok(app.includes('{searchOpen ? <SearchCommand'), 'Search chunk should not render before the command is opened');
assert.ok(!dashboard.includes("api.select('notifications'"), 'Dashboard must not preload notification rows that it does not render');

assert.ok(projects.includes('setCreateOpen(true)'), 'New Project must execute a native V7 action');
assert.ok(projects.includes('<ProjectCreateSheet'), 'Project creation must use a native V7 workspace form');
assert.ok(projectCreate.includes("api.rpc('save_project'"), 'Native project creation must persist through save_project');
assert.ok(projectCreate.includes("api.select('project_blueprints'"), 'Project setup must load workspace blueprints lazily');
assert.ok(projectCreate.includes("api.select('company_memberships'"), 'Project manager options must come from active company members');
assert.ok(projectCreate.includes('workspace.policy?.limits?.max_projects'), 'Project creation must enforce the effective plan project limit in the UI');

assert.ok(projectDetail.includes('<SiteCreateSheet'), 'Project 360 must create sites natively in V7');
assert.ok(siteCreate.includes("api.rpc('save_site'"), 'Native site creation must persist through save_site');
assert.ok(projectDetail.includes('<CabinetCreateSheet'), 'Site 360 must create cabinets natively in V7');
assert.ok(cabinetCreate.includes("api.rpc('save_site_cabinet'"), 'Native cabinet creation must persist through save_site_cabinet');
assert.ok(cabinetCreate.includes('C01–C06'), 'Cabinet creation must explain the canonical evidence workspace it seeds');

assert.ok(documents.includes('<UploadDocumentsSheet'), 'Upload document action must open a real native V7 upload flow');
assert.ok(upload.includes("api.rpc('begin_document_upload'"), 'Upload must reserve metadata/quota before binary transfer');
assert.ok(upload.includes('api.uploadObject('), 'Upload must send the reserved binary to private storage');
assert.ok(upload.includes("api.rpc('finalize_document_upload'"), 'Upload must finalize only after storage succeeds');
assert.ok(upload.includes("api.rpc('abort_document_upload'"), 'Failed upload reservations must be aborted');
assert.ok(upload.includes('api.deleteObject('), 'Failed uploaded binaries must be cleaned up');
assert.ok(api.includes('async uploadObject('), 'V7 API must expose observable storage uploads');
assert.ok(api.includes('async deleteObject('), 'V7 API must support failed-upload cleanup');

// No visible V7 action should be an inert control. This intentionally stays simple and
// catches the regression class that left New Project / Upload Document as display-only buttons.
const srcRoot = path.join(root, 'src/v7');
const files = [];
const walk = dir => {
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) walk(abs);
    else if (name.endsWith('.js')) files.push(abs);
  }
};
walk(srcRoot);
const inert = [];
for (const abs of files) {
  const rel = path.relative(root, abs).split(path.sep).join('/');
  const source = fs.readFileSync(abs, 'utf8');
  for (const tag of ['Button', 'button']) {
    const rx = new RegExp(`<${tag}\\b([^>]*)>`, 'gs');
    for (const match of source.matchAll(rx)) {
      if (rel === 'src/v7/components/Primitives.js' && tag === 'button') continue;
      const attrs = match[1];
      if (!attrs.includes('onClick=') && !attrs.includes('type="submit"') && !attrs.includes("type='submit'")) {
        inert.push(`${rel}: ${match[0].replace(/\\s+/g, ' ').slice(0, 160)}`);
      }
    }
  }
}
assert.deepEqual(inert, [], `V7 contains inert visible controls:\n${inert.join('\n')}`);

console.log('V7 performance + action integrity 7.0 contract: PASS');
