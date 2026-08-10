import assert from 'node:assert/strict';
import {createEngineeringModule, normalizeEngineeringSnapshot, engineeringSnapshotSvg, exportEngineeringDxf} from '../assets/engineering.js';

const storage=new Map();
globalThis.localStorage={getItem:(k)=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:(k)=>storage.delete(k)};
globalThis.requestAnimationFrame=()=>0;
globalThis.location={hash:'#/engineering'};
globalThis.confirm=()=>true;
globalThis.prompt=()=>'';

const catalog=[
  {code:'TB-24C',category:'node',symbol_key:'termination_box',name_ar:'بوكس نهاية 24 كور',name_en:'24-core Termination Box',unit:'ea',default_properties:{cores:24,color:'#16A34A'}},
  {code:'DUCT-4W-7/3.5',category:'route',symbol_key:'microduct',name_ar:'ميكرو دكت 4 مسار',name_en:'4-way Microduct',unit:'m',default_properties:{ways:4,diameter:'7/3.5',color:'#16A34A',dxf_layer:'DUCT_4W'}},
];
const snapshot=normalizeEngineeringSnapshot({
  nodes:[
    {id:'a',catalogCode:'TB-24C',x:150,y:180,label:'TB-1',properties:{boxNo:'1',capacity:24}},
    {id:'b',catalogCode:'TB-24C',x:520,y:300,label:'TB-2',properties:{boxNo:'2',capacity:24}},
  ],
  routes:[{id:'r1',catalogCode:'DUCT-4W-7/3.5',sourceNodeId:'a',targetNodeId:'b',points:[{x:150,y:180},{x:520,y:300}],label:'مسار رئيسي',labelOffset:{x:63,y:-71},properties:{ways:4,diameter:'7/3.5',cableCode:'FO-24C',fiberCores:24}}]
});
const drawings=[{id:'d1',company_id:'c1',project_id:'p1',drawing_no:'D-001',title:'Test Drawing',current_revision_id:'rev1',status:'draft',updated_at:new Date().toISOString()}];
const revisions=[{id:'rev1',company_id:'c1',drawing_id:'d1',revision_number:1,revision_code:'R1',status:'draft',snapshot,sheet_settings:{width:1600,height:1000,titleBlock:true,framePanelWidth:310},lock_version:1}];
const tables={engineering_drawings:drawings,engineering_revisions:revisions,engineering_revision_boq:[],engineering_review_marks:[],engineering_review_mark_updates:[],engineering_catalog_items:catalog,engineering_assets:[],engineering_document_links:[]};
const api={select:async(t)=>structuredClone(tables[t]||[]),rpc:async()=>({}),createSignedUrl:async()=>'',user:{email:'test@example.com',user_metadata:{full_name:'Test'}}};
let lastDialog='';
const deps={api,state:{companyId:'c1',company:{name:'Optimum'},profile:{full_name:'Tester'},prefs:{locale:'ar'},projects:[{id:'p1',name:'P1'}],sites:[],folders:[],documents:[]},can:()=>true,L:(a)=>a,e:(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),icon:()=>'',toast:()=>{},formError:()=>{},openDialog:({body})=>{lastDialog=body},openDrawer:()=>{},closeOverlay:()=>{},render:()=>{},pageHeader:()=>'',emptyState:()=>'',formatDateTime:()=>'',loadFilesData:async()=>{},openDocumentDetails:()=>{}};

// Refresh restore: load should reopen the remembered drawing.
storage.set('optimum.cad.active.c1',JSON.stringify({drawingId:'d1',revisionId:'rev1'}));
const module=createEngineeringModule(deps);
await module.load();
assert.equal(module.state.mode,'editor');
assert.equal(module.state.selectedDrawingId,'d1');
assert.equal(module.state.selectedRevisionId,'rev1');

// Route label: click editor data can be saved exactly and is retained in snapshot.
await module.handleSubmit('engineering-route-label-edit',{dataset:{id:'r1'}},{label:'مسار خاص\nالدور الثاني',font_size:'16',show_technical:false,background:true});
const route=module.state.snapshot.routes.find(x=>x.id==='r1');
assert.equal(route.label,'مسار خاص\nالدور الثاني');
assert.equal(route.labelFontSize,16);
assert.equal(route.labelShowTechnical,false);
assert.equal(route.labelBackground,true);
assert.deepEqual(route.labelOffset,{x:63,y:-71});

// Assembly: selected objects save, persist and immediately appear in state.
module.state.selection=['node:a','node:b'];
module.state.selected={kind:'node',id:'b'};
await module.handleAction('engineering-save-assembly',{});
assert.match(lastDialog,/engineering-assembly-create/);
await module.handleSubmit('engineering-assembly-create',{dataset:{}},{name:'تجميعة اختبار'});
assert.equal(module.state.assemblies[0].name,'تجميعة اختبار');
assert.equal(module.state.assemblies[0].nodes.length,2);
assert.equal(module.state.assemblies[0].routes.length,1);
assert.match(storage.get('optimum.cad.assemblies'),/تجميعة اختبار/);

// SVG: external title block, readable label box after nodes, exact offset, small node caption.
const svg=engineeringSnapshotSvg(module.state.snapshot,{settings:{width:1600,height:1000,titleBlock:true,framePanelWidth:310},catalog,metadata:{drawingNo:'D-001',title:'Test'},locale:'ar'});
assert.match(svg,/viewBox="0 0 1918 1000"/);
assert.match(svg,/data-drawing-width="1600"/);
assert.match(svg,/eng-node-type-caption/);
assert.match(svg,/eng-route-label-text/);
assert.doesNotMatch(svg,/eng-route-label-box/);
assert.match(svg,/translate\([^)]*\)/);
assert.ok(svg.indexOf('data-eng-node="b"') < svg.indexOf('data-eng-route-label="r1"'),'route labels must render above nodes');
assert.match(svg,/مسار خاص/);
assert.match(svg,/الدور الثاني/);

// DXF: structured AutoCAD R2000 structure and editable entities.
const dxf=exportEngineeringDxf(module.state.snapshot,{drawingNo:'D-001',title:'Test'},{width:1600,height:1000,titleBlock:true,framePanelWidth:310,catalog});
assert.match(dxf,/\$ACADVER\r?\n1\r?\nAC1015/);
assert.match(dxf,/0\r?\nLINE\r?\n/);
assert.match(dxf,/0\r?\nTEXT\r?\n/);
assert.match(dxf,/AcDb/);
assert.match(dxf,/LWPOLYLINE/);
assert.match(dxf,/0\r?\nEOF\r?\n$/);
const lines=dxf.split(/\r?\n/);
assert.equal(lines.length%2,1,'DXF must contain code/value pairs plus final newline split');
for(let i=0;i<lines.length-1;i+=2) assert.match(lines[i],/^-?\d+$/,'DXF group codes must be numeric');

console.log('✓ Phase 4.11 text-only route labels, refresh restore, assemblies, SVG and R12 DXF checks passed');
process.exit(0);
