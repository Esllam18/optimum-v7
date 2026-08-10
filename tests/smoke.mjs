import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeEngineeringSnapshot,
  calculateEngineeringTakeoff,
  diffEngineeringSnapshots,
  exportEngineeringDxf,
  engineeringSnapshotSvg,
  validateEngineeringSnapshot,
  summarizeEngineeringTakeoff
} from '../assets/engineering.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const required = [
  'index.html','server.mjs','package.json','app/layout.js','app/page.js','app/globals.css',
  'assets/app.js','assets/api.js','assets/i18n.js','assets/icons.js','assets/config.js','assets/styles.css','assets/engineering.js',
  'public/assets/app.js','public/assets/api.js','public/assets/i18n.js','public/assets/icons.js','public/assets/config.js','public/assets/styles.css','public/assets/engineering.js',
  'docs/PRODUCT_BLUEPRINT.md','docs/UX_BLUEPRINT.md','docs/DESIGN_SYSTEM.md',
  'docs/TECHNICAL_ARCHITECTURE.md','docs/DATABASE_BIBLE.md','docs/DECISION_LOG.md',
  'docs/QA_CHECKLIST.md','docs/PHASE_4_COMPLETION_REPORT.md','docs/REFERENCE_STUDY.md',
  'docs/PHASE_4_2_CAD_PRO_FINAL.md','docs/QA_CHECKLIST_PHASE_4_2.md','docs/CAD_QUICK_START_AR.md',
  'docs/PHASE_4_15_CAD_CORRECTION.md','docs/QA_CHECKLIST_PHASE_4_15.md',
  'docs/PHASE_4_16_FINAL_DRAWING_ADJUSTMENTS.md','docs/QA_CHECKLIST_PHASE_4_16.md',
  'docs/PHASE_4_17_CAD_INTERACTION_FIXES.md','docs/QA_CHECKLIST_PHASE_4_17.md',
  'docs/samples/cad-correction-4.15-demo.svg','docs/samples/cad-correction-4.15-demo.dxf',
  'docs/samples/cad-correction-4.15-dxf-audit.json','docs/samples/cad-correction-4.15-snapshot.json','docs/samples/cad-correction-4.15-preview.html',
  'docs/PHASE_4_3_CAD_ULTIMATE_FINAL.md','docs/QA_CHECKLIST_PHASE_4_3.md','docs/CAD_PRODUCTION_GUIDE_AR.md',
  'docs/PHASE_4_4_CAD_CLOSURE_FINAL.md','docs/QA_CHECKLIST_PHASE_4_4.md','docs/CAD_FINAL_GUIDE_AR.md','docs/REFERENCE_FRAME_STUDY_PHASE_4_4.md',
  'docs/PHASE_4_5_CAD_STANDARD_FINAL.md','docs/QA_CHECKLIST_PHASE_4_5.md','docs/CAD_STANDARD_QUICK_GUIDE_AR.md',
  'docs/samples/cad-standard-4.5-demo.svg','docs/samples/cad-standard-4.5-demo.png','docs/samples/cad-standard-4.5-demo.dxf','docs/samples/cad-standard-4.5-validation.json',
  'docs/samples/engineering-demo.svg','docs/samples/engineering-demo.png','docs/samples/engineering-demo.dxf','docs/samples/engineering-demo-boq.csv',
  'docs/samples/cad-pro-final-demo.svg','docs/samples/cad-pro-final-demo.png','docs/samples/cad-pro-final-demo.dxf','docs/samples/cad-pro-final-takeoff.csv','docs/samples/cad-pro-final-report.json',
  'docs/samples/cad-ultimate-demo.svg','docs/samples/cad-ultimate-demo.png','docs/samples/cad-ultimate-demo.dxf','docs/samples/cad-ultimate-takeoff.csv','docs/samples/cad-ultimate-report.json','docs/samples/cad-ultimate-takeoff.xls',
  'supabase/migrations/20260804111500_phase4_cad_engineering.sql',
  'supabase/migrations/20260804114000_phase4_performance_hardening.sql',
  'supabase/migrations/20260804115500_phase4_files_workspace_integration.sql',
  'supabase/migrations/20260804120500_phase4_document_link_guard.sql',
  'supabase/migrations/20260804150000_phase4_3_catalog_and_dxf_polish.sql',
  'supabase/migrations/20260804174500_phase4_4_review_workflow.sql'
];
for (const file of required) await access(join(root, file));
const read = (path) => readFile(join(root, path), 'utf8');
const appCode = await read('assets/app.js');
const engineeringCode = await read('assets/engineering.js');
const cssCode = await read('assets/styles.css');
const migration = await read('supabase/migrations/20260804111500_phase4_cad_engineering.sql');
const phase43Migration = await read('supabase/migrations/20260804150000_phase4_3_catalog_and_dxf_polish.sql',
  'supabase/migrations/20260804174500_phase4_4_review_workflow.sql');
const iconsCode = await read('assets/icons.js');
const configCode = await read('assets/config.js');
const packageJson = JSON.parse(await read('package.json'));
  assert.equal(packageJson.version, '6.9.0');
assert.equal(appCode, await read('public/assets/app.js'));
assert.equal(engineeringCode, await read('public/assets/engineering.js'));
assert.equal(cssCode, await read('public/assets/styles.css'));
assert.equal(cssCode, await read('app/globals.css'));
assert.match(appCode,/createEngineeringModule/);
assert.match(appCode,/\['engineering','drafting'/);
assert.match(appCode,/engineering:engineering\.page/);
assert.match(appCode,/drawings\.view/);
assert.match(appCode,/api\.js\?v=6\.9\.0/);
assert.match(appCode,/engineering\.js\?v=6\.9\.0/);
assert.match(engineeringCode,/create_engineering_drawing/);
assert.match(engineeringCode,/save_engineering_draft/);
assert.match(engineeringCode,/publish_engineering_revision/);
assert.match(engineeringCode,/begin_engineering_asset_upload/);
assert.match(engineeringCode,/link_engineering_document/);
assert.match(engineeringCode,/engineering-save-files/);
assert.match(engineeringCode,/Save export in Files Workspace/);
assert.match(engineeringCode,/DXF R12 \/ AutoCAD/);
assert.match(engineeringCode,/validateEngineeringSnapshot/);
assert.match(engineeringCode,/engineering-node-create/);
assert.match(engineeringCode,/engineering-route-create/);
assert.match(engineeringCode,/engineering-connect-selected/);
assert.match(engineeringCode,/routeResolvedPoints/);
assert.match(engineeringCode,/function bindPaletteDnD/);
assert.match(engineeringCode,/application\/x-optimum-cad/);
assert.match(engineeringCode,/engineering-quick-dock/);
assert.match(engineeringCode,/engineering-open-notes/);
assert.match(engineeringCode,/engineering-open-boq/);
assert.match(engineeringCode,/function autoLayout/);
assert.match(engineeringCode,/function smartRouteLayout/);
assert.match(engineeringCode,/engineering-fix-safe/);
assert.match(engineeringCode,/engineering-frame-settings/);
assert.match(engineeringCode,/engineering-shortcuts/);
assert.match(engineeringCode,/autoSaveTimer=setInterval/);
assert.match(engineeringCode,/AC1015/);
assert.match(engineeringCode,/update_engineering_drawing_identity/);
assert.match(engineeringCode,/cad-route-family/);
assert.match(engineeringCode,/summarizeEngineeringTakeoff/);
assert.match(engineeringCode,/DETAILED ROUTE SCHEDULE/);
assert.match(cssCode,/direction:ltr;scroll-behavior:auto/);
assert.match(cssCode,/engineering-quick-dock/);
assert.match(cssCode,/engineering-takeoff-workspace/);
assert.match(cssCode,/Phase 4\.4\.1 — CAD workspace row-placement hotfix/);
assert.match(cssCode,/grid-row:1!important/);
assert.match(cssCode,/cad-route-family/);
assert.match(cssCode,/cad-node-library/);
assert.match(cssCode,/engineering-autosave-state/);
for (const table of ['engineering_catalog_items','engineering_drawings','engineering_revisions','engineering_revision_boq','engineering_review_marks','engineering_assets']) assert.match(migration,new RegExp(`create table public\\.${table}`));
for (const permission of ['drawings.view','drawings.create','drawings.edit','drawings.publish','drawings.compare','drawings.export','drawings.review','boq.view','boq.edit','catalog.manage']) assert.ok(migration.includes(permission));
for (const code of ['FDT-48','FAT-16','ODB-24','HDPE-63','FO-ADSS-48C','TRENCH-ROAD']) assert.ok(phase43Migration.includes(code));
assert.match(phase43Migration,/update_engineering_drawing_identity/);
for (const cssContract of ['.engineering-editor-shell','.engineering-focus-mode','.engineering-canvas-viewport','.engineering-boq-table','.engineering-drawing-card','.engineering-palette','.engineering-validation-panel','.engineering-guided-form','.engineering-linked-row']) assert.ok(cssCode.includes(cssContract));
for (const iconName of ['drafting','mousePointer','text','undo','redo','zoomIn','zoomOut','compare','save','printer','fileSpreadsheet','fit','layout','route','wand']) assert.match(iconsCode,new RegExp(`${iconName}:`));
assert.match(configCode,/appVersion: '6\.9\.0-site-delivery-claim-intelligence'/);
assert.match(engineeringCode,/Network Builder from Schedule/);
assert.match(engineeringCode,/engineering-review-update/);
assert.match(engineeringCode,/engineering_review_mark_updates/);
assert.doesNotMatch(engineeringCode,/class=\"eng-node-label-table/);
assert.match(engineeringCode,/eng-node-key/);
assert.match(engineeringCode,/engineering-minimap/);
assert.match(engineeringCode,/data-eng-route-label/);
assert.match(engineeringCode,/professionalNetworkLayout/);
assert.match(engineeringCode,/Cable Schedule/);
assert.match(engineeringCode,/Review Register/);

assert.match(engineeringCode,/cad-master-header/);
assert.match(engineeringCode,/cad-symbol-tile/);
assert.match(engineeringCode,/cad-master-route-dock/);
assert.match(engineeringCode,/const copySelection=/);
assert.match(engineeringCode,/const pasteSelection=/);
assert.match(engineeringCode,/engineering-copy/);
assert.match(engineeringCode,/engineering-paste/);
assert.match(engineeringCode,/engineering-route-label-edit/);
assert.match(engineeringCode,/labelFontSize/);
assert.match(engineeringCode,/activeDrawingKey/);
assert.match(engineeringCode,/engineering-assembly-create/);
assert.match(engineeringCode,/catalogSymbolPreview/);
assert.match(cssCode,/Phase 4\.7\.2 — visual master palette and status fidelity/);
assert.match(cssCode,/cad-library-pro/);
assert.match(cssCode,/engineering-route-dock-pro/);
assert.doesNotMatch(`${appCode}\n${engineeringCode}\n${configCode}`,/service_role|SUPABASE_SERVICE_ROLE/i);

const catalog=[
  {code:'TB-24C',category:'node',name_ar:'بوكس',name_en:'Box',unit:'ea',default_properties:{}},
  {code:'DUCT-4W-7/3.5',category:'route',name_ar:'دكت',name_en:'Duct',unit:'m',default_properties:{}},
  {code:'CONNECTOR',category:'accessory',name_ar:'كونكتور',name_en:'Connector',unit:'ea',default_properties:{}},
  {code:'SP-1X16',category:'accessory',symbol_key:'splitter',name_ar:'سبليتر',name_en:'Splitter',unit:'ea',default_properties:{}},
  {code:'ODF-144',category:'accessory',symbol_key:'odf',name_ar:'ODF',name_en:'ODF',unit:'ea',default_properties:{}}
];
const snapshot=normalizeEngineeringSnapshot({
  nodes:[{id:'n1',catalogCode:'TB-24C',x:100,y:100,properties:{accessories:['CONNECTOR'],splitterCode:'SP-1X16',odfCode:'ODF-144'}}],
  routes:[{id:'r1',catalogCode:'DUCT-4W-7/3.5',points:[{x:100,y:100},{x:300,y:100}],properties:{connectorCount:2}}],
  annotations:[{id:'t1',x:50,y:50,text:'Test',size:18}]
});
const boq=calculateEngineeringTakeoff(snapshot,catalog,{grid:20,meterPerGrid:1});
assert.equal(boq.find(x=>x.code==='TB-24C').quantity,1);
assert.equal(boq.find(x=>x.code==='DUCT-4W-7/3.5').quantity,10.5);
const bent=calculateEngineeringTakeoff(normalizeEngineeringSnapshot({routes:[{id:'bend',catalogCode:'DUCT-4W-7/3.5',points:[{x:0,y:0},{x:100,y:0},{x:100,y:100}],properties:{}}]}),catalog,{grid:20,meterPerGrid:1});
assert.equal(bent.find(x=>x.code==='DUCT-4W-7/3.5').quantity,10.5);
assert.equal(boq.find(x=>x.code==='CONNECTOR').quantity,3);
assert.equal(boq.find(x=>x.code==='SP-1X16').quantity,1);
assert.equal(boq.find(x=>x.code==='ODF-144').quantity,1);
const linked=normalizeEngineeringSnapshot({
  nodes:[
    {id:'a',catalogCode:'TB-24C',x:100,y:100,label:'A',properties:{networkLevel:'main',boxNo:'1'}},
    {id:'b',catalogCode:'TB-24C',x:500,y:100,label:'B',properties:{networkLevel:'secondary',boxNo:'2'}}
  ],
  routes:[{id:'ab',catalogCode:'DUCT-4W-7/3.5',sourceNodeId:'a',targetNodeId:'b',points:[{x:100,y:100},{x:500,y:100}],label:'Main duct',manualLength:30,properties:{networkLevel:'main',installation:'underground',ways:4,cableCode:'',fromLabel:'A',toLabel:'B'}}]
});
assert.equal(linked.routes[0].labelFontSize,11);
assert.equal(linked.routes[0].labelShowTechnical,true);
assert.equal(linked.routes[0].labelBackground,false);
const linkedBoq=calculateEngineeringTakeoff(linked,catalog,{grid:20,meterPerGrid:1});
assert.equal(linkedBoq.find(x=>x.code==='DUCT-4W-7/3.5').quantity,31.5);
const linkedReport=summarizeEngineeringTakeoff(linked,catalog,{grid:20,meterPerGrid:1});
assert.equal(linkedReport.summary.nodeCount,2);
assert.equal(linkedReport.summary.routeCount,1);
assert.equal(linkedReport.summary.totalRouteLength,30);
assert.equal(linkedReport.summary.plannedRouteLength,31.5);
assert.equal(linkedReport.routeSchedule[0].from,'A');
assert.equal(linkedReport.routeSchedule[0].to,'B');
assert.ok(linkedBoq.some(x=>x.code==='CIVIL-UG-ROUTE'));
const valid=validateEngineeringSnapshot(linked,catalog,{width:1600,height:1000,grid:20,meterPerGrid:1});
assert.equal(valid.errorCount,0);
const invalid=validateEngineeringSnapshot(normalizeEngineeringSnapshot({nodes:[{id:'x1',catalogCode:'TB-24C',x:100,y:100,label:'DUP',properties:{networkLevel:'secondary',boxNo:'7'}},{id:'x2',catalogCode:'TB-24C',x:240,y:100,label:'DUP',properties:{networkLevel:'secondary',boxNo:'7'}}],routes:[{id:'loose',catalogCode:'DUCT-4W-7/3.5',points:[{x:0,y:0},{x:20,y:20}],label:'',properties:{}}]}),catalog,{width:1600,height:1000,grid:20,meterPerGrid:1});
assert.ok(invalid.errorCount>=2);
assert.ok(invalid.warningCount>=1);
const linkedSvg=engineeringSnapshotSvg(linked,{catalog,settings:{width:1600,height:1000,grid:20,meterPerGrid:1},metadata:{drawingNo:'L-001',title:'Linked'},selected:{kind:'route',id:'ab'},validation:valid});
assert.match(linkedSvg,/eng-route-handle/);
assert.match(linkedSvg,/Main duct/);
assert.match(linkedSvg,/30 m/);

const diff=diffEngineeringSnapshots(snapshot,{...snapshot,nodes:[...snapshot.nodes,{id:'n2',catalogCode:'TB-24C',x:200,y:200,properties:{}}]});
assert.equal(diff.nodes.added.length,1);
const dxf=exportEngineeringDxf(snapshot,{drawingNo:'D-001',title:'Test'},{height:1000});
assert.match(dxf,/AC1015/); assert.match(dxf,/SECTION/); assert.match(dxf,/LAYER/); assert.match(dxf,/0\r?\nLINE\r?\n/); assert.match(dxf,/0\r?\nTEXT\r?\n/); assert.match(dxf,/AcDb/); assert.match(dxf,/LWPOLYLINE/); assert.match(dxf,/EOF\r?\n$/);
const svg=engineeringSnapshotSvg(snapshot,{catalog,settings:{width:1600,height:1000},metadata:{drawingNo:'D-001',title:'Test'}});
assert.match(svg,/viewBox="0 0 1918 1000"/); assert.match(svg,/data-drawing-width="1600"/); assert.match(svg,/eng-company-frame/); assert.match(svg,/eng-node-type-caption/); assert.match(svg,/eng-route-label-text/); assert.doesNotMatch(svg,/eng-node-label-table/); assert.match(svg,/data-eng-node="n1"/);

const port=4194;
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port)},stdio:'ignore'});
try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,900);server.once('error',(error)=>{clearTimeout(timer);reject(error);});});
  const index=await fetch(`http://127.0.0.1:${port}/`);assert.equal(index.status,200);const indexText=await index.text();assert.match(indexText,/CAD Engineering/);assert.match(indexText,/app\.js\?v=6\.9\.0/);
  const js=await fetch(`http://127.0.0.1:${port}/assets/engineering.js`);assert.equal(js.status,200);assert.match(js.headers.get('content-type')||'',/javascript/);
  assert.match(index.headers.get('content-security-policy')||'',/supabase\.co/);
} finally { server.kill('SIGTERM'); }
console.log('✓ Optimum Phase 4.17 CAD Interaction Fixes smoke tests passed');

assert.match(engineeringCode,/cad-header-411/);
assert.match(engineeringCode,/engineering-open-files/);
assert.match(engineeringCode,/bindPanelResizers/);
assert.match(engineeringCode,/eng-route-label-text/);
assert.match(cssCode,/Phase 4\.11/);
