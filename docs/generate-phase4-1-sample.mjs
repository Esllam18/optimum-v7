import {writeFile} from 'node:fs/promises';
import {normalizeEngineeringSnapshot,calculateEngineeringTakeoff,validateEngineeringSnapshot,engineeringSnapshotSvg,exportEngineeringDxf} from '../assets/engineering.js';
const catalog=[
 {code:'SUBCAB-22U',category:'node',symbol_key:'sub_cabinet',name_ar:'كابينة فرعية 22U',name_en:'22U Sub Cabinet',unit:'ea',default_properties:{capacityU:22}},
 {code:'MH-TEL',category:'node',symbol_key:'manhole',name_ar:'غرفة اتصالات',name_en:'Telecom Manhole',unit:'ea',default_properties:{}},
 {code:'TB-24C',category:'node',symbol_key:'termination_box',name_ar:'بوكس نهاية 24 كور',name_en:'24-core Termination Box',unit:'ea',default_properties:{cores:24}},
 {code:'DUCT-4W-7/3.5',category:'route',symbol_key:'microduct',name_ar:'ميكرو دكت 4 مسار 7/3.5',name_en:'4-way Microduct 7/3.5',unit:'m',default_properties:{ways:4,diameter:'7/3.5',color:'#16a34a'}},
 {code:'FO-24C',category:'route',symbol_key:'fiber_cable',name_ar:'كابل فايبر 24 كور',name_en:'24-core Fiber Cable',unit:'m',default_properties:{cores:24,color:'#f59e0b'}},
 {code:'ODF-144',category:'accessory',symbol_key:'odf',name_ar:'ODF سعة 144',name_en:'ODF 144',unit:'ea',default_properties:{ports:144}},
 {code:'SP-1X16',category:'accessory',symbol_key:'splitter',name_ar:'سبليتر 1:16',name_en:'Splitter 1:16',unit:'ea',default_properties:{ratio:'1:16'}},
 {code:'CONNECTOR',category:'accessory',symbol_key:'connector',name_ar:'كونكتور ميكرو دكت',name_en:'Microduct Connector',unit:'ea',default_properties:{}}
];
const snapshot=normalizeEngineeringSnapshot({
 nodes:[
  {id:'cab-main',catalogCode:'SUBCAB-22U',x:210,y:360,width:130,height:90,label:'CAB-M01',properties:{networkLevel:'main',capacity:144,ports:144,odfCode:'ODF-144',notes:'Main distribution cabinet'}},
  {id:'mh-01',catalogCode:'MH-TEL',x:600,y:360,width:90,height:90,label:'MH-01',properties:{networkLevel:'distribution',capacity:96,notes:'Main telecom chamber'}},
  {id:'tb-01',catalogCode:'TB-24C',x:980,y:220,width:90,height:64,label:'TB-01',properties:{networkLevel:'terminal',boxNo:'01',capacity:24,splitterCode:'SP-1X16',coreRange:'1-24'}},
  {id:'tb-02',catalogCode:'TB-24C',x:980,y:510,width:90,height:64,label:'TB-02',properties:{networkLevel:'terminal',boxNo:'02',capacity:24,splitterCode:'SP-1X16',coreRange:'25-48'}}
 ],
 routes:[
  {id:'r-main',catalogCode:'DUCT-4W-7/3.5',sourceNodeId:'cab-main',targetNodeId:'mh-01',points:[{x:210,y:360},{x:600,y:360}],label:'MAIN 4W DUCT',manualLength:42,properties:{networkLevel:'main',installation:'underground',pathStyle:'straight',ways:4,diameter:'7/3.5',cableCode:'FO-24C',fiberCores:24,connectorCount:2,fromLabel:'CAB-M01',toLabel:'MH-01'}},
  {id:'r-sec-1',catalogCode:'DUCT-4W-7/3.5',sourceNodeId:'mh-01',targetNodeId:'tb-01',points:[{x:600,y:360},{x:760,y:220},{x:980,y:220}],label:'SECONDARY-01',manualLength:55,properties:{networkLevel:'secondary',installation:'underground',pathStyle:'polyline',ways:4,diameter:'7/3.5',cableCode:'FO-24C',fiberCores:24,connectorCount:2,fromLabel:'MH-01',toLabel:'TB-01'}},
  {id:'r-sec-2',catalogCode:'DUCT-4W-7/3.5',sourceNodeId:'mh-01',targetNodeId:'tb-02',points:[{x:600,y:360},{x:760,y:510},{x:980,y:510}],label:'SECONDARY-02',manualLength:61,properties:{networkLevel:'secondary',installation:'underground',pathStyle:'polyline',ways:4,diameter:'7/3.5',cableCode:'FO-24C',fiberCores:24,connectorCount:2,fromLabel:'MH-01',toLabel:'TB-02'}}
 ],
 annotations:[{id:'note-1',x:175,y:120,text:'OPTIMUM FIBER NETWORK — DIGITAL SCHEMATIC',size:24}]
});
const settings={width:1600,height:1000,grid:20,meterPerGrid:1,showGrid:true,legend:true,titleBlock:true,scale:'NTS'};
const validation=validateEngineeringSnapshot(snapshot,catalog,settings);
const svg=engineeringSnapshotSvg(snapshot,{catalog,settings,validation,selected:{kind:'route',id:'r-sec-1'},metadata:{company:'Optimum Engineering',project:'First Fiber Optical',site:'Site A',drawingNo:'P001-FIBER-SLD-001',title:'Secondary Fiber Network',revision:'R1',status:'DRAFT'},locale:'en'});
const dxf=exportEngineeringDxf(snapshot,{drawingNo:'P001-FIBER-SLD-001',title:'Secondary Fiber Network'},settings);
const boq=calculateEngineeringTakeoff(snapshot,catalog,settings);
const esc=(v)=>{const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s};
const csv='\ufeff'+[['Code','Category','Description','Unit','Quantity','Source'],...boq.map(x=>[x.code,x.category,x.description_en,x.unit,x.quantity,x.source_kind])].map(row=>row.map(esc).join(',')).join('\n');
await writeFile(new URL('./samples/cad-studio-demo.svg',import.meta.url),svg);
await writeFile(new URL('./samples/cad-studio-demo.dxf',import.meta.url),dxf);
await writeFile(new URL('./samples/cad-studio-demo-boq.csv',import.meta.url),csv);
await writeFile(new URL('./samples/cad-studio-demo-validation.json',import.meta.url),JSON.stringify(validation,null,2));
console.log({boqLines:boq.length,validation});
