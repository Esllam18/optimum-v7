import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeEngineeringSnapshot,engineeringSnapshotSvg,exportEngineeringDxfCompatible,exportEngineeringDxf} from '../assets/engineering.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=resolve(root,'docs/samples');
await mkdir(out,{recursive:true});
const seed=JSON.parse(await readFile(resolve(out,'cad-production-4.14-snapshot.json'),'utf8'));
const snapshot=normalizeEngineeringSnapshot(seed.snapshot);
snapshot.nodes.forEach((node)=>{node.labelOffset={x:0,y:0};node.labelRotation=0;node.labelFlipX=false;node.labelFlipY=false;});
snapshot.routes.forEach((route,index)=>{
  route.label=index===0?'MAIN FEEDER\nLEVEL 02':route.label;
  route.labelOffset={x:index%2?42:-52,y:-36-index*12};
  route.labelFontSize=index===0?15:11;
  route.labelAlign=index===0?'end':'middle';
  route.labelLineHeight=1.35;
  route.labelBold=index!==0;
  route.labelBackground=index===0;
  route.labelShowTechnical=index!==0;
  route.labelRotation=index===0?-8:0;
  route.labelFlipX=false;
  route.labelFlipY=false;
});
const settings={...seed.settings,titleBlock:true},metadata={...seed.metadata,drawingNo:'P001-FIBER-001',title:'Secondary Fiber Network — Final Drawing Adjustments',revision:'R4',status:'DRAFT',date:'2026-08-05'};
const options={settings,catalog:seed.catalog,metadata,locale:'en',validation:{issues:[],errorCount:0,warningCount:0,suggestionCount:0}};
const svg=engineeringSnapshotSvg(snapshot,options);
const dxf=exportEngineeringDxfCompatible(snapshot,{...metadata,catalog:seed.catalog},{...settings,catalog:seed.catalog});
const dxf2000=exportEngineeringDxf(snapshot,{...metadata,catalog:seed.catalog},{...settings,catalog:seed.catalog});
await writeFile(resolve(out,'cad-final-4.16-demo.svg'),svg);
await writeFile(resolve(out,'cad-final-4.16-demo.dxf'),dxf);
await writeFile(resolve(out,'cad-final-4.16-demo-r2000.dxf'),dxf2000);
await writeFile(resolve(out,'cad-final-4.16-snapshot.json'),JSON.stringify({snapshot,settings,metadata,catalog:seed.catalog},null,2));
await writeFile(resolve(out,'cad-final-4.16-preview.html'),`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CAD 4.16 QA</title><style>@page{size:A3 landscape;margin:5mm}html,body{margin:0;background:#07131f;font-family:Arial,sans-serif}.qa{padding:18px}.qa h1{margin:0 0 12px;color:#fff;font-size:18px}.sheet{background:#fff;box-shadow:0 20px 55px #0008}.sheet svg{display:block;width:100%;height:auto}@media print{html,body{background:#fff}.qa{padding:0}.qa h1{display:none}.sheet{width:410mm;height:287mm;display:flex;align-items:center;box-shadow:none}.sheet svg{width:100%;height:100%}}</style></head><body><main class="qa"><h1>Optimum CAD 4.16 — Final Drawing Adjustments</h1><div class="sheet">${svg}</div></main></body></html>`);

const audit={
  version:'4.16.0',
  r12:{acadVersion:dxf.includes('AC1009')?'AC1009':null,ascii:[...dxf].every((c)=>c.codePointAt(0)<=127),eof:dxf.endsWith('0\r\nEOF\r\n'),bytes:Buffer.byteLength(dxf)},
  r2000:{acadVersion:dxf2000.includes('AC1015')?'AC1015':null,eof:dxf2000.endsWith('0\r\nEOF\r\n'),bytes:Buffer.byteLength(dxf2000)},
  features:{classicRouteDock:true,elementTypeCaption:true,independentRouteLabelEditor:true}
};
await writeFile(resolve(out,'cad-final-4.16-dxf-audit.json'),JSON.stringify(audit,null,2));
console.log('Generated Phase 4.16 final drawing samples.');
