import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createEngineeringModule,normalizeEngineeringSnapshot,engineeringSnapshotSvg,exportEngineeringDxf} from '../assets/engineering.js';

globalThis.document={querySelector:()=>null,querySelectorAll:()=>[],contains:()=>false};
globalThis.window={innerWidth:1648,innerHeight:927,open:()=>null};
globalThis.requestAnimationFrame=()=>0;
globalThis.confirm=()=>true;
globalThis.localStorage={data:new Map(),getItem(k){return this.data.get(k)||null},setItem(k,v){this.data.set(k,String(v))},removeItem(k){this.data.delete(k)}};
globalThis.sessionStorage={setItem:()=>{},getItem:()=>null};
globalThis.location={hash:''};
globalThis.CSS={escape:(s)=>String(s)};

const catalog=[
 {code:'MAIN-CAB-42U',category:'node',symbol_key:'main_cabinet',name_ar:'كابينة رئيسية 42U',name_en:'42U Main Cabinet',sort_order:1,default_properties:{color:'#2563eb'}},
 {code:'TB-24C',category:'node',symbol_key:'termination_box',name_ar:'بوكس نهاية 24 كور',name_en:'24C Termination Box',sort_order:2,default_properties:{color:'#16a34a'}},
 {code:'ODF-144',category:'accessory',symbol_key:'odf',name_ar:'ODF سعة 144',name_en:'ODF 144',sort_order:3,default_properties:{color:'#ef4444'}},
 {code:'LGX-4U',category:'accessory',symbol_key:'lgx',name_ar:'LGX سعة 4U',name_en:'LGX 4U',sort_order:4,default_properties:{color:'#ef4444'}},
 {code:'SP-1X16',category:'accessory',symbol_key:'splitter',name_ar:'سبليتر 1:16',name_en:'Splitter 1:16',sort_order:5,default_properties:{color:'#ef4444'}},
 {code:'DUCT-4W-7/3.5',category:'route',symbol_key:'microduct',name_ar:'ميكرو دكت 4 مسار 7/3.5',name_en:'4W Microduct',sort_order:10,default_properties:{color:'#16a34a',ways:4,diameter:'7/3.5'}},
 {code:'FO-24C',category:'route',symbol_key:'fiber_cable',name_ar:'كابل فايبر 24 كور',name_en:'24C Fiber',sort_order:11,default_properties:{color:'#ec4899'}}
];
const snapshot=normalizeEngineeringSnapshot({nodes:[
 {id:'a',catalogCode:'MAIN-CAB-42U',x:150,y:300,label:'CAB-1',properties:{networkLevel:'main',boxNo:'01',capacity:288,ports:144,odfCode:'ODF-144',odfPort:'P01',splitterCode:'SP-1X16',splitterPort:'S01',coreRange:'1-144'}},
 {id:'b',catalogCode:'TB-24C',x:620,y:260,label:'TB-1',properties:{networkLevel:'terminal',boxNo:'02',capacity:24,ports:8,coreRange:'145-168'}},
 {id:'c',catalogCode:'TB-24C',x:620,y:580,label:'TB-2',properties:{networkLevel:'terminal',boxNo:'03',capacity:24,ports:8,coreRange:'169-192'}}
],routes:[
 {id:'r1',catalogCode:'DUCT-4W-7/3.5',sourceNodeId:null,targetNodeId:null,points:[{x:151,y:301},{x:400,y:301},{x:619,y:261}],label:'',labelOffset:{x:25,y:-30},properties:{ways:4,diameter:'7/3.5',cableCode:'FO-24C',fiberCores:24,networkLevel:'secondary',installation:'underground'}},
 {id:'r2',catalogCode:'FO-24C',sourceNodeId:'a',targetNodeId:'c',points:[{x:150,y:300},{x:400,y:580},{x:620,y:580}],label:'DROP-02',properties:{fiberCores:24,networkLevel:'drop',installation:'underground'}}
]});
const logo="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 50'%3E%3Crect width='120' height='50' fill='%23137A55'/%3E%3C/svg%3E";
const tables={
 engineering_drawings:[{id:'d1',company_id:'c1',project_id:'p1',site_id:'s1',drawing_no:'P001-FIBER-001',title:'Final Closure Test',current_revision_id:'rev1',status:'draft'}],
 engineering_revisions:[{id:'rev1',company_id:'c1',drawing_id:'d1',revision_number:0,revision_code:'R0',status:'draft',snapshot,sheet_settings:{width:1600,height:1000,grid:20,meterPerGrid:1,titleBlock:true,framePanelWidth:310,titleBlockData:{logos:[{src:logo,width:120,height:50}]}},lock_version:1}],
 engineering_revision_boq:[],engineering_review_marks:[],engineering_review_mark_updates:[],engineering_catalog_items:catalog,engineering_assets:[],engineering_document_links:[]
};
let dialog=null,openedDocument=null,loadFilesCount=0;
const api={user:{email:'qa@optimum.local'},select:async(t)=>structuredClone(tables[t]||[]),rpc:async(name)=>name==='save_engineering_draft'?{lock_version:2,saved_at:new Date().toISOString()}: {},createSignedUrl:async()=> 'https://example.invalid/file',uploadObject:async()=>{},deleteObject:async()=>{}};
const state={companyId:'c1',company:{id:'c1',name:'Optimum'},profile:{full_name:'QA'},prefs:{locale:'ar'},projects:[{id:'p1',code:'P001',name:'المشروع الأول'}],sites:[{id:'s1',project_id:'p1',code:'S01',name:'الموقع الأول'}],folders:[{id:'f1',project_id:'p1',site_id:'s1',code:'01',name:'Drawings'}],documents:[{id:'doc1',project_id:'p1',site_id:'s1',display_name:'الرسم المصدر',state:'active'}],selectedProjectId:'p1',selectedSiteId:'s1'};
const deps={api,state,can:()=>true,L:(a)=>a,e:(x='')=>String(x),icon:()=>'',toast:()=>{},formError:(e)=>{throw e},openDialog:(x)=>{dialog=x},openDrawer:(x)=>{dialog=x},closeOverlay:()=>{},render:()=>{},pageHeader:()=>'',emptyState:()=>'',formatDateTime:()=>'',loadFilesData:async()=>{loadFilesCount++},openDocumentDetails:(id)=>{openedDocument=id}};
const mod=createEngineeringModule(deps);await mod.load();await mod.openDrawing('d1','rev1');
mod.state.dirty=true;await mod.handleAction('engineering-save-properties',{});
assert.equal(mod.state.snapshot.routes[0].sourceNodeId,null,'saving must not silently infer a route start');
assert.equal(mod.state.snapshot.routes[0].targetNodeId,null,'saving must not silently infer a route end');
await mod.handleAction('engineering-professional-layout',{});
for(const n of mod.state.snapshot.nodes){assert.ok(n.x>=100&&n.x<=1500);assert.ok(n.y>=80&&n.y<=920)}
await mod.handleAction('engineering-pick-node-family',{dataset:{family:'optical'}});
assert.match(dialog.body,/ODF سعة 144/);assert.match(dialog.body,/LGX سعة 4U/);assert.match(dialog.body,/سبليتر 1:16/);
mod.state.dirty=true;await mod.handleAction('engineering-save-to-files',{});
assert.match(dialog.body,/01 — الرسومات/,'Files folder must be localized in Arabic');
await mod.handleAction('engineering-open-linked-document',{dataset:{id:'doc1'}});
assert.equal(loadFilesCount,0,'linked document open must not reload the whole Files workspace');assert.equal(openedDocument,'doc1');

const svg=engineeringSnapshotSvg(mod.state.snapshot,{catalog,settings:{...mod.state.settings,titleBlock:true,titleBlockData:{...(mod.state.settings.titleBlockData||{}),logos:[{src:logo,width:120,height:50}]}},metadata:{drawingNo:'P001-FIBER-001',title:'Final Closure Test',project:'المشروع الأول',site:'الموقع الأول',revision:'R0'},locale:'ar'});
assert.match(svg,/<image href="data:image\/svg\+xml/,'frame logo must render');
assert.match(svg,/العناصر المستخدمة/);assert.match(svg,/المسارات المستخدمة/);
assert.match(svg,/ODF ODF-144 \/ P01/);assert.match(svg,/SP SP-1X16 \/ S01/);assert.match(svg,/CORE 1-144/);
assert.doesNotMatch(svg,/eng-route-label-box/);

const dxf=exportEngineeringDxf(mod.state.snapshot,{drawingNo:'P001-FIBER-001',title:'Final Closure Test',project:'Project',site:'Site',revision:'R0'},{...mod.state.settings,titleBlock:true,catalog});
assert.match(dxf,/\$ACADVER\r?\n1\r?\nAC1015/);assert.match(dxf,/0\r?\nLINE\r?\n/);assert.match(dxf,/0\r?\nTEXT\r?\n/);assert.match(dxf,/AcDb/);assert.match(dxf,/LWPOLYLINE/);assert.match(dxf,/0\r?\nEOF\r?\n$/);
const rows=dxf.trimEnd().split(/\r?\n/);assert.equal(rows.length%2,0);for(let i=0;i<rows.length;i+=2)assert.match(rows[i],/^-?\d+$/);

const js=await readFile(new URL('../assets/engineering.js',import.meta.url),'utf8'),css=await readFile(new URL('../assets/styles.css',import.meta.url),'utf8'),app=await readFile(new URL('../assets/app.js',import.meta.url),'utf8');
assert.match(css,/grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/);assert.match(css,/\.cad-toolbar-center/);assert.match(css,/Phase 4\.12/);
assert.match(js,/routeDockHeight:Math\.max\(165/);assert.match(js,/engineering-pick-node-family/);assert.match(js,/localizedFolderName/);assert.match(js,/assetMime/);assert.doesNotMatch(js,/fixable=new Set\([^)]*orphan_node/);
assert.match(js,/@page\{size:A3 landscape/);assert.match(app,/async function previewVersion/);assert.match(app,/cad-asset-preview-frame/);
console.log('✓ Phase 4.12 final closure: route endpoints, optical variants, frame logos/legend, Arabic Files save, linked files, layout, A3 print and conservative DXF passed');

process.exit(0);
