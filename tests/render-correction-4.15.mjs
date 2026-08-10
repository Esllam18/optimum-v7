import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeEngineeringSnapshot,engineeringSnapshotSvg,exportEngineeringDxfCompatible} from '../assets/engineering.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=resolve(root,'docs/samples');
await mkdir(out,{recursive:true});
const seed=JSON.parse(await readFile(resolve(out,'cad-production-4.14-snapshot.json'),'utf8'));
const snapshot=normalizeEngineeringSnapshot(seed.snapshot);
snapshot.nodes.forEach((node,index)=>{node.labelOffset={x:0,y:0};node.labelRotation=0;node.labelFlipX=false;node.labelFlipY=false;if(index===0)node.labelText='ODF 144 · PORT 01';if(index===1)node.labelText='SUB CABINET 02';});
snapshot.routes.forEach((route,index)=>{route.labelOffset={x:index%2?35:-35,y:-28-index*9};route.labelRotation=index===0?-4:0;route.labelFlipX=false;route.labelFlipY=false;});
const settings={...seed.settings,titleBlock:true},metadata={...seed.metadata,drawingNo:'P001-FIBER-001',title:'Secondary Fiber Network — CAD Correction',revision:'R3',status:'DRAFT',date:'2026-08-05'};
const svg=engineeringSnapshotSvg(snapshot,{settings,catalog:seed.catalog,metadata,locale:'ar',validation:{issues:[],errorCount:0,warningCount:0,suggestionCount:0}});
const dxf=exportEngineeringDxfCompatible(snapshot,{...metadata,catalog:seed.catalog},{...settings,catalog:seed.catalog});
await writeFile(resolve(out,'cad-correction-4.15-demo.svg'),svg);
await writeFile(resolve(out,'cad-correction-4.15-demo.dxf'),dxf);
await writeFile(resolve(out,'cad-correction-4.15-snapshot.json'),JSON.stringify({snapshot,settings,metadata,catalog:seed.catalog},null,2));
await writeFile(resolve(out,'cad-correction-4.15-preview.html'),`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CAD 4.15 QA</title><style>@page{size:A3 landscape;margin:5mm}html,body{margin:0;background:#07131f;font-family:Arial,sans-serif}.qa{padding:18px}.qa h1{margin:0 0 12px;color:#fff;font-size:18px}.sheet{background:#fff;box-shadow:0 20px 55px #0008}.sheet svg{display:block;width:100%;height:auto}@media print{html,body{background:#fff}.qa{padding:0}.qa h1{display:none}.sheet{width:410mm;height:287mm;display:flex;align-items:center;box-shadow:none}.sheet svg{width:100%;height:100%}}</style></head><body><main class="qa"><h1>Optimum CAD 4.15 — Correction Preview</h1><div class="sheet">${svg}</div></main></body></html>`);
console.log('Generated Phase 4.15 correction samples.');
