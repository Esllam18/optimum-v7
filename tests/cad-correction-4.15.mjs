import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  normalizeEngineeringSnapshot,
  engineeringSnapshotSvg,
  exportEngineeringDxfCompatible,
  exportEngineeringDxf
} from '../assets/engineering.js';

const source=readFileSync(new URL('../assets/engineering.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/styles.css',import.meta.url),'utf8');
const catalog=[
  {code:'TB-24C',category:'node',symbol_key:'termination_box',name_ar:'بوكس نهاية',name_en:'Termination box',default_properties:{color:'#16a34a'}},
  {code:'DUCT-4W-7/3.5',category:'route',symbol_key:'microduct',name_ar:'ميكرو دكت',name_en:'Microduct',default_properties:{color:'#ff8a00',dxf_layer:'DUCT 4W/7-3.5'}}
];

const snapshot=normalizeEngineeringSnapshot({
  version:7,
  nodes:[
    {id:'left',catalogCode:'TB-24C',x:200,y:300,width:44,height:34,label:'TB-01',labelText:'FIXED DATA',labelOffset:{x:70,y:-90},labelRotation:90,labelFlipX:true,properties:{boxNo:'01',capacity:24,ports:8}},
    {id:'right',catalogCode:'TB-24C',x:800,y:300,width:44,height:34,label:'TB-02',properties:{boxNo:'02',capacity:24,ports:8}}
  ],
  routes:[{
    id:'route',catalogCode:'DUCT-4W-7/3.5',sourceNodeId:'left',targetNodeId:'right',points:[{x:200,y:300},{x:800,y:300}],label:'FEEDER',labelOffset:{x:0,y:-20},labelRotation:30,labelFlipX:true,labelFlipY:true,properties:{pathStyle:'straight',ways:4,diameter:'7/3.5',fiberCores:24}
  }]
});

assert.equal(snapshot.version,8);
assert.deepEqual(snapshot.nodes[0].labelOffset,{x:0,y:0});
assert.equal(snapshot.nodes[0].labelRotation,0);
assert.equal(snapshot.nodes[0].labelFlipX,false);
assert.equal(snapshot.routes[0].labelRotation,30);
assert.equal(snapshot.routes[0].labelFlipX,true);
assert.equal(snapshot.routes[0].labelFlipY,true);

const svg=engineeringSnapshotSvg(snapshot,{catalog,locale:'en',settings:{width:1000,height:700,titleBlock:false,showGrid:false},validation:{issues:[],errorCount:0,warningCount:0,suggestionCount:0}});
assert.doesNotMatch(svg,/eng-node-data-label|data-eng-node-label|eng-node-label-bg/);
assert.match(svg,/class="eng-node-extra">FIXED DATA<\/text>/);
assert.match(svg,/data-eng-route-label="route" transform="translate\([^)]*\) rotate\(30\) scale\(-1 -1\)"/);
assert.match(svg,/points="273,300 727,300"/,'route must stop at the actual 146px-wide node boxes');

function parsePairs(dxf){
  const lines=dxf.trimEnd().split(/\r?\n/);assert.equal(lines.length%2,0);return Array.from({length:lines.length/2},(_,i)=>[lines[i*2],lines[i*2+1]]);
}
function routeVerticesR12(dxf,layer){
  const pairs=parsePairs(dxf);let active=false,current=null,vertices=[];
  for(let i=0;i<pairs.length;i++){
    const [code,value]=pairs[i];
    if(code==='0'&&value==='POLYLINE'){
      active=false;current=null;
      for(let j=i+1;j<Math.min(i+12,pairs.length);j++)if(pairs[j][0]==='8'){active=pairs[j][1]===layer;break;}
    }else if(active&&code==='0'&&value==='VERTEX'){current={};vertices.push(current);}
    else if(active&&code==='0'&&value==='SEQEND')break;
    else if(current&&code==='10')current.x=Number(value);
    else if(current&&code==='20')current.y=Number(value);
  }
  return vertices;
}
const r12=exportEngineeringDxfCompatible(snapshot,{drawingNo:'QA-415',catalog},{catalog,width:1000,height:700,titleBlock:false});
const vertices=routeVerticesR12(r12,'DUCT_4W_7-3_5');
assert.deepEqual(vertices,[{x:273,y:400},{x:727,y:400}]);
assert.match(r12,/\r\n71\r\n6\r\n/,'R12 route text must preserve horizontal and vertical flips');
assert.doesNotMatch(r12,/FIXED DATA[\s\S]{0,150}\r\n10\r\n270\r\n/,'fixed node text must not use the old detached offset');
assert.match(r12,/\r\n1\r\nFIXED DATA\r\n/);
assert.ok([...r12].every((character)=>character.codePointAt(0)<=0x7f));
assert.ok(r12.endsWith('0\r\nEOF\r\n'));

const r2000=exportEngineeringDxf(snapshot,{drawingNo:'QA-415',catalog},{catalog,width:1000,height:700,titleBlock:false});
assert.match(r2000,/\r\n71\r\n6\r\n/,'R2000 route text must preserve flips');
assert.match(r2000,/\r\n1\r\nFIXED DATA\r\n/);
assert.ok(r2000.endsWith('0\r\nEOF\r\n'));

assert.doesNotMatch(source,/engineering-edit-node-label|engineering-node-label-edit|kind==='nodeLabel'|data-eng-node-label/);
assert.match(source,/engineering-route-label-edit/);
assert.match(source,/engineering-toggle-library-more/);
assert.match(source,/compactLimit=6/);
assert.match(source,/data-library-extra/);
assert.match(source,/document\.querySelectorAll\('\.cad-symbol-tile-wrap'\)/);
assert.match(source,/create_engineering_revision_from/);
assert.match(source,/create_engineering_revision'\s*,\s*\{p_drawing_id:eng\.selectedDrawingId/);
assert.match(source,/20260805135642_phase4_14_revision_restore\.sql/);
assert.match(css,/\.engineering-fixed-data-note/);
assert.match(css,/\.cad-library-more/);

console.log('✓ Phase 4.15 CAD correction: fixed element data, compact library, route text transforms, revision fallback and DXF geometry passed');
