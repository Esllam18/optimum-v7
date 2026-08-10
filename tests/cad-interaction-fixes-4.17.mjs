import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  mapClientPointToSvg,
  normalizeEngineeringSnapshot,
  engineeringSnapshotSvg
} from '../assets/engineering.js';

const source=readFileSync(new URL('../assets/engineering.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/styles.css',import.meta.url),'utf8');

// The browser rectangle covers the complete SVG, including the title block.
// Coordinates must therefore be mapped through the real SVG viewBox rather
// than through drawingWidth only.
assert.deepEqual(
  mapClientPointToSvg(
    {left:100,top:50,width:650,height:500},
    {x:0,y:0,width:1300,height:1000},
    425,300
  ),
  {x:650,y:500}
);

const catalog=[
  {code:'TB-24C',category:'node',symbol_key:'termination_box',name_ar:'بوكس نهاية',name_en:'Termination box',default_properties:{color:'#16a34a'}},
  {code:'DUCT-4W-7/3.5',category:'route',symbol_key:'microduct',name_ar:'ميكرو دكت',name_en:'Microduct',default_properties:{color:'#ff8a00'}}
];
const snapshot=normalizeEngineeringSnapshot({
  nodes:[
    {id:'a',catalogCode:'TB-24C',x:200,y:300,label:'A'},
    {id:'b',catalogCode:'TB-24C',x:800,y:300,label:'B'}
  ],
  routes:[{
    id:'r',catalogCode:'DUCT-4W-7/3.5',sourceNodeId:'a',targetNodeId:'b',
    points:[{x:200,y:300},{x:800,y:300}],
    label:'CUSTOM ROUTE DATA',labelOffset:{x:-300,y:0},labelPositionLocked:true,
    labelRotation:90,labelFlipX:true,labelFlipY:true,labelAlign:'start',
    labelBackground:false,labelShowTechnical:false,
    properties:{pathStyle:'straight'}
  }]
});
assert.equal(snapshot.routes[0].labelPositionLocked,true);

const svg=engineeringSnapshotSvg(snapshot,{
  catalog,locale:'en',settings:{width:1000,height:700,titleBlock:false,showGrid:false},
  validation:{issues:[],errorCount:0,warningCount:0,suggestionCount:0}
});
assert.match(svg,/data-eng-route-label="r" transform="translate\(200 300\) rotate\(90\) scale\(-1 -1\)"/,'locked manual label position must be used exactly');
assert.match(svg,/class="eng-route-label-hit" fill="transparent" pointer-events="all"/,'route data must remain selectable even without a white background');
assert.doesNotMatch(svg,/class="eng-route-label-background"/,'white background stays optional');

assert.match(source,/getScreenCTM\?\.\(\)/,'pointer conversion should prefer the real screen transform');
assert.match(source,/rawSvgPointFromClient/);
assert.match(source,/route\.labelPositionLocked=true/,'manual label drag must lock its exact position');
assert.match(source,/if\(eng\.pasteMode\)stopPasteMode\(\)/,'the repeat-paste toolbar button must toggle the mode off');
assert.match(source,/data-action="engineering-stop-paste"/,'a visible stop button must exist');
assert.match(source,/addEventListener\('contextmenu'.*stopPasteMode/s,'right-click must stop repeat paste');
assert.match(source,/name="position_locked"/);
assert.match(source,/transformEditorFields\(value,'label_'\)/);
assert.match(source,/data\.label_rotation/);
assert.match(source,/data\.label_flip_x/);
assert.match(source,/data\.label_flip_y/);
assert.match(source,/openRouteLabelEditor\(routeById\(routeLabel\.dataset\.engRouteLabel\)\)/,'double-click must reopen the route data editor');
assert.doesNotMatch(source,/eng\.pendingPoint=\{x:240,y:180\}/,'library placement must not use a hard-coded point');
assert.match(source,/Click the exact place where you want to put the node on the sheet/);
assert.match(css,/Phase 4\.17/);
assert.match(css,/\.engineering-paste-stop-bar/);
assert.match(css,/\.eng-route-label-hit/);

console.log('✓ Phase 4.17 CAD interaction fixes: exact pointer mapping, stoppable repeat paste and fully editable route data passed');
