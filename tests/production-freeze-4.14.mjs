import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  createEngineeringModule,
  engineeringSnapshotSvg,
  exportEngineeringDxfCompatible,
  normalizeEngineeringSnapshot
} from '../assets/engineering.js';

const tests=[];
const test=(name,fn)=>tests.push({name,fn});
const sourceHas=(source,pattern,message)=>assert.ok(pattern.test(source),message);

const catalog=[
  {code:'SUBCAB-22U',category:'node',symbol_key:'sub_cabinet',name_ar:'كابينة فرعية',name_en:'Sub cabinet',default_properties:{color:'#2563eb'}},
  {code:'TB-24C',category:'node',symbol_key:'termination_box',name_ar:'بوكس نهاية',name_en:'Termination box',default_properties:{color:'#16a34a'}},
  {code:'DUCT-4W-7/3.5',category:'route',symbol_key:'microduct',name_ar:'ميكرو دكت',name_en:'Microduct',default_properties:{color:'#ff8a00',dxf_layer:'DUCT 4W/7-3.5'}},
  {code:'FO-24C',category:'route',symbol_key:'fiber_cable',name_ar:'كابل فايبر',name_en:'Fiber cable',default_properties:{color:'#ef4444',dxf_layer:'FO_24C'}}
];

test('snapshot v8 fixes element data inside nodes while preserving route and annotation transforms',()=>{
  const snapshot=normalizeEngineeringSnapshot({
    version:6,
    nodes:[{
      id:'n1',catalogCode:'TB-24C',x:120,y:180,height:80,label:'TB-01',
      labelOffset:{x:34,y:-34},labelText:'سطر أول\nLINE 2',labelFontSize:99,
      labelRotation:90,labelFlipX:true,labelFlipY:true,labelAlign:'end',labelBackground:false
    }],
    routes:[{
      id:'r1',catalogCode:'DUCT-4W-7/3.5',points:[{x:120,y:180},{x:520,y:180}],
      labelRotation:-30,labelFlipX:true,labelFlipY:true
    }],
    annotations:[{
      id:'a1',x:260,y:260,text:'A\nB',size:4,rotation:45,align:'middle',
      flipX:true,flipY:true,bold:false,background:true,lineHeight:9
    }]
  });

  assert.equal(snapshot.version,8);
  assert.deepEqual(snapshot.nodes[0].labelOffset,{x:0,y:0},'element data must be fixed inside its node');
  assert.equal(snapshot.nodes[0].labelText,'سطر أول\nLINE 2');
  assert.equal(snapshot.nodes[0].labelFontSize,18);
  assert.equal(snapshot.nodes[0].labelRotation,0);
  assert.equal(snapshot.nodes[0].labelFlipX,false);
  assert.equal(snapshot.nodes[0].labelFlipY,false);
  assert.equal(snapshot.nodes[0].labelAlign,'middle');
  assert.equal(snapshot.nodes[0].labelBackground,false);
  assert.equal(snapshot.routes[0].labelRotation,-30);
  assert.equal(snapshot.routes[0].labelFlipX,true);
  assert.equal(snapshot.routes[0].labelFlipY,true);
  assert.equal(snapshot.annotations[0].size,8);
  assert.equal(snapshot.annotations[0].rotation,45);
  assert.equal(snapshot.annotations[0].align,'middle');
  assert.equal(snapshot.annotations[0].flipX,true);
  assert.equal(snapshot.annotations[0].flipY,true);
  assert.equal(snapshot.annotations[0].bold,false);
  assert.equal(snapshot.annotations[0].background,true);
  assert.equal(snapshot.annotations[0].lineHeight,2);

  const nativeV7=normalizeEngineeringSnapshot({version:7,nodes:[{id:'n2',labelOffset:{x:34,y:-34},labelRotation:180,labelFlipX:true}]});
  assert.deepEqual(nativeV7.nodes[0].labelOffset,{x:0,y:0});
  assert.equal(nativeV7.nodes[0].labelRotation,0);
  assert.equal(nativeV7.nodes[0].labelFlipX,false);
});

test('SVG keeps element data fixed inside the node and route/annotation text independently transformable',()=>{
  const snapshot=normalizeEngineeringSnapshot({
    version:7,
    nodes:[{
      id:'n-label',catalogCode:'TB-24C',x:320,y:220,label:'TB-01',labelText:'DATA ONE\nبيانات 2',
      labelOffset:{x:10,y:20},labelFontSize:12,labelRotation:90,labelFlipX:true,labelAlign:'end',labelBackground:true,
      properties:{boxNo:'01',capacity:24,ports:8}
    }],
    routes:[{
      id:'r-label',catalogCode:'DUCT-4W-7/3.5',points:[{x:320,y:220},{x:620,y:220}],
      label:'MAIN\nROUTE',labelRotation:15,labelFlipY:true,properties:{ways:4,diameter:'7/3.5',cableCode:'FO-24C',fiberCores:24}
    }],
    annotations:[{
      id:'a-label',x:410,y:360,text:'NOTE ONE\nملاحظة 2',size:18,rotation:30,align:'middle',flipY:true,background:true,lineHeight:1.5
    }]
  });
  const svg=engineeringSnapshotSvg(snapshot,{catalog,settings:{width:1000,height:700,titleBlock:false,showGrid:false},locale:'ar'});

  assert.match(svg,/^<\?xml[^>]+><svg\b[^>]*\bdir="ltr"/);
  assert.doesNotMatch(svg,/eng-node-data-label|data-eng-node-label/);
  assert.match(svg,/class="eng-node-extra">DATA ONE<\/text>/);
  assert.match(svg,/class="eng-node-extra">بيانات 2<\/text>/);
  assert.match(svg,/data-eng-route-label="r-label" transform="translate\([^)]*\) rotate\(15\) scale\(1 -1\)"/);
  assert.match(svg,/data-eng-text="a-label" transform="translate\(410 360\) rotate\(30\) scale\(1 -1\)"/);
  assert.match(svg,/<tspan[^>]*>NOTE ONE<\/tspan>/);
  assert.match(svg,/<tspan[^>]*>ملاحظة 2<\/tspan>/);
  assert.doesNotMatch(svg,/class="eng-node-label-bg"/);
  assert.match(svg,/class="eng-annotation-bg"/);
});

test('compatible DXF is a bounded ASCII R12 document with editable layers and entities',()=>{
  const longArabic='بيانات عربية طويلة للاختبار '.repeat(28);
  const snapshot=normalizeEngineeringSnapshot({
    version:7,
    nodes:[
      {id:'cab',catalogCode:'SUBCAB-22U',x:140,y:260,label:'CAB-1',labelText:longArabic,properties:{boxNo:'1',capacity:144,ports:36,odfCode:'ODF-144'}},
      {id:'tb',catalogCode:'TB-24C',x:720,y:260,label:'TB-1',properties:{boxNo:'1',capacity:24,ports:8}}
    ],
    routes:[{
      id:'route',catalogCode:'DUCT-4W-7/3.5',points:[{x:140,y:260},{x:430,y:170},{x:720,y:260}],
      sourceNodeId:'cab',targetNodeId:'tb',label:longArabic,manualLength:91,
      properties:{fromLabel:'CAB-1',toLabel:'TB-1',ways:4,diameter:'7/3.5',cableCode:'FO-24C',fiberCores:24}
    }],
    annotations:[{id:'note',x:360,y:420,text:longArabic,size:14,rotation:20}]
  });
  const dxf=exportEngineeringDxfCompatible(snapshot,{drawingNo:'P-001',title:longArabic,revision:'R2'},{catalog,width:1000,height:700,titleBlock:true,framePanelWidth:310});
  const lines=dxf.trimEnd().split(/\r?\n/);

  assert.equal(lines.length%2,0,'every DXF group code must have one value');
  for(let index=0;index<lines.length;index+=2)assert.match(lines[index],/^-?\d+$/);
  assert.ok([...dxf].every((character)=>character.codePointAt(0)<=0x7f),'DXF must be ASCII-safe');
  assert.match(dxf,/\r\n1\r\nAC1009\r\n/);
  assert.match(dxf,/\r\n0\r\nPOLYLINE\r\n/);
  assert.match(dxf,/\r\n0\r\nVERTEX\r\n/);
  assert.match(dxf,/\r\n0\r\nSEQEND\r\n/);
  assert.match(dxf,/\r\n0\r\nTEXT\r\n/);
  assert.match(dxf,/\r\n2\r\nFRAME\r\n/);
  assert.match(dxf,/\r\n2\r\nDUCT_4W_7-3_5\r\n/);
  assert.doesNotMatch(dxf,/LWPOLYLINE|AcDb[A-Za-z]+/,'R12 output must not contain post-R12 subclass records');
  const groupOneValues=[];
  for(let index=0;index<lines.length;index+=2)if(lines[index]==='1')groupOneValues.push(lines[index+1]);
  assert.ok(groupOneValues.some((value)=>value.includes('\\U+')),'Arabic text must be encoded as ASCII Unicode escapes');
  assert.ok(groupOneValues.every((value)=>value.length<=230),'every TEXT group-1 value must stay below the conservative line limit');
  assert.ok(dxf.endsWith('0\r\nEOF\r\n'));
});

test('dropping a node on a route splits it, connects both halves and preserves manual length',async()=>{
  globalThis.document={querySelector:()=>null,querySelectorAll:()=>[],contains:()=>false};
  globalThis.window={innerWidth:1600,innerHeight:900,open:()=>null,addEventListener:()=>{}};
  globalThis.requestAnimationFrame=()=>0;
  globalThis.confirm=()=>true;
  globalThis.sessionStorage={setItem:()=>{},getItem:()=>null,removeItem:()=>{}};
  globalThis.location={hash:''};
  globalThis.CSS={escape:(value)=>String(value)};
  globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};

  const initial=normalizeEngineeringSnapshot({version:7,nodes:[
    {id:'left',catalogCode:'SUBCAB-22U',x:100,y:200,label:'CAB-1'},
    {id:'right',catalogCode:'TB-24C',x:700,y:200,label:'TB-2'}
  ],routes:[{
    id:'main',catalogCode:'DUCT-4W-7/3.5',points:[{x:100,y:200},{x:700,y:200}],
    sourceNodeId:'left',targetNodeId:'right',label:'MAIN',manualLength:120,
    properties:{fromLabel:'CAB-1',toLabel:'TB-2',pathStyle:'straight',ways:4,diameter:'7/3.5'}
  }]});
  const tables={
    engineering_drawings:[{id:'drawing',company_id:'company',project_id:'project',site_id:'site',folder_id:'folder',drawing_no:'P-001',title:'Route split',current_revision_id:'revision',status:'draft'}],
    engineering_revisions:[{id:'revision',company_id:'company',drawing_id:'drawing',revision_number:1,revision_code:'R1',status:'draft',snapshot:initial,sheet_settings:{width:1000,height:700,titleBlock:false},lock_version:1}],
    engineering_revision_boq:[],engineering_review_marks:[],engineering_review_mark_updates:[],engineering_catalog_items:catalog,engineering_assets:[],engineering_document_links:[]
  };
  const api={
    user:{email:'qa@example.test'},select:async(table)=>structuredClone(tables[table]||[]),rpc:async()=>({}),
    createSignedUrl:async()=>'',uploadObject:async()=>{},deleteObject:async()=>{}
  };
  const state={companyId:'company',company:{id:'company',name:'Optimum'},profile:{full_name:'QA'},prefs:{locale:'en'},projects:[{id:'project',name:'Project'}],sites:[{id:'site',project_id:'project',name:'Site'}],folders:[{id:'folder',project_id:'project',site_id:'site',name:'Drawings'}],documents:[]};
  const deps={
    api,state,can:()=>true,L:(ar,en)=>en||ar,e:(value='')=>String(value),icon:()=>'',toast:()=>{},formError:(error)=>{throw error;},
    openDialog:()=>{},openDrawer:()=>{},closeOverlay:()=>{},render:()=>{},pageHeader:()=>'',emptyState:()=>'',formatDateTime:(value)=>String(value||''),
    loadFilesData:async()=>{},openDocumentDetails:()=>{}
  };
  const module=createEngineeringModule(deps);
  await module.load();
  await module.openDrawing('drawing','revision');
  await module.handleSubmit('engineering-node-create',{dataset:{code:'TB-24C'}},{
    catalog_code:'TB-24C',x:400,y:207,label:'TB-MID',network_level:'secondary',box_no:'M',capacity:'24',ports:'8'
  });

  const middle=module.state.snapshot.nodes.find((node)=>node.label==='TB-MID');
  assert.ok(middle);
  assert.equal(middle.x,400);
  assert.equal(middle.y,200);
  assert.equal(module.state.snapshot.routes.length,2);
  const first=module.state.snapshot.routes.find((route)=>route.targetNodeId===middle.id);
  const second=module.state.snapshot.routes.find((route)=>route.sourceNodeId===middle.id);
  assert.ok(first,'first route half must terminate at the inserted node');
  assert.ok(second,'second route half must start at the inserted node');
  assert.equal(first.sourceNodeId,'left');
  assert.equal(second.targetNodeId,'right');
  assert.equal(first.label,'MAIN-A');
  assert.equal(second.label,'MAIN-B');
  assert.ok(Math.abs(first.manualLength+second.manualLength-120)<0.002,'manual route length must be conserved');
});

const engineeringSource=readFileSync(new URL('../assets/engineering.js',import.meta.url),'utf8');
const migrationDir=fileURLToPath(new URL('../supabase/migrations/',import.meta.url));
const migrationSource=readdirSync(migrationDir).filter((name)=>name.endsWith('.sql')).map((name)=>readFileSync(join(migrationDir,name),'utf8')).join('\n');

test('CAD-like paste enters persistent placement mode and places copies at each click',()=>{
  sourceHas(engineeringSource,/action==='engineering-paste'\)\{if\(eng\.pasteMode\)stopPasteMode\(\);else startPasteMode\(\);\}/,'Paste action must toggle persistent placement mode');
  sourceHas(engineeringSource,/eng\.tool==='paste'&&eng\.pasteMode[\s\S]{0,220}pasteSelection\(point,\{stayActive:true\}\)/,'Each canvas click must place a copy and keep paste active');
  sourceHas(engineeringSource,/Esc[\s\S]{0,500}pasteMode|pasteMode[\s\S]{0,500}Escape/,'Escape must leave persistent paste mode');
});

test('reference images are embedded locally, persisted after upload and reused by SVG/print export',()=>{
  sourceHas(engineeringSource,/async function blobDataUrl\(/,'Image blobs must support data-URL embedding');
  sourceHas(engineeringSource,/localDataUrl=file\.type\.startsWith\('image\/'\)\?await blobDataUrl\(file\):null/,'Reference upload must create an immediate embedded preview');
  sourceHas(engineeringSource,/referenceUrls\.set\(reservation\.asset_id,localDataUrl\|\|/,'Uploaded image must remain available by its permanent asset id');
  sourceHas(engineeringSource,/eng\.snapshot\.reference=\{assetId:reservation\.asset_id[\s\S]{0,220}eng\.dirty=true;await save\(\{force:true,silent:true\}\)/,'Uploaded reference id must be persisted in the drawing snapshot');
  sourceHas(engineeringSource,/fetch\(url\)[\s\S]{0,160}blobDataUrl\(await response\.blob\(\)\)/,'Reloaded signed images must be embedded before SVG/print export');
});

test('saving over a linked Files document creates a new version and receives the selected document id',()=>{
  sourceHas(engineeringSource,/begin_new_version_upload/,'Linked document export must reserve a new Files version');
  sourceHas(engineeringSource,/engineering-save-files'\)await saveExportToFiles\(data\.format,data\.folder_id,data\.document_id\)/,'The save form must pass its selected document id');
  sourceHas(engineeringSource,/Previous versions remain available|previous version remains available/i,'The UI must explain that previous file versions remain available');
});

test('an approved or older revision can be restored only into a new editable revision',()=>{
  sourceHas(migrationSource,/create(?:\s+or\s+replace)?\s+function\s+public\.create_engineering_revision_from\s*\(/i,'A migration must define create_engineering_revision_from');
  sourceHas(migrationSource,/p_source_revision_id/i,'Revision restore RPC must take an explicit source revision id');
  sourceHas(migrationSource,/restored_from_revision_id|source_revision_id[\s\S]{0,500}restored_previous_version/i,'Revision restore must leave auditable source-revision and restore markers');
  sourceHas(engineeringSource,/create_engineering_revision_from/,'The editor must call the restore-as-new-revision RPC');
  sourceHas(engineeringSource,/engineering-restore-revision|engineering-edit-approved/,'The editor must expose restore/edit-approved actions');
});

let failures=0;
for(const {name,fn} of tests){
  try{
    await fn();
    console.log(`✓ ${name}`);
  }catch(error){
    failures++;
    console.error(`✗ ${name}`);
    console.error(`  ${String(error?.message||error).replace(/\n/g,'\n  ')}`);
  }
}

if(failures){
  console.error(`\nPhase 4.14 production freeze: ${failures}/${tests.length} checks failed.`);
  process.exit(1);
}
console.log(`\n✓ Phase 4.14 production freeze: all ${tests.length} checks passed.`);
process.exit(0);
