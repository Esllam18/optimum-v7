import assert from 'node:assert/strict';
import {createEngineeringModule,normalizeEngineeringSnapshot,validateEngineeringSnapshot,exportEngineeringDxf} from '../assets/engineering.js';

globalThis.document={querySelector:()=>null,querySelectorAll:()=>[],contains:()=>false};
globalThis.window={innerWidth:1648,innerHeight:927,open:()=>null,addEventListener:()=>{}};
globalThis.requestAnimationFrame=()=>0;
globalThis.confirm=()=>true;
globalThis.sessionStorage={setItem:()=>{},getItem:()=>null};
globalThis.location={hash:''};
globalThis.CSS={escape:(s)=>String(s)};
const store=new Map();
globalThis.localStorage={getItem:(k)=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:(k)=>store.delete(k)};

const catalog=[
 {code:'SUBCAB-22U',category:'node',symbol_key:'sub_cabinet',name_ar:'كابينة فرعية 22U',name_en:'22U Sub Cabinet',default_properties:{color:'#2563eb'}},
 {code:'TB-24C',category:'node',symbol_key:'termination_box',name_ar:'بوكس نهاية 24 كور',name_en:'24C Termination Box',default_properties:{color:'#ef4444'}},
 {code:'JOINT-96C',category:'node',symbol_key:'joint',name_ar:'وصلة 96 كور',name_en:'96C Joint',default_properties:{color:'#7c3aed'}},
 {code:'DUCT-4W-7/3.5',category:'route',symbol_key:'microduct',name_ar:'ميكرو دكت 4 مسار',name_en:'4W Microduct',default_properties:{color:'#16a34a',dxf_layer:'DUCT_4W'}},
 {code:'FO-24C',category:'route',symbol_key:'fiber_cable',name_ar:'كابل 24 كور',name_en:'24C Fiber',default_properties:{color:'#ef4444',dxf_layer:'FO_24C'}}
];
const remoteSnapshot=normalizeEngineeringSnapshot({nodes:[{id:'n1',catalogCode:'TB-24C',x:100,y:100,label:'REMOTE',properties:{networkLevel:'terminal',boxNo:'01'}}]});
const localSnapshot=normalizeEngineeringSnapshot({nodes:[{id:'n1',catalogCode:'TB-24C',x:240,y:180,label:'LOCAL RECOVERY',properties:{networkLevel:'terminal',boxNo:'01'}}]});
const settings={width:1600,height:1000,titleBlock:true,framePanelWidth:310,grid:20,meterPerGrid:1};
const tables={
 engineering_drawings:[{id:'d1',company_id:'c1',project_id:'p1',site_id:'s1',folder_id:'f1',drawing_no:'P001-CAD',title:'Freeze Test',discipline:'fiber',drawing_type:'secondary_network',current_revision_id:'rev1',status:'draft'}],
 engineering_revisions:[{id:'rev1',company_id:'c1',drawing_id:'d1',revision_number:1,revision_code:'R1',status:'draft',snapshot:remoteSnapshot,sheet_settings:settings,lock_version:3,updated_at:'2026-08-05T10:00:00Z'}],
 engineering_revision_boq:[],engineering_review_marks:[],engineering_review_mark_updates:[],engineering_catalog_items:catalog,engineering_assets:[],engineering_document_links:[]
};
const recoveryKey='optimum.cad.recovery.c1.rev1';
store.set(recoveryKey,JSON.stringify({version:1,companyId:'c1',drawingId:'d1',revisionId:'rev1',baseLockVersion:3,savedAt:'2026-08-05T10:01:00Z',snapshot:localSnapshot,settings}));
let rpcCalls=0,dialog=null;
const api={user:{email:'qa@optimum.local'},select:async(t)=>structuredClone(tables[t]||[]),rpc:async(name)=>{rpcCalls++;if(name==='save_engineering_draft')return{lock_version:4,saved_at:'2026-08-05T10:02:00Z'};return{};},createSignedUrl:async()=>'',uploadObject:async()=>{},deleteObject:async()=>{}};
const state={companyId:'c1',company:{id:'c1',name:'Optimum'},profile:{full_name:'QA'},prefs:{locale:'ar'},projects:[{id:'p1',code:'P001',name:'المشروع'}],sites:[{id:'s1',project_id:'p1',code:'S01',name:'الموقع'}],folders:[{id:'f1',project_id:'p1',site_id:'s1',code:'01',name:'Drawings'}],documents:[],selectedProjectId:'p1',selectedSiteId:'s1'};
const deps={api,state,can:()=>true,L:(a)=>a,e:(x='')=>String(x),icon:()=>'',toast:()=>{},formError:(err)=>{throw err},openDialog:(x)=>{dialog=x},openDrawer:(x)=>{dialog=x},closeOverlay:()=>{},render:()=>{},pageHeader:()=>'',emptyState:()=>'',formatDateTime:(x)=>String(x||''),loadFilesData:async()=>{},openDocumentDetails:()=>{}};
const mod=createEngineeringModule(deps);await mod.load();await mod.openDrawing('d1','rev1');
assert.equal(mod.state.snapshot.nodes[0].label,'LOCAL RECOVERY','same-lock recovery must be restored after refresh');
assert.equal(mod.state.dirty,true);assert.equal(mod.state.recoveryRestored,true);
await mod.handleAction('engineering-save',{});
assert.equal(store.has(recoveryKey),false,'successful server save must clear the recovery draft');

// A remote conflict must stop after one save attempt; it must never retry over another user's work.
mod.state.snapshot.nodes[0].label='MY CONFLICTING EDIT';mod.state.dirty=true;rpcCalls=0;
api.rpc=async(name)=>{rpcCalls++;if(name==='save_engineering_draft')throw new Error('Revision changed by another user');return{};};
await mod.handleAction('engineering-save',{});
await new Promise((resolve)=>setTimeout(resolve,35));
assert.equal(rpcCalls,1,'conflicting save must not retry with the new lock version');
assert.ok(mod.state.pendingConflict);assert.ok(mod.state.pendingRecovery);assert.match(dialog.title,/مستخدم آخر/);assert.match(dialog.body,/رسمة منفصلة/);

// The 1600x1000 drawing area remains fully usable even when the export title block is enabled.
const edgeSnapshot=normalizeEngineeringSnapshot({nodes:[{id:'edge',catalogCode:'TB-24C',x:1510,y:500,width:80,height:60,label:'EDGE',properties:{networkLevel:'terminal',boxNo:'1'}}]});
const edgeValidation=validateEngineeringSnapshot(edgeSnapshot,catalog,{...settings,titleBlock:true});
assert.equal(edgeValidation.issues.some((x)=>x.code==='node_near_sheet_edge'),false,'title block must not reduce the editor safe width');
mod.state.snapshot=normalizeEngineeringSnapshot({nodes:[{id:'center',catalogCode:'TB-24C',x:120,y:220,label:'CENTER',properties:{networkLevel:'terminal',boxNo:'2'}}]});
await mod.handleAction('engineering-center-network',{});
assert.ok(Math.abs(mod.state.snapshot.nodes[0].x-800)<1,'network must center on the complete 1600-wide board');

// AutoCAD export: R2000, complete sections, editable geometry, full-scale engineering tags and title block.
const cadSnapshot=normalizeEngineeringSnapshot({nodes:[
 {id:'cab',catalogCode:'SUBCAB-22U',x:180,y:500,label:'CAB-1',properties:{boxNo:'1',capacity:144,ports:36,odfCode:'ODF-144',splitterCode:'SP-1X16'}},
 {id:'j',catalogCode:'JOINT-96C',x:600,y:360,label:'J-1',properties:{}},
 {id:'tb',catalogCode:'TB-24C',x:1040,y:300,label:'TB-19',properties:{boxNo:'19',capacity:24,ports:8,distance:145}}
],routes:[{id:'r',catalogCode:'DUCT-4W-7/3.5',sourceNodeId:'cab',targetNodeId:'j',points:[{x:180,y:500},{x:420,y:500},{x:600,y:360}],label:'MAIN ROUTE',labelOffset:{x:20,y:-28},properties:{ways:4,diameter:'7/3.5',cableCode:'FO-24C',fiberCores:24,fromLabel:'CAB-1',toLabel:'J-1'}}]});
const dxf=exportEngineeringDxf(cadSnapshot,{drawingNo:'P001-CAD',title:'Secondary Network',project:'Optimum',site:'Shatanof',revision:'R1'},{...settings,catalog});
assert.match(dxf,/\$ACADVER\r?\n1\r?\nAC1015/);assert.match(dxf,/2\r?\nBLOCKS\r?\n/);assert.match(dxf,/0\r?\nLWPOLYLINE\r?\n/);assert.match(dxf,/0\r?\nTEXT\r?\n/);assert.match(dxf,/CAB-1/);assert.match(dxf,/ODF-144/);assert.match(dxf,/MAIN ROUTE/);assert.doesNotMatch(dxf,/MAIN ROUTEPCAB-1/);assert.match(dxf,/DRAWING NO/);assert.match(dxf,/1920/);assert.match(dxf,/0\r?\nEOF\r?\n$/);
const rows=dxf.trimEnd().split(/\r?\n/);assert.equal(rows.length%2,0);for(let i=0;i<rows.length;i+=2)assert.match(rows[i],/^-?\d+$/);
console.log('✓ Phase 4.13 CAD freeze: conflict protection, local recovery, full board geometry and professional R2000 DXF passed');
process.exit(0);
