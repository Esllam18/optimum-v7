import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  normalizeEngineeringSnapshot,
  engineeringSnapshotSvg,
  exportEngineeringDxf,
  exportEngineeringDxfCompatible
} from '../assets/engineering.js';

const source=readFileSync(new URL('../assets/engineering.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/styles.css',import.meta.url),'utf8');
const catalog=[
  {code:'TB-24C',category:'node',symbol_key:'termination_box',name_ar:'بوكس نهاية',name_en:'Termination box',default_properties:{color:'#16a34a'}},
  {code:'DUCT-4W-7/3.5',category:'route',symbol_key:'microduct',name_ar:'ميكرو دكت',name_en:'Microduct',default_properties:{color:'#ff8a00',dxf_layer:'DUCT 4W/7-3.5'}}
];

const snapshot=normalizeEngineeringSnapshot({
  nodes:[
    {id:'a',catalogCode:'TB-24C',x:200,y:300,label:'TB-01',properties:{boxNo:'01',capacity:24,ports:8}},
    {id:'b',catalogCode:'TB-24C',x:800,y:300,label:'TB-02',properties:{boxNo:'02',capacity:24,ports:8}}
  ],
  routes:[{
    id:'r',catalogCode:'DUCT-4W-7/3.5',sourceNodeId:'a',targetNodeId:'b',points:[{x:200,y:300},{x:800,y:300}],
    label:'FEEDER\nLEVEL 02',labelOffset:{x:45,y:-65},labelFontSize:17,labelAlign:'end',labelLineHeight:1.5,
    labelBold:false,labelBackground:true,labelShowTechnical:true,labelRotation:90,labelFlipX:true,labelFlipY:false,
    properties:{pathStyle:'straight',ways:4,diameter:'7/3.5',fiberCores:24}
  }]
});

const route=snapshot.routes[0];
assert.deepEqual(route.labelOffset,{x:45,y:-65});
assert.equal(route.labelFontSize,17);
assert.equal(route.labelAlign,'end');
assert.equal(route.labelLineHeight,1.5);
assert.equal(route.labelBold,false);
assert.equal(route.labelBackground,true);
assert.equal(route.labelRotation,90);
assert.equal(route.labelFlipX,true);

const svg=engineeringSnapshotSvg(snapshot,{catalog,locale:'en',settings:{width:1000,height:700,titleBlock:false,showGrid:false},validation:{issues:[],errorCount:0,warningCount:0,suggestionCount:0}});
assert.match(svg,/class="eng-node-type-caption">Termination box<\/text>/,'small element type/name must be restored');
assert.match(svg,/class="eng-route-label-background"/,'route label background must be optional and renderable');
assert.match(svg,/data-eng-route-label="r" transform="translate\([^)]*\) rotate\(90\) scale\(-1 1\)"/);
assert.match(svg,/text-anchor="end"/);
assert.match(svg,/class="normal"/);

assert.match(source,/cad-classic-route-dock/);
assert.match(source,/cad-route-classic-card/);
assert.match(source,/data-action="engineering-route-tool"/);
assert.match(source,/محرر بيانات المسار/);
assert.match(source,/name="align"/);
assert.match(source,/name="line_height"/);
assert.match(source,/name="bold"/);
assert.match(source,/name="background"/);
assert.match(source,/kind==='routeLabel'/);
assert.match(source,/openRouteLabelEditor\(route\)/);
assert.match(css,/Phase 4\.16/);
assert.match(css,/\.cad-classic-route-dock/);
assert.match(css,/\.eng-node-type-caption/);
assert.match(css,/\.eng-route-label-background/);

const r12=exportEngineeringDxfCompatible(snapshot,{drawingNo:'QA-416',catalog},{catalog,width:1000,height:700,titleBlock:false});
assert.match(r12,/\r\n1\r\nTermination box\r\n/,'R12 must include the restored small element name');
assert.match(r12,/\r\n71\r\n2\r\n/,'R12 must retain horizontal flip');
assert.match(r12,/\r\n72\r\n2\r\n/,'R12 must retain end alignment');
assert.match(r12,/\r\n50\r\n-90\r\n/,'R12 must retain route label rotation');
assert.ok(r12.endsWith('0\r\nEOF\r\n'));

const r2000=exportEngineeringDxf(snapshot,{drawingNo:'QA-416',catalog},{catalog,width:1000,height:700,titleBlock:false});
assert.match(r2000,/\r\n1\r\nTermination box\r\n/,'R2000 must include the restored small element name');
assert.match(r2000,/\r\n71\r\n2\r\n/,'R2000 must retain horizontal flip');
assert.match(r2000,/\r\n72\r\n2\r\n/,'R2000 must retain end alignment');
assert.ok(r2000.endsWith('0\r\nEOF\r\n'));

console.log('✓ Phase 4.16 final drawing adjustments: classic route dock, light element name and full movable route data editor passed');
