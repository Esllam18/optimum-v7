import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const pkg=JSON.parse(read('package.json'));
const app=read('assets/app.js');
const styles=read('assets/styles.css');
const domain=read('supabase/migrations/20260809190000_phase6_9_site_delivery_domain.sql');
const cabinets=read('supabase/migrations/20260809190500_phase6_9_site_cabinet_commands.sql');
const claims=read('supabase/migrations/20260809190700_phase6_9_site_claim_commands.sql');
const models=read('supabase/migrations/20260809191000_phase6_9_site_delivery_read_models.sql');
const rls=read('supabase/migrations/20260809191200_phase6_9_site_delivery_rls_wrapper_fix.sql');
const auto=read('supabase/migrations/20260809191600_phase6_9_site_claim_auto_collect.sql');

assert.equal(pkg.version,'6.9.0');
for(const m of ['site_cabinets','site_claim_packages','site_claim_requirements','site_claim_items','selected_version_id','root_folder_id']) assert.ok(domain.includes(m),`domain missing ${m}`);
for(const m of ['C01','Drawings & As-Built','C02','Quantity Survey','C03','Sketches','C04','Handover & Inspection','C05','Photos','C06','Supporting Documents']) assert.ok(domain.includes(m)||cabinets.includes(m),`cabinet workspace missing ${m}`);
for(const m of ['work_order','contract','quantity_survey','sketches','handover_certificate','as_built_drawings','approvals','photos','supporting']) assert.ok(domain.includes(m),`default claim requirement missing ${m}`);
for(const m of ['save_site_cabinet','archive_site_cabinet','reactivate_site_cabinet','cabinet_360','can_manage','can_archive']) assert.ok(cabinets.includes(m),`cabinet command missing ${m}`);
for(const m of ['site_claim_package_360','add_document_to_site_claim','freeze_site_claim_package','selected_version_id=d.current_version_id','submit_site_claim_package']) assert.ok(claims.includes(m),`claim command missing ${m}`);
assert.ok(claims.includes('document_id uuid not null')||domain.includes('document_id uuid not null'),'claim package must reference canonical documents');
assert.ok(!claims.includes('storage_path'),'claim inclusion must not copy storage objects');
assert.match(rls,/resource_permission_for_row/);
assert.doesNotMatch(rls,/user_has_resource_permission\(/,'RLS policies must use the approved wrapper rather than revoked private helper');
for(const m of ['03 — Cabinets','01 — Work Orders & Contracts','04 — Quantity Survey & BOQ','07 — Handover & Certificates','site_cabinet','site_claim_package','can_create_cabinet','can_manage_claim','can_edit_site','can_archive_site']) assert.ok(models.includes(m),`read model/blueprint missing ${m}`);
for(const m of ['infer_site_claim_requirement','site_claim_suggestions','auto_collect_site_claim','inclusion_mode','auto']) assert.ok(auto.includes(m),`auto-collect missing ${m}`);

for(const m of ['SITE DELIVERY 360','CABINET 360','SITE DELIVERY PACKAGE','openCabinetDetails','openClaimPackageDetails','openAddDocumentToClaimDialog','add_document_to_site_claim','freeze_site_claim_package','auto_collect_site_claim','claim_requirement','claim-file-action','inferredClaimRequirementForFolder']) assert.ok(app.includes(m),`client missing ${m}`);
assert.match(app,/Site Delivery & Claim Intelligence · 6\.9\.0/);
assert.equal(app,read('public/assets/app.js'),'app root/public drift');
assert.equal(styles,read('public/assets/styles.css'),'styles root/public drift');
assert.equal(styles,read('app/globals.css'),'styles root/app drift');
assert.equal(styles,read('platform-console/assets/styles.css'),'styles root/platform drift');
for(const cls of ['.site-delivery-hero','.cabinet-grid','.cabinet360-hero','.cabinet-folder-grid','.claim360-hero','.claim-progress-ring','.claim-requirement-list','.document-cabinet-context','.claim-file-action']) assert.ok(styles.includes(cls),`UI style missing ${cls}`);
for(const path of ['index.html','platform.html','app/page.js','app/platform/page.js','assets/app.js','assets/api.js','assets/platform.js','platform-console/index.html']){
  const src=read(path);assert.ok(src.includes('6.9.0'),`${path} missing 6.9.0 marker`);assert.ok(!src.includes('v=6.8.0'),`${path} contains stale 6.8 cache marker`);
}
console.log('Phase 6.9 Site Delivery & Claim Intelligence static checks passed.');
