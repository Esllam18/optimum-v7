import {writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeEngineeringSnapshot,engineeringSnapshotSvg,exportEngineeringDxf} from '../assets/engineering.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(root,'docs/samples');
await mkdir(out,{recursive:true});
const catalog=[
 {code:'MAIN-CAB-42U',category:'node',symbol_key:'main_cabinet',name_ar:'كابينة رئيسية 42U',name_en:'42U Main Cabinet',default_properties:{color:'#2563eb'}},
 {code:'SUBCAB-22U',category:'node',symbol_key:'sub_cabinet',name_ar:'كابينة فرعية 22U',name_en:'22U Sub Cabinet',default_properties:{color:'#2563eb'}},
 {code:'TB-24C',category:'node',symbol_key:'termination_box',name_ar:'بوكس نهاية 24 كور',name_en:'24C Termination Box',default_properties:{color:'#16a34a'}},
 {code:'TB-96C',category:'node',symbol_key:'termination_box',name_ar:'بوكس نهاية 96 كور',name_en:'96C Termination Box',default_properties:{color:'#16a34a'}},
 {code:'JOINT-96C',category:'node',symbol_key:'joint',name_ar:'وصلة 96 كور',name_en:'96C Fiber Joint',default_properties:{color:'#7c3aed'}},
 {code:'MH-TDM',category:'node',symbol_key:'manhole',name_ar:'منهول مزود TDM',name_en:'TDM Manhole',default_properties:{color:'#475569'}},
 {code:'DUCT-4W-7/3.5',category:'route',symbol_key:'microduct',name_ar:'ميكرو دكت 4 مسار 7/3.5',name_en:'4W 7/3.5 Microduct',default_properties:{color:'#16a34a',dxf_layer:'DUCT_4W_7_3_5'}},
 {code:'DUCT-1W-7/3.5',category:'route',symbol_key:'microduct',name_ar:'ميكرو دكت 1 مسار 7/3.5',name_en:'1W 7/3.5 Microduct',default_properties:{color:'#e11d48',dxf_layer:'DUCT_1W_7_3_5'}},
 {code:'FO-24C',category:'route',symbol_key:'fiber_cable',name_ar:'كابل فايبر 24 كور',name_en:'24C Fiber Cable',default_properties:{color:'#0f766e',dxf_layer:'FIBER_24C'}}
];
const snapshot=normalizeEngineeringSnapshot({
 nodes:[
  {id:'cab1',catalogCode:'MAIN-CAB-42U',x:170,y:510,label:'CAB-1',properties:{boxNo:'01',capacity:288,ports:144,odfCode:'ODF-144',splitterCode:'SP-1X16'}},
  {id:'cab2',catalogCode:'SUBCAB-22U',x:710,y:525,label:'CAB-2',properties:{boxNo:'02',capacity:144,ports:72,odfCode:'ODF-72',splitterCode:'SP-1X8'}},
  {id:'tb1',catalogCode:'TB-96C',x:500,y:235,label:'TB-1',properties:{boxNo:'1',capacity:96,ports:16,coreRange:'1-96'}},
  {id:'tb2',catalogCode:'TB-96C',x:500,y:735,label:'TB-2',properties:{boxNo:'2',capacity:96,ports:16,coreRange:'97-192'}},
  {id:'tb3',catalogCode:'TB-24C',x:1080,y:220,label:'TB-3',properties:{boxNo:'3',capacity:24,ports:8,coreRange:'193-216',distance:111.3}},
  {id:'tb4',catalogCode:'TB-24C',x:1080,y:490,label:'TB-4',properties:{boxNo:'4',capacity:24,ports:8,coreRange:'217-240',distance:27.24}},
  {id:'j1',catalogCode:'JOINT-96C',x:500,y:450,label:'J-1',properties:{}},
  {id:'mh1',catalogCode:'MH-TDM',x:710,y:720,label:'MH-1',properties:{}}
 ],
 routes:[
  {id:'r1',catalogCode:'DUCT-4W-7/3.5',sourceNodeId:'cab1',targetNodeId:'tb1',points:[{x:170,y:510},{x:350,y:510},{x:350,y:235},{x:500,y:235}],label:'MAIN ROUTE',labelOffset:{x:0,y:-38},properties:{fromLabel:'CAB-1',toLabel:'TB-1',ways:4,diameter:'7/3.5',cableCode:'FO-24C',fiberCores:24}},
  {id:'r2',catalogCode:'DUCT-4W-7/3.5',sourceNodeId:'cab1',targetNodeId:'tb2',points:[{x:170,y:510},{x:350,y:510},{x:350,y:735},{x:500,y:735}],label:'DISTRIBUTION BRANCH 01',labelOffset:{x:25,y:38},properties:{fromLabel:'CAB-1',toLabel:'TB-2',ways:4,diameter:'7/3.5',cableCode:'FO-24C',fiberCores:24}},
  {id:'r3',catalogCode:'DUCT-1W-7/3.5',sourceNodeId:'tb1',targetNodeId:'j1',points:[{x:500,y:235},{x:500,y:450}],label:'JOINT LINK',labelOffset:{x:75,y:0},properties:{fromLabel:'TB-1',toLabel:'J-1',ways:1,diameter:'7/3.5',cableCode:'FO-24C',fiberCores:24}},
  {id:'r4',catalogCode:'DUCT-4W-7/3.5',sourceNodeId:'j1',targetNodeId:'cab2',points:[{x:500,y:450},{x:610,y:450},{x:610,y:525},{x:710,y:525}],label:'SECONDARY ROUTE',labelOffset:{x:20,y:-38},properties:{fromLabel:'J-1',toLabel:'CAB-2',ways:4,diameter:'7/3.5',cableCode:'FO-24C',fiberCores:24}},
  {id:'r5',catalogCode:'DUCT-4W-7/3.5',sourceNodeId:'cab2',targetNodeId:'tb3',points:[{x:710,y:525},{x:860,y:525},{x:860,y:220},{x:1080,y:220}],label:'TB-3 BRANCH',labelOffset:{x:15,y:-38},properties:{fromLabel:'CAB-2',toLabel:'TB-3',ways:4,diameter:'7/3.5',cableCode:'FO-24C',fiberCores:24}},
  {id:'r6',catalogCode:'DUCT-1W-7/3.5',sourceNodeId:'cab2',targetNodeId:'tb4',points:[{x:710,y:525},{x:900,y:525},{x:900,y:490},{x:1080,y:490}],label:'TB-4 BRANCH',labelOffset:{x:0,y:42},properties:{fromLabel:'CAB-2',toLabel:'TB-4',ways:1,diameter:'7/3.5',cableCode:'FO-24C',fiberCores:24}},
  {id:'r7',catalogCode:'FO-24C',sourceNodeId:'tb2',targetNodeId:'mh1',points:[{x:500,y:735},{x:710,y:720}],label:'FEEDER CABLE',labelOffset:{x:0,y:-32},properties:{fromLabel:'TB-2',toLabel:'MH-1',cableCode:'FO-24C',fiberCores:24}}
 ],
 generalNotes:'Secondary fiber distribution schematic — coordinated for AutoCAD and quantity takeoff.'
});
const settings={width:1600,height:1000,titleBlock:true,framePanelWidth:310,grid:20,meterPerGrid:1,scale:'NTS',catalog,titleBlockData:{client:'Optimum Client',consultant:'Engineering Consultant',subContractor:'Optimum Engineering'}};
const metadata={drawingNo:'P001-FIBER-001',title:'Secondary Fiber Network',project:'Shatanof Fiber Project',site:'Zone 01',company:'Optimum Engineering',revision:'R1',status:'FOR REVIEW',date:'2026-08-05'};
await writeFile(resolve(out,'cad-freeze-4.13-demo.svg'),engineeringSnapshotSvg(snapshot,{settings,catalog,metadata,locale:'en',validation:{issues:[],errors:[],warnings:[],suggestions:[]}}));
await writeFile(resolve(out,'cad-freeze-4.13-demo.dxf'),exportEngineeringDxf(snapshot,metadata,settings));
await writeFile(resolve(out,'cad-freeze-4.13-snapshot.json'),JSON.stringify({snapshot,settings,metadata,catalog},null,2));
console.log('Generated Phase 4.13 CAD freeze samples.');
