import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {createEngineeringModule,normalizeEngineeringSnapshot,engineeringSnapshotSvg,exportEngineeringDxf} from '../assets/engineering.js';

globalThis.document={querySelector:()=>null,querySelectorAll:()=>[],contains:()=>false};
globalThis.window={innerWidth:1648,innerHeight:927};
globalThis.requestAnimationFrame=()=>0;
globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
globalThis.location={hash:''};

const catalog=[
{code:'MAIN-CAB-42U',category:'node',symbol_key:'main_cabinet',name_ar:'كابينة رئيسية 42U',name_en:'42U Main Cabinet',unit:'ea',sort_order:1,default_properties:{color:'#2563EB'}},
{code:'SUBCAB-22U',category:'node',symbol_key:'sub_cabinet',name_ar:'كابينة فرعية 22U',name_en:'22U Sub Cabinet',unit:'ea',sort_order:2,default_properties:{color:'#2563EB'}},
{code:'TB-24C',category:'node',symbol_key:'termination_box',name_ar:'بوكس نهاية 24 كور',name_en:'24-core Termination Box',unit:'ea',sort_order:3,default_properties:{cores:24,color:'#16A34A'}},
{code:'MH-TEL',category:'node',symbol_key:'manhole',name_ar:'غرفة اتصالات',name_en:'Telecom Manhole',unit:'ea',sort_order:4,default_properties:{color:'#475569'}},
{code:'JOINT',category:'node',symbol_key:'joint',name_ar:'وصلة فايبر',name_en:'Fiber Joint',unit:'ea',sort_order:5,default_properties:{color:'#7C3AED'}},
{code:'POLE',category:'node',symbol_key:'pole',name_ar:'عمود',name_en:'Pole',unit:'ea',sort_order:6,default_properties:{color:'#0F766E'}},
{code:'ODF-144',category:'accessory',symbol_key:'odf',name_ar:'ODF سعة 144',name_en:'ODF 144',unit:'ea',sort_order:7,default_properties:{color:'#EF4444'}},
{code:'DUCT-4W-7/3.5',category:'route',symbol_key:'microduct',name_ar:'ميكرو دكت 4 مسار 7/3.5',name_en:'4-way 7/3.5 Microduct',unit:'m',sort_order:10,default_properties:{ways:4,diameter:'7/3.5',color:'#22c55e'}},
{code:'DUCT-12W-12/8',category:'route',symbol_key:'microduct',name_ar:'ميكرو دكت 12 مسار 12/8',name_en:'12-way 12/8 Microduct',unit:'m',sort_order:11,default_properties:{ways:12,diameter:'12/8',color:'#f59e0b'}},
{code:'FO-24C',category:'route',symbol_key:'fiber_cable',name_ar:'كابل فايبر 24 كور',name_en:'24-core Fiber Cable',unit:'m',sort_order:12,default_properties:{cores:24,color:'#ec4899'}},
{code:'HDPE-40',category:'route',symbol_key:'hdpe_duct',name_ar:'ماسورة HDPE 40 مم',name_en:'HDPE 40mm',unit:'m',sort_order:13,default_properties:{color:'#14b8a6'}},
{code:'PVC-32',category:'route',symbol_key:'conduit',name_ar:'ماسورة PVC 32 مم',name_en:'PVC 32mm',unit:'m',sort_order:14,default_properties:{color:'#64748b'}},
{code:'TRENCH',category:'route',symbol_key:'trench',name_ar:'حفر مسار',name_en:'Trench',unit:'m',sort_order:15,default_properties:{color:'#f97316'}},
{code:'WIRE',category:'route',symbol_key:'suspension_wire',name_ar:'واير معلق',name_en:'Suspension wire',unit:'m',sort_order:16,default_properties:{color:'#94a3b8'}},
{code:'SP-1X16',category:'accessory',symbol_key:'splitter',name_ar:'سبليتر 1:16',name_en:'Splitter 1:16',unit:'ea',sort_order:20,default_properties:{}},
{code:'LGX-4U',category:'accessory',symbol_key:'lgx',name_ar:'LGX 4U',name_en:'LGX 4U',unit:'ea',sort_order:21,default_properties:{}}
];
const snapshot=normalizeEngineeringSnapshot({nodes:[
{id:'cab1',catalogCode:'MAIN-CAB-42U',x:210,y:360,width:124,height:84,label:'CAB-1',properties:{networkLevel:'main',boxNo:'01',capacity:288,ports:144,odfCode:'ODF-144',coreRange:'1-144'}},
{id:'cab2',catalogCode:'SUBCAB-22U',x:650,y:450,width:118,height:80,label:'CAB-2',properties:{networkLevel:'secondary',boxNo:'02',capacity:144,ports:48,coreRange:'145-288'}},
{id:'tb1',catalogCode:'TB-24C',x:520,y:210,width:96,height:68,label:'TB-1',properties:{networkLevel:'terminal',boxNo:'1',capacity:96,ports:16,coreRange:'1-96'}},
{id:'tb2',catalogCode:'TB-24C',x:520,y:585,width:96,height:68,label:'TB-2',properties:{networkLevel:'terminal',boxNo:'2',capacity:96,ports:16,coreRange:'97-192'}},
{id:'tb3',catalogCode:'TB-24C',x:990,y:230,width:96,height:68,label:'TB-3',properties:{networkLevel:'terminal',boxNo:'3',capacity:96,ports:16,coreRange:'193-288'}},
{id:'tb4',catalogCode:'TB-24C',x:990,y:570,width:96,height:68,label:'TB-4',properties:{networkLevel:'terminal',boxNo:'4',capacity:96,ports:16,coreRange:'289-384'}},
{id:'joint',catalogCode:'JOINT',x:365,y:435,width:72,height:58,label:'J-1',properties:{networkLevel:'distribution'}},
{id:'mh',catalogCode:'MH-TEL',x:775,y:360,width:82,height:82,label:'MH-1',properties:{networkLevel:'distribution'}}],routes:[
{id:'r1',catalogCode:'DUCT-4W-7/3.5',sourceNodeId:'cab1',targetNodeId:'joint',points:[{x:210,y:360},{x:365,y:435}],label:'MAIN-01',manualLength:89.98,properties:{networkLevel:'main',installation:'underground',ways:4,diameter:'7/3.5',cableCode:'FO-24C',fiberCores:24}},
{id:'r2',catalogCode:'DUCT-4W-7/3.5',sourceNodeId:'joint',targetNodeId:'tb1',points:[{x:365,y:435},{x:420,y:210},{x:520,y:210}],label:'BRANCH-01',manualLength:111.3,properties:{networkLevel:'secondary',installation:'underground',ways:4,diameter:'7/3.5',cableCode:'FO-24C',fiberCores:24}},
{id:'r3',catalogCode:'DUCT-12W-12/8',sourceNodeId:'joint',targetNodeId:'tb2',points:[{x:365,y:435},{x:420,y:585},{x:520,y:585}],label:'BRANCH-02',manualLength:27.24,properties:{networkLevel:'secondary',installation:'underground',ways:12,diameter:'12/8',cableCode:'FO-24C',fiberCores:24}},
{id:'r4',catalogCode:'DUCT-4W-7/3.5',sourceNodeId:'cab2',targetNodeId:'mh',points:[{x:650,y:450},{x:775,y:360}],label:'DISTRIBUTION-LONG-LABEL-FOR-AUTO-SIZE',manualLength:54.62,properties:{networkLevel:'distribution',installation:'underground',ways:4,diameter:'7/3.5',cableCode:'FO-24C',fiberCores:24}},
{id:'r5',catalogCode:'FO-24C',sourceNodeId:'mh',targetNodeId:'tb3',points:[{x:775,y:360},{x:880,y:230},{x:990,y:230}],label:'FIBER-01',manualLength:42.6,properties:{networkLevel:'drop',installation:'underground',fiberCores:24}},
{id:'r6',catalogCode:'FO-24C',sourceNodeId:'mh',targetNodeId:'tb4',points:[{x:775,y:360},{x:880,y:570},{x:990,y:570}],label:'FIBER-02',manualLength:63.4,properties:{networkLevel:'drop',installation:'underground',fiberCores:24}}]});
const tables={engineering_drawings:[{id:'d1',company_id:'c1',project_id:'p1',site_id:'s1',drawing_no:'P001-CAD-TEST',title:'Secondary Fiber Network',discipline:'fiber',drawing_type:'secondary_network',current_revision_id:'rev1',status:'draft',updated_at:new Date().toISOString()}],engineering_revisions:[{id:'rev1',company_id:'c1',drawing_id:'d1',revision_number:0,revision_code:'R1',status:'draft',snapshot,sheet_settings:{width:1600,height:1000,framePanelWidth:310,grid:20,meterPerGrid:1,showGrid:true,legend:true,titleBlock:true,titleBlockData:{project:'First Fiber Optical',site:'Test Site',client:'Optimum Client',consultant:'Optimum Consultant'}},lock_version:1,updated_at:new Date().toISOString()}],engineering_revision_boq:[],engineering_review_marks:[],engineering_review_mark_updates:[],engineering_catalog_items:catalog,engineering_assets:[],engineering_document_links:[]};
const api={select:async(table)=>structuredClone(tables[table]||[]),rpc:async()=>({}),createSignedUrl:async()=>'',uploadObject:async()=>{},deleteObject:async()=>{}};
let module;
const render=()=>{};
const icon=(name,size=18)=>`<span class="mock-icon" style="width:${size}px;height:${size}px">${({mousePointer:'↖',move:'✥',box:'▣',link:'⌁',text:'T',comment:'◉',undo:'↶',redo:'↷',trash:'⌫',copy:'▢',archive:'✂',paperclip:'▣',zoomIn:'⊕',zoomOut:'⊖',fit:'▧',circle:'◎',maximize:'100',map:'▤',save:'◇',download:'⇩',bell:'♢',help:'?',settings:'⚙',chevronDown:'⌄',plus:'+',search:'⌕',close:'×',upload:'⇧',info:'i'})[name]||'◇'}</span>`;
const deps={api,state:{companyId:'c1',company:{id:'c1',name:'Optimum Engineering'},prefs:{locale:'ar'},projects:[{id:'p1',code:'P001',name:'First Fiber Optical'}],sites:[{id:'s1',project_id:'p1',code:'S01',name:'Test Site'}],folders:[],documents:[],selectedProjectId:'p1',selectedSiteId:'s1'},can:()=>true,L:(ar,en)=>ar,e:(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),icon,toast:()=>{},formError:console.error,openDialog:()=>{},openDrawer:()=>{},closeOverlay:()=>{},render,pageHeader:()=>'',emptyState:()=>'',formatDateTime:()=>'',loadFilesData:async()=>{},openDocumentDetails:()=>{}};
module=createEngineeringModule(deps);await module.load();await module.openDrawing('d1','rev1');module.state.zoom=.60;module.state.pendingView=null;
const interactionBaseline=structuredClone(module.state.snapshot);
module.state.selection=['node:cab1','node:tb1'];module.state.selected={kind:'node',id:'cab1'};
await module.handleAction('engineering-copy',{});const beforePaste=module.state.snapshot.nodes.length;
await module.handleAction('engineering-paste',{});assert.equal(module.state.snapshot.nodes.length,beforePaste+2);assert.equal(module.state.selection.length,2);
module.state.snapshot=interactionBaseline;module.state.selection=[];module.state.selected=null;module.state.clipboard=null;
const css=await readFile(new URL('../assets/styles.css',import.meta.url),'utf8');
const html=`<!doctype html><html lang="ar" dir="rtl" data-theme="dark"><head><meta charset="utf-8"><style>@page{size:1648px 927px;margin:0}html,body{width:1648px;height:927px;overflow:hidden}.mock-icon{display:inline-grid;place-items:center;font-weight:800}${css}</style></head><body><div id="app">${module.page()}</div></body></html>`;
await writeFile(new URL('../docs/samples/cad-usability-4.11-preview.html',import.meta.url),html);
const sampleSvg=engineeringSnapshotSvg(module.state.snapshot,{settings:module.state.settings,catalog:module.state.catalog,metadata:{drawingNo:'P001-CAD-TEST',title:'Secondary Fiber Network',project:'First Fiber Optical',site:'Test Site',client:'Optimum Client',consultant:'Optimum Consultant',company:'Optimum Engineering',revision:'R1',status:'DRAFT'},locale:'ar'});
await writeFile(new URL('../docs/samples/cad-usability-4.11-demo.svg',import.meta.url),sampleSvg);
await writeFile(new URL('../docs/samples/cad-usability-4.11-demo.dxf',import.meta.url),exportEngineeringDxf(module.state.snapshot,{drawingNo:'P001-CAD-TEST',title:'Secondary Fiber Network',project:'First Fiber Optical',site:'Test Site',revision:'R1'},{...module.state.settings,catalog:module.state.catalog}));
console.log('rendered');process.exit(0);
