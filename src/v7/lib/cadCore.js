const deepClone = (value) => JSON.parse(JSON.stringify(value));
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value, digits = 3) => Number(num(value).toFixed(digits));
const uid = (prefix = 'id') => `${prefix}_${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
const cleanEngineeringNote = (value='') => String(value??'').replace(/تم إنشاؤه بواسطة الإصلاح الذكي|Created by Smart Fix/gi,'').trim();
const escapeXml = (value = '') => String(value ?? '').replace(/[<>&"']/g, (c) => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' }[c]));

export function mapClientPointToSvg(boundsInput={},viewBoxInput={},clientX=0,clientY=0){
  const bounds={left:num(boundsInput.left),top:num(boundsInput.top),width:Math.max(1,num(boundsInput.width,1)),height:Math.max(1,num(boundsInput.height,1))};
  const viewBox={x:num(viewBoxInput.x),y:num(viewBoxInput.y),width:Math.max(1,num(viewBoxInput.width,1)),height:Math.max(1,num(viewBoxInput.height,1))};
  return {
    x:viewBox.x+(num(clientX)-bounds.left)*viewBox.width/bounds.width,
    y:viewBox.y+(num(clientY)-bounds.top)*viewBox.height/bounds.height
  };
}

export function normalizeEngineeringSnapshot(input = {}) {
  const raw = input && typeof input === 'object' ? input : {};
  const takeoffSettings = {
    routeWastePercent: 5, cableWastePercent: 5, connectorReservePercent: 0,
    includeInstallationWorks: true, includeAerialWire: true, includeCivilWorks: true,
    ...(raw.takeoffSettings || {})
  };
  return {
    version: 8,
    generalNotes: String(raw.generalNotes || ''),
    takeoffSettings,
    nodes: Array.isArray(raw.nodes) ? raw.nodes.map((node) => ({
      id: node.id || uid('node'), catalogCode: node.catalogCode || 'TB-24C',
      x: num(node.x, 200), y: num(node.y, 200),
      width: Math.max(44, num(node.width, 78)), height: Math.max(34, num(node.height, 56)),
      label: node.label || '', rotation: num(node.rotation, 0),
      // Phase 4.15: element data is part of the element symbol again. Legacy
      // movable-label transforms are neutralized while labelText is preserved
      // and rendered as fixed rows inside the node.
      labelOffset:{x:0,y:0},
      labelText:String(node.labelText||''),
      labelFontSize:Math.max(7,Math.min(18,num(node.labelFontSize,9))),
      labelRotation:0,
      labelFlipX:false,labelFlipY:false,
      labelAlign:'middle',
      labelBackground:false,
      properties: {
        networkLevel: '', businessRole: '', boxNo: '', capacity: null, ports: null,
        coreRange: '', lengthM: null, widthM: null, heightM: null, distance: null,
        odfCode: '', splitterCode: '', accessories: [], manufacturer: '', model: '',
        locationCode: '', room: '', elevation: '', status: 'new', odfPort:'', splitterPort:'', numberOfCables:null, villaNo:'', displayFields:{label:true,boxNo:true,odf:true,splitter:true,coreRange:true,distance:true}, notes: '',
        ...(node.properties || {})
      }
    })) : [],
    routes: Array.isArray(raw.routes) ? raw.routes.map((route) => ({
      id: route.id || uid('route'), catalogCode: route.catalogCode || 'DUCT-4W-7/3.5',
      points: Array.isArray(route.points) ? route.points.map((pt) => ({ x:num(pt.x), y:num(pt.y) })) : [],
      label: route.label || '',
      labelOffset:{x:num(route.labelOffset?.x,0),y:num(route.labelOffset?.y,-22)},
      labelFontSize:Math.max(8,Math.min(48,num(route.labelFontSize,11))),
      labelShowTechnical:route.labelShowTechnical!==false,
      labelAlign:['start','middle','end'].includes(route.labelAlign)?route.labelAlign:'middle',
      labelLineHeight:Math.max(1,Math.min(2,num(route.labelLineHeight,1.28))),
      labelBold:route.labelBold!==false,
      labelBackground:Boolean(route.labelBackground),
      labelRotation:num(route.labelRotation,0),
      labelFlipX:Boolean(route.labelFlipX),labelFlipY:Boolean(route.labelFlipY),
      labelPositionLocked:Boolean(route.labelPositionLocked),
      manualLength: route.manualLength === null || route.manualLength === undefined || route.manualLength === '' ? null : num(route.manualLength),
      sourceNodeId: route.sourceNodeId || route.properties?.sourceNodeId || null,
      targetNodeId: route.targetNodeId || route.properties?.targetNodeId || null,
      properties: {
        networkLevel: '', installation: 'underground', pathStyle: 'orthogonal', cableCode: '',
        fiberCores: null, ways: null, diameter: '', connectorCount: 0,
        openBundle: 0, endBundle: 0, routeWastePercent: null, cableWastePercent: null,
        fromLabel: '', toLabel: '', trenchType: '', crossingType: '', ductOccupancy: '',
        startSlackM: 0, endSlackM: 0, spliceCount: 0, numberOfCables:null, spareLengthM:0, status: 'new', displayFields:{label:true,fromTo:true,length:true,ways:true,cable:true,cores:true}, notes: '',
        ...(route.properties || {})
      }
    })).filter((route) => route.points.length >= 2) : [],
    annotations: Array.isArray(raw.annotations) ? raw.annotations.map((item) => ({
      id: item.id || uid('text'), x:num(item.x,100), y:num(item.y,100), text:item.text || '',
      size:Math.max(8,num(item.size,18)), rotation:num(item.rotation,0), align:['start','middle','end'].includes(item.align)?item.align:'start',
      flipX:Boolean(item.flipX),flipY:Boolean(item.flipY),bold:item.bold!==false,background:Boolean(item.background),
      lineHeight:Math.max(1,Math.min(2,num(item.lineHeight,1.25)))
    })) : [],
    reference: raw.reference && typeof raw.reference === 'object' ? {
      opacity:.35, locked:true, fit:'contain', offsetX:0, offsetY:0, scale:1, rotation:0, ...raw.reference
    } : null,
    manualBoq: Array.isArray(raw.manualBoq) ? raw.manualBoq.map((x) => ({
      id:x.id || uid('boq'), code:x.code || 'CUSTOM', category:x.category || 'other',
      description_ar:x.description_ar || x.description || 'بند يدوي',
      description_en:x.description_en || x.description || 'Manual item', unit:x.unit || 'ea',
      quantity:x.source_kind === 'adjustment' ? num(x.quantity) : Math.max(0,num(x.quantity)),
      source_kind:x.source_kind || 'manual', notes:String(x.notes || ''), metadata:{...(x.metadata || {})}
    })) : []
  };
}


function nodeCenter(node){ return {x:num(node?.x),y:num(node?.y)}; }
function inferredNodeSymbol(node,item=null){
  const explicit=String(item?.symbol_key||'').toLowerCase();if(explicit)return explicit;
  const code=String(node?.catalogCode||'').toUpperCase();
  if(/JOINT|CLOSURE/.test(code))return 'joint';
  if(/POLE/.test(code))return 'pole';
  if(/MAN.?HOLE|CHAMBER|^MH/.test(code))return 'manhole';
  if(/HAND.?HOLE|^HH/.test(code))return 'handhole';
  if(/MAIN.?CAB|SUB.?CAB|CABINET|FDT/.test(code))return 'sub_cabinet';
  if(/TERMINATION|FAT|ODB|^TB/.test(code))return 'termination_box';
  if(/ODF/.test(code))return 'odf';if(/LGX/.test(code))return 'lgx';if(/SPLITTER|^SP/.test(code))return 'splitter';
  return '';
}
function nodeFixedDetailLines(node,item=null,locale='en'){
  const p=node?.properties||{},custom=String(node?.labelText||'').split(/\r?\n/).map((line)=>line.trim()).filter(Boolean).slice(0,2);
  return [
    p.odfCode?`ODF ${p.odfCode}${p.odfPort?` / ${p.odfPort}`:''}`:'',
    p.splitterCode?`SP ${p.splitterCode}${p.splitterPort?` / ${p.splitterPort}`:''}`:'',
    p.coreRange?`CORE ${p.coreRange}`:'',
    p.villaNo?`${locale==='ar'?'مبنى':'BLDG'} ${p.villaNo}`:'',
    ...custom
  ].filter(Boolean);
}
function nodeVisualMetrics(node,item=null,locale='en'){
  const symbol=inferredNodeSymbol(node,item);
  if(symbol==='joint'||symbol==='closure')return {symbol,width:64,height:60};
  if(symbol==='pole')return {symbol,width:28,height:92};
  if(symbol==='manhole'||symbol==='chamber')return {symbol,width:76,height:76};
  if(symbol==='handhole')return {symbol,width:90,height:90};
  const details=nodeFixedDetailLines(node,item,locale),title=node?.label||item?.[locale==='ar'?'name_ar':'name_en']||node?.catalogCode||'',code=item?.code||node?.catalogCode||'';
  const cabinet=['main_cabinet','sub_cabinet','fdt','tdm'].includes(symbol),baseW=cabinet?178:146,baseH=cabinet?96:88;
  const contentW=Math.max(String(title).length*6.8,String(code).length*5.8+72);
  return {symbol,width:Math.min(230,Math.max(num(node?.width,0),baseW,contentW)),height:Math.max(num(node?.height,0),baseH+details.length*12),details};
}
function nodeAnchor(node,toward,item=null){
  const center=nodeCenter(node),dx=num(toward?.x,center.x)-center.x,dy=num(toward?.y,center.y)-center.y;
  if(!dx&&!dy)return center;
  const metrics=nodeVisualMetrics(node,item),halfW=Math.max(12,metrics.width/2),halfH=Math.max(12,metrics.height/2);
  const scale=1/Math.max(Math.abs(dx)/halfW,Math.abs(dy)/halfH,1e-6);
  return {x:center.x+dx*scale,y:center.y+dy*scale};
}
function routeResolvedPoints(snapshotInput,routeInput,catalogMap=null){
  const snapshot=normalizeEngineeringSnapshot(snapshotInput),route=routeInput||{};
  let points=(route.points||[]).map((p)=>({x:num(p.x),y:num(p.y)}));
  if(points.length<2)return points;
  const source=snapshot.nodes.find((x)=>x.id===route.sourceNodeId),target=snapshot.nodes.find((x)=>x.id===route.targetNodeId);
  if(source)points[0]=nodeAnchor(source,points[1]||target||source,catalogMap?.get?.(source.catalogCode));
  if(target)points[points.length-1]=nodeAnchor(target,points[points.length-2]||source||target,catalogMap?.get?.(target.catalogCode));
  if(route.properties?.pathStyle==='orthogonal'&&points.length===2){const a=points[0],b=points[1];points=[a,{x:b.x,y:a.y},b];}
  return points;
}
function routeLengthMeters(snapshot,route,settings={}){
  if(route.manualLength!==null&&route.manualLength!==undefined&&route.manualLength!=='')return Math.max(0,num(route.manualLength));
  const meterPerDrawingUnit=Math.max(.0001,num(settings.meterPerDrawingUnit,num(settings.meterPerGrid,1)/Math.max(1,num(settings.grid,20))));
  const points=routeResolvedPoints(snapshot,route);let length=0;
  for(let i=1;i<points.length;i++)length+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y)*meterPerDrawingUnit;
  return length;
}
function routeDisplayLines(snapshot,route,item,settings={},separator=' · '){
  const props=route?.properties||{},length=routeLengthMeters(snapshot,route,settings),raw=String(route?.label||'').trim();
  const catalogNames=[item?.name_ar,item?.name_en,item?.code,route?.catalogCode,'مسار مقترح','Suggested route','ميكرو دكت','Microduct'].filter(Boolean).map((x)=>String(x).trim().toLowerCase());
  const custom=raw&&!catalogNames.includes(raw.toLowerCase())?raw:'';
  const technical=[props.fromLabel&&props.toLabel?`${props.fromLabel} > ${props.toLabel}`:'',props.ways?`${props.ways}W`:'',props.diameter||'',props.cableCode||'',props.fiberCores?`${props.fiberCores}C`:'',`${round(length,2)} m`].filter(Boolean).join(separator);
  return [...custom.split(/\r?\n/).filter(Boolean).slice(0,12),...(route?.labelShowTechnical!==false&&technical?[technical]:[])];
}
function routeLabelPosition(snapshot,route,points,catalogMap,settings={},lines=[]){
  const mid=routeMidpoint({...route,points}),off=route?.labelOffset||{x:0,y:-22},font=Math.max(8,Math.min(48,num(route?.labelFontSize,11))),lineHeight=Math.max(1,Math.min(2,num(route?.labelLineHeight,1.28))),base={x:mid.x+num(off.x),y:mid.y+num(off.y)};
  if(route?.labelPositionLocked||!lines.length)return base;
  const labelW=Math.max(54,Math.max(...lines.map((line)=>String(line).length),1)*font*.58+16),labelH=Math.max(font*1.4,lines.length*font*lineHeight+8),collides=(point)=>snapshot.nodes.some((node)=>{const metrics=nodeVisualMetrics(node,catalogMap?.get?.(node.catalogCode)),pad=7;return point.x+labelW/2>node.x-metrics.width/2-pad&&point.x-labelW/2<node.x+metrics.width/2+pad&&point.y+labelH/2>node.y-metrics.height/2-pad&&point.y-labelH/2<node.y+metrics.height/2+pad;});
  if(!collides(base))return base;
  const a=points[Math.max(0,Math.floor((points.length-1)/2))]||points[0]||base,b=points[Math.min(points.length-1,Math.floor((points.length-1)/2)+1)]||points.at(-1)||a,dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
  for(const distance of [28,44,62,84,108])for(const sign of [1,-1]){const candidate={x:Math.min(num(settings.width,1600)-24,Math.max(24,base.x+nx*distance*sign)),y:Math.min(num(settings.height,1000)-24,Math.max(24,base.y+ny*distance*sign))};if(!collides(candidate))return candidate;}
  return base;
}
function levelLabel(value,locale='ar'){
  const labels={main:['رئيسي','Main'],secondary:['ثانوي','Secondary'],distribution:['توزيع','Distribution'],drop:['توصيلة','Drop'],terminal:['نهائي','Terminal'],spare:['احتياطي','Spare']};
  return labels[value]?.[locale==='ar'?0:1]||value||'';
}
function installationLabel(value,locale='ar'){
  const labels={underground:['أرضي','Underground'],aerial:['هوائي','Aerial'],indoor:['داخلي','Indoor'],other:['أخرى','Other']};
  return labels[value]?.[locale==='ar'?0:1]||value||'';
}

export function calculateEngineeringTakeoff(snapshotInput, catalogInput = [], settings = {}) {
  const snapshot = normalizeEngineeringSnapshot(snapshotInput);
  const catalog = new Map((catalogInput || []).map((item) => [item.code, item]));
  const cfg = { ...snapshot.takeoffSettings, ...(settings.takeoffSettings || {}) };
  const groups = new Map();
  const mergeList = (target, key, values) => {
    if (!values?.length) return;
    target[key] = [...new Set([...(target[key] || []), ...values.filter(Boolean)])];
  };
  const add = (code, baseQty, source = 'auto', custom = {}) => {
    const rawBase = num(baseQty);
    if (!code || rawBase === 0) return;
    const item = catalog.get(code) || {};
    const wastePercent = Math.max(0, num(custom.waste_percent, 0));
    const finalQty = custom.quantity !== undefined ? num(custom.quantity) : rawBase * (1 + wastePercent / 100);
    if (finalQty === 0) return;
    const key = `${code}|${source}|${wastePercent}`;
    const current = groups.get(key) || {
      code,
      category: custom.category || item.category || 'other',
      description_ar: custom.description_ar || item.name_ar || code,
      description_en: custom.description_en || item.name_en || code,
      unit: custom.unit || item.unit || 'ea',
      base_quantity: 0,
      waste_percent: wastePercent,
      quantity: 0,
      source_kind: source,
      notes: custom.notes || '',
      metadata: { ...(item.default_properties || {}), ...(custom.metadata || {}) }
    };
    current.base_quantity += rawBase;
    current.quantity += finalQty;
    if (custom.notes && !current.notes.includes(custom.notes)) current.notes = [current.notes, custom.notes].filter(Boolean).join(' | ');
    mergeList(current.metadata, 'manualIds', custom.metadata?.manualIds);
    mergeList(current.metadata, 'nodeIds', custom.metadata?.nodeIds);
    mergeList(current.metadata, 'routeIds', custom.metadata?.routeIds);
    mergeList(current.metadata, 'sourceLabels', custom.metadata?.sourceLabels);
    groups.set(key, current);
  };
  snapshot.nodes.forEach((node) => {
    const props = node.properties || {};
    add(node.catalogCode, 1, 'auto', { metadata: { nodeIds:[node.id], sourceLabels:[node.label] }, notes:cleanEngineeringNote(props.notes) });
    (Array.isArray(props.accessories) ? props.accessories : []).forEach((code) => add(code,1,'auto',{metadata:{nodeIds:[node.id],sourceLabels:[node.label]}}));
    const splitterCode=props.splitterCode||(props.splitter?`SP-${String(props.splitter).replace(':','X')}`:null);
    const odfCode=props.odfCode||(props.odf?`ODF-${String(props.odf).replace(/^ODF[- ]?/i,'')}`:null);
    if (splitterCode) add(splitterCode,1,'auto',{metadata:{nodeIds:[node.id],sourceLabels:[node.label]}});
    if (odfCode) add(odfCode,1,'auto',{metadata:{nodeIds:[node.id],sourceLabels:[node.label]}});
  });
  snapshot.routes.forEach((route) => {
    const length=routeLengthMeters(snapshot,route,settings), props=route.properties || {};
    const routeWaste=Math.max(0,num(props.routeWastePercent==null?cfg.routeWastePercent:props.routeWastePercent));
    const cableWaste=Math.max(0,num(props.cableWastePercent==null?cfg.cableWastePercent:props.cableWastePercent));
    const routeMeta={routeIds:[route.id],sourceLabels:[route.label],installation:props.installation,networkLevel:props.networkLevel,fromLabel:props.fromLabel,toLabel:props.toLabel};
    add(route.catalogCode, length, 'auto', { waste_percent:routeWaste, metadata:routeMeta, notes:cleanEngineeringNote(props.notes) });
    if (props.cableCode && props.cableCode !== route.catalogCode) {
      const cableCount=Math.max(1,num(props.numberOfCables,1)),spare=Math.max(0,num(props.spareLengthM));
      add(props.cableCode,(length+spare)*cableCount,'auto',{waste_percent:cableWaste,metadata:{...routeMeta,cableCount,spareLengthM:spare},notes:cleanEngineeringNote(props.notes)});
    }
    const connectorBase=Math.max(0,num(props.connectorCount));
    if (connectorBase) add('CONNECTOR',connectorBase,'auto',{waste_percent:Math.max(0,num(cfg.connectorReservePercent)),metadata:{routeIds:[route.id],sourceLabels:[route.label]}});
    if(props.openBundle) add('OPEN-BUNDLE',num(props.openBundle),'auto',{metadata:{routeIds:[route.id],sourceLabels:[route.label]}});
    if(props.endBundle) add('END-BUNDLE',num(props.endBundle),'auto',{metadata:{routeIds:[route.id],sourceLabels:[route.label]}});
    if(cfg.includeInstallationWorks){
      if(props.installation==='underground') add('CIVIL-UG-ROUTE',length,'auto',{category:'civil',description_ar:'أعمال تنفيذ مسار أرضي',description_en:'Underground route installation works',unit:'m',metadata:routeMeta});
      else if(props.installation==='aerial'){
        add('INSTALL-AERIAL',length,'auto',{category:'civil',description_ar:'أعمال تنفيذ مسار هوائي',description_en:'Aerial route installation works',unit:'m',metadata:routeMeta});
        if(cfg.includeAerialWire) add('WIRE-SUSP',length,'auto',{waste_percent:routeWaste,category:'route',description_ar:'واير تعليق للمسار الهوائي',description_en:'Aerial suspension wire',unit:'m',metadata:routeMeta});
      }else if(props.installation==='indoor') add('INSTALL-INDOOR',length,'auto',{category:'civil',description_ar:'أعمال تنفيذ مسار داخلي',description_en:'Indoor route installation works',unit:'m',metadata:routeMeta});
    }
  });
  snapshot.manualBoq.forEach((item) => add(item.code,item.quantity,item.source_kind || 'manual',{...item,quantity:item.quantity,metadata:{...(item.metadata||{}),manualIds:[item.id]}}));
  return [...groups.values()].map((item)=>({
    ...item,
    base_quantity:round(item.base_quantity,item.unit==='m'?2:3),
    quantity:item.unit==='m'?round(item.quantity,2):(item.source_kind==='auto'&&item.waste_percent>0?Math.ceil(item.quantity):round(item.quantity,3))
  })).sort((a,b)=>`${a.category}|${a.code}`.localeCompare(`${b.category}|${b.code}`));
}

export function summarizeEngineeringTakeoff(snapshotInput,catalogInput=[],settings={}){
  const snapshot=normalizeEngineeringSnapshot(snapshotInput),catalog=new Map((catalogInput||[]).map((x)=>[x.code,x]));
  const rows=calculateEngineeringTakeoff(snapshot,catalogInput,settings);
  const nodeSchedule=snapshot.nodes.map((node)=>{const p=node.properties||{},item=catalog.get(node.catalogCode)||{};return{id:node.id,code:node.catalogCode,label:node.label||node.catalogCode,description_ar:item.name_ar||node.catalogCode,description_en:item.name_en||node.catalogCode,level:p.networkLevel||p.businessRole||'',box_no:p.boxNo||'',capacity:p.capacity??'',ports:p.ports??'',core_range:p.coreRange||'',odf:p.odfCode||'',odf_port:p.odfPort||'',splitter:p.splitterCode||'',splitter_port:p.splitterPort||'',distance:p.distance??'',number_of_cables:p.numberOfCables??'',villa_no:p.villaNo||'',location_code:p.locationCode||'',length_m:p.lengthM??'',width_m:p.widthM??'',height_m:p.heightM??'',accessories:Array.isArray(p.accessories)?p.accessories.join(' | '):'',notes:cleanEngineeringNote(p.notes)};});
  const routeSchedule=snapshot.routes.map((route)=>{const p=route.properties||{},item=catalog.get(route.catalogCode)||{},base=routeLengthMeters(snapshot,route,settings),waste=Math.max(0,num(p.routeWastePercent==null?snapshot.takeoffSettings.routeWastePercent:p.routeWastePercent)),numberOfCables=Math.max(1,num(p.numberOfCables,1)),spareLength=Math.max(0,num(p.spareLengthM)),cableBase=(base+spareLength)*numberOfCables;return{id:route.id,code:route.catalogCode,label:route.label||route.catalogCode,description_ar:item.name_ar||route.catalogCode,description_en:item.name_en||route.catalogCode,from:p.fromLabel||snapshot.nodes.find((x)=>x.id===route.sourceNodeId)?.label||'',to:p.toLabel||snapshot.nodes.find((x)=>x.id===route.targetNodeId)?.label||'',level:p.networkLevel||'',installation:p.installation||'',base_length:round(base,2),waste_percent:waste,planned_length:round(base*(1+waste/100),2),number_of_cables:numberOfCables,spare_length:spareLength,cable_required:round(cableBase*(1+waste/100),2),ways:p.ways??'',diameter:p.diameter||'',cable_code:p.cableCode||'',fiber_cores:p.fiberCores??'',connectors:num(p.connectorCount),open_bundle:num(p.openBundle),end_bundle:num(p.endBundle),notes:cleanEngineeringNote(p.notes)};});
  const notes=[];
  if(snapshot.generalNotes.trim())notes.push({kind:'drawing',id:'drawing',label_ar:'ملاحظات عامة للرسم',label_en:'General drawing notes',body:snapshot.generalNotes.trim()});
  nodeSchedule.filter((x)=>x.notes).forEach((x)=>notes.push({kind:'node',id:x.id,label_ar:`${x.label} — ملاحظة عنصر`,label_en:`${x.label} — node note`,body:cleanEngineeringNote(x.notes)}));
  routeSchedule.filter((x)=>x.notes).forEach((x)=>notes.push({kind:'route',id:x.id,label_ar:`${x.label} — ملاحظة مسار`,label_en:`${x.label} — route note`,body:cleanEngineeringNote(x.notes)}));
  const totalRouteLength=round(routeSchedule.reduce((s,x)=>s+x.base_length,0),2),plannedRouteLength=round(routeSchedule.reduce((s,x)=>s+x.planned_length,0),2);
  const fiberLength=round(rows.filter((x)=>String(x.code).startsWith('FO-')).reduce((s,x)=>s+x.quantity,0),2);
  const accessoryQty=round(rows.filter((x)=>x.category==='accessory').reduce((s,x)=>s+x.quantity,0),2);
  return{rows,nodeSchedule,routeSchedule,notes,summary:{nodeCount:nodeSchedule.length,routeCount:routeSchedule.length,totalRouteLength,plannedRouteLength,fiberLength,accessoryQty,materialLineCount:rows.length,manualLineCount:rows.filter((x)=>x.source_kind!=='auto').length}};
}

export function validateEngineeringSnapshot(snapshotInput,catalogInput=[],settings={}){
  const snapshot=normalizeEngineeringSnapshot(snapshotInput),catalog=new Map((catalogInput||[]).map((x)=>[x.code,x]));
  const issues=[];
  const add=(severity,code,kind,id,ar,en)=>issues.push({id:`${code}:${kind||'drawing'}:${id||'root'}`,severity,code,kind,id,message_ar:ar,message_en:en});
  if(!snapshot.nodes.length&&!snapshot.routes.length)add('suggestion','empty_drawing','drawing',null,'ابدأ بإضافة عنصر أو استخدم صورة اسكتش كمرجع.','Add a node or use a sketch image as a reference.');
  const labels=new Map(),boxNos=new Map();
  snapshot.nodes.forEach((node)=>{
    const item=catalog.get(node.catalogCode),props=node.properties||{};
    if(!String(node.label||'').trim())add('warning','node_label_missing','node',node.id,'العنصر بلا اسم واضح على الرسم.','The node has no clear drawing label.');
    if(!props.networkLevel&&!props.businessRole)add('warning','node_level_missing','node',node.id,'حدد هل العنصر رئيسي أم ثانوي أو نهائي.','Set whether the node is main, secondary, or terminal.');
    if(item?.symbol_key==='termination_box'&&!String(props.boxNo||'').trim())add('warning','box_number_missing','node',node.id,'أدخل رقم البوكس لتسهيل التتبع والحصر.','Enter the box number for tracking and takeoff.');
    const label=String(node.label||'').trim().toLowerCase();if(label){if(labels.has(label))add('error','duplicate_node_label','node',node.id,'اسم العنصر مكرر داخل الرسم.','The node label is duplicated.');else labels.set(label,node.id);}
    const box=String(props.boxNo||'').trim().toLowerCase();if(box){if(boxNos.has(box))add('error','duplicate_box_number','node',node.id,'رقم البوكس مكرر داخل الرسم.','The box number is duplicated.');else boxNos.set(box,node.id);}
    const connected=snapshot.routes.filter((r)=>r.sourceNodeId===node.id||r.targetNodeId===node.id);
    if(!connected.length)add('suggestion','orphan_node','node',node.id,'العنصر غير مربوط بأي مسار.','The node is not connected to any route.');
    const halfW=Math.max(20,num(node.width,78)/2),halfH=Math.max(18,num(node.height,56)/2);
    const safeDrawingWidth=num(settings.width,1600);if(node.x-halfW<20||node.y-halfH<20||node.x+halfW>safeDrawingWidth-20||node.y+halfH>num(settings.height,1000)-40)add('warning','node_near_sheet_edge','node',node.id,'العنصر خارج مساحة الرسم الآمنة أو قريب جدًا من إطار الشيت.','The node is outside the safe drawing area or too close to the sheet frame.');
  });
  const pairs=new Set();
  snapshot.routes.forEach((route)=>{
    const props=route.properties||{},points=routeResolvedPoints(snapshot,route),length=routeLengthMeters(snapshot,route,settings);
    if(points.length<2||length<=0)add('error','invalid_route','route',route.id,'المسار غير مكتمل أو طوله صفر.','The route is incomplete or has zero length.');
    if(!props.networkLevel)add('warning','route_level_missing','route',route.id,'حدد مستوى المسار: رئيسي أو ثانوي أو توصيلة.','Set the route level: main, secondary, or drop.');
    if(!props.installation)add('warning','route_installation_missing','route',route.id,'حدد طريقة التنفيذ: أرضي أو هوائي أو داخلي.','Set the installation type: underground, aerial, or indoor.');
    if(route.manualLength===null)add('suggestion','actual_length_missing','route',route.id,'الطول محسوب من الرسم؛ أدخل الطول الحقيقي قبل الإصدار النهائي.','Length is calculated from geometry; enter the real length before final issue.');
    if(!String(route.label||'').trim())add('warning','route_label_missing','route',route.id,'أدخل بيانًا واضحًا للمسار ليظهر في الرسم وAutoCAD.','Add a clear route label for the drawing and AutoCAD export.');
    if(!route.sourceNodeId||!route.targetNodeId)add('warning','route_not_connected','route',route.id,'اربط طرفي المسار بعناصر لتتحرك الأطراف معها تلقائيًا.','Connect both route ends to nodes so endpoints follow them automatically.');
    const source=route.sourceNodeId?snapshot.nodes.find((x)=>x.id===route.sourceNodeId):null,target=route.targetNodeId?snapshot.nodes.find((x)=>x.id===route.targetNodeId):null;
    if(route.sourceNodeId&&!source)add('error','route_source_missing','route',route.id,'عنصر بداية المسار غير موجود. أعد ربط المسار.','The route source node is missing. Reconnect the route.');
    if(route.targetNodeId&&!target)add('error','route_target_missing','route',route.id,'عنصر نهاية المسار غير موجود. أعد ربط المسار.','The route target node is missing. Reconnect the route.');
    if(route.sourceNodeId&&route.targetNodeId&&route.sourceNodeId===route.targetNodeId)add('error','route_self_connection','route',route.id,'لا يمكن أن يبدأ المسار وينتهي في نفس العنصر.','A route cannot start and end at the same node.');
    if(source&&target){
      const base=[source.id,target.id].sort().join('|'),exact=`${base}|${route.catalogCode}`;
      if(pairs.has(exact))add('error','duplicate_connection','route',route.id,'نفس نوع المسار مكرر بين العنصرين. احذف النسخة الزائدة أو غيّر النوع.','The same route type is duplicated between these nodes. Remove the duplicate or change its type.');
      else if([...pairs].some((key)=>key.startsWith(`${base}|`)))add('suggestion','parallel_route','route',route.id,'يوجد أكثر من مسار بين نفس العنصرين؛ تأكد أنه مقصود.','There is more than one route between the same nodes; verify that it is intentional.');
      pairs.add(exact);
      const cableCores=Math.max(0,num(props.fiberCores,catalog.get(props.cableCode)?.default_properties?.cores||catalog.get(route.catalogCode)?.default_properties?.cores||0));
      for(const endpoint of [source,target]){const cap=Math.max(0,num(endpoint.properties?.capacity,endpoint.properties?.ports||catalog.get(endpoint.catalogCode)?.default_properties?.cores||0));if(cableCores&&cap&&cableCores>cap)add('error','endpoint_capacity_exceeded','route',route.id,`سعة الكابل ${cableCores} أكبر من سعة العنصر ${endpoint.label||endpoint.catalogCode} (${cap}).`,`Cable capacity ${cableCores} exceeds ${endpoint.label||endpoint.catalogCode} capacity (${cap}).`);}
    }
    const routeItem=catalog.get(route.catalogCode);if(routeItem?.symbol_key==='microduct'&&!props.cableCode)add('suggestion','duct_without_cable','route',route.id,'المسار بلا كابل داخلي؛ أضفه لو كان منفذًا.','The duct has no inner cable; add one if installed.');
    if(points.some((p)=>p.x<0||p.y<0||p.x>num(settings.width,1600)||p.y>num(settings.height,1000)))add('error','route_outside_sheet','route',route.id,'جزء من المسار خارج حدود الشيت.','Part of the route is outside the sheet.');
  });
  return {issues,errorCount:issues.filter((x)=>x.severity==='error').length,warningCount:issues.filter((x)=>x.severity==='warning').length,suggestionCount:issues.filter((x)=>x.severity==='suggestion').length};
}

export function diffEngineeringSnapshots(previousInput, currentInput) {
  const previous = normalizeEngineeringSnapshot(previousInput), current = normalizeEngineeringSnapshot(currentInput);
  const compare = (oldRows,newRows) => {
    const oldMap=new Map(oldRows.map((x)=>[x.id,x])),newMap=new Map(newRows.map((x)=>[x.id,x]));
    const added=[],removed=[],changed=[];
    newRows.forEach((row)=>{if(!oldMap.has(row.id))added.push(row);else if(JSON.stringify(oldMap.get(row.id))!==JSON.stringify(row))changed.push({before:oldMap.get(row.id),after:row});});
    oldRows.forEach((row)=>{if(!newMap.has(row.id))removed.push(row);});
    return {added,removed,changed};
  };
  return { nodes:compare(previous.nodes,current.nodes), routes:compare(previous.routes,current.routes), annotations:compare(previous.annotations,current.annotations) };
}

function dxfUnicode(value='') {
  return String(value ?? '').replace(/[\\{}]/g, (c)=>`\\${c}`).replace(/[^\x20-\x7E]/g, (c)=>{
    const cp=c.codePointAt(0); return `\\U+${cp.toString(16).toUpperCase().padStart(cp>0xFFFF?8:4,'0')}`;
  }).replace(/[\r\n]+/g,'\\P');
}
function dxfTextChunks(value='',maxEncodedLength=230){
  const chunks=[];let current='',encodedLength=0;
  for(const character of String(value??'')){
    const length=dxfUnicode(character).length;
    if(current&&encodedLength+length>maxEncodedLength){chunks.push(current);current='';encodedLength=0;}
    current+=character;encodedLength+=length;
  }
  if(current||!chunks.length)chunks.push(current);return chunks;
}
function hexToTrueColor(hex='#000000'){const m=String(hex).match(/[0-9a-f]{6}/i);return m?parseInt(m[0],16):0;}
function dxfText(text,x,y,height=3,layer='TEXT',rotation=0,align=0,width=72) {
  const hAlign=align===1?1:align===2?2:0;
  return `0\nTEXT\n100\nAcDbEntity\n8\n${layer}\n100\nAcDbText\n10\n${round(x,4)}\n20\n${round(y,4)}\n30\n0\n40\n${height}\n1\n${dxfUnicode(text)}\n50\n${rotation}\n7\nOPTIMUM_AR\n72\n${hAlign}\n73\n0\n11\n${round(x,4)}\n21\n${round(y,4)}\n31\n0\n`;
}
function dxfPolyline(points,layer,closed=false){if(!points?.length)return '';return `0\nLWPOLYLINE\n100\nAcDbEntity\n8\n${layer}\n100\nAcDbPolyline\n90\n${points.length}\n70\n${closed?1:0}\n${points.map((p)=>`10\n${round(p.x,4)}\n20\n${round(p.y,4)}\n`).join('')}`;}
function dxfLine(a,b,layer){return `0\nLINE\n100\nAcDbEntity\n8\n${layer}\n100\nAcDbLine\n10\n${round(a.x,4)}\n20\n${round(a.y,4)}\n30\n0\n11\n${round(b.x,4)}\n21\n${round(b.y,4)}\n31\n0\n`;}
export function exportEngineeringDxf(snapshotInput, metadata = {}, settings = {}) {
  const snapshot=normalizeEngineeringSnapshot(snapshotInput),catalog=settings.catalog||metadata.catalog||[],catalogMap=new Map(catalog.map((x)=>[x.code,x]));
  const W=num(settings.width,1600),H=num(settings.height,1000),panel=settings.titleBlock===false?0:Math.max(270,num(settings.framePanelWidth,310)),gap=10,totalW=W+(panel?gap+panel:0),frameColor=3;
  const pairs=[];const add=(c,v)=>{pairs.push(String(c),String(v??''));};const entity=(type,layer='0',color=null)=>{add(0,type);add(100,'AcDbEntity');add(8,layer);if(color!=null)add(62,color);};
  const aci=(hex)=>{const h=String(hex||'').toLowerCase();if(h.includes('dc2626')||h.includes('ef4444')||h.includes('e11d48'))return 1;if(h.includes('d97706')||h.includes('ff8a00'))return 30;if(h.includes('16a34a')||h.includes('137a55')||h.includes('22c55e'))return 3;if(h.includes('2563eb')||h.includes('3b82f6'))return 5;if(h.includes('7c3aed')||h.includes('8b5cf6'))return 6;if(h.includes('0f766e')||h.includes('14b8a6'))return 4;return 7;};
  const cleanLayer=(v)=>String(v||'0').normalize('NFKD').replace(/[^A-Za-z0-9_$-]/g,'_').slice(0,40)||'0';
  const xy=(p)=>({x:round(num(p.x),4),y:round(H-num(p.y),4)});
  const line=(a,b,layer='0',color=null)=>{entity('LINE',layer,color);add(100,'AcDbLine');add(10,round(a.x,4));add(20,round(a.y,4));add(30,0);add(11,round(b.x,4));add(21,round(b.y,4));add(31,0);};
  const poly=(pts,layer='0',color=null,closed=false,width=0)=>{if(!pts?.length)return;entity('LWPOLYLINE',layer,color);add(100,'AcDbPolyline');add(90,pts.length);add(70,closed?1:0);if(width>0)add(43,width);pts.forEach((p)=>{add(10,round(p.x,4));add(20,round(p.y,4));});};
  const rect=(x,y,w,h,layer='0',color=null,width=0)=>poly([{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}],layer,color,true,width);
  const circle=(x,y,r,layer='0',color=null)=>{entity('CIRCLE',layer,color);add(100,'AcDbCircle');add(10,round(x,4));add(20,round(y,4));add(30,0);add(40,round(r,4));};
  const mtext=(value,x,y,height=12,width=260,layer='TEXT',color=null,align=5,rotation=0,flipX=false,flipY=false,lineHeight=1.34)=>{const lines=String(value??'').replace(/\P/g,'\n').split(/\r?\n/).map((v)=>v.trim()).filter(Boolean).flatMap((line)=>dxfTextChunks(line));if(!lines.length)return;const horizontal=align===4?0:align===6?2:1,lineGap=height*Math.max(1,Math.min(2,num(lineHeight,1.34))),startY=y+(lines.length-1)*lineGap/2,mirror=(flipX?2:0)+(flipY?4:0);lines.forEach((lineText,index)=>{entity('TEXT',layer,color);add(100,'AcDbText');add(10,round(x,4));add(20,round(startY-index*lineGap,4));add(30,0);add(40,round(height,4));add(1,dxfUnicode(lineText));add(7,'OPTIMUM');add(50,round(rotation,4));add(71,mirror);add(72,horizontal);add(73,2);add(11,round(x,4));add(21,round(startY-index*lineGap,4));add(31,0);});};
  const layers=new Map([['0',{color:7,lw:25}],['FRAME',{color:frameColor,lw:30}],['TITLE_GRID',{color:5,lw:20}],['TITLE_TEXT',{color:7,lw:18}],['NODE_CABINET',{color:5,lw:35}],['NODE_TERMINAL',{color:1,lw:30}],['NODE_OPTICAL',{color:1,lw:25}],['NODE_CIVIL',{color:8,lw:30}],['NODE_JOINT',{color:6,lw:30}],['NODE_TEXT',{color:7,lw:18}],['ROUTE_TEXT',{color:7,lw:18}],['NOTES',{color:7,lw:18}],['REVIEW',{color:1,lw:25}]]);
  snapshot.routes.forEach((r)=>{const item=catalogMap.get(r.catalogCode),name=cleanLayer(item?.default_properties?.dxf_layer||`ROUTE_${r.catalogCode||'GEN'}`);layers.set(name,{color:aci(catalogColor(item)),lw:35});});
  add(0,'SECTION');add(2,'HEADER');add(9,'$ACADVER');add(1,'AC1015');add(9,'$INSUNITS');add(70,4);add(9,'$EXTMIN');add(10,0);add(20,0);add(30,0);add(9,'$EXTMAX');add(10,totalW);add(20,H);add(30,0);add(0,'ENDSEC');
  add(0,'SECTION');add(2,'TABLES');add(0,'TABLE');add(2,'LTYPE');add(100,'AcDbSymbolTable');add(70,2);add(0,'LTYPE');add(100,'AcDbSymbolTableRecord');add(100,'AcDbLinetypeTableRecord');add(2,'CONTINUOUS');add(70,0);add(3,'Solid line');add(72,65);add(73,0);add(40,0);add(0,'LTYPE');add(100,'AcDbSymbolTableRecord');add(100,'AcDbLinetypeTableRecord');add(2,'DASHED');add(70,0);add(3,'Dashed __ __');add(72,65);add(73,2);add(40,.75);add(49,.5);add(74,0);add(49,-.25);add(74,0);add(0,'ENDTAB');
  add(0,'TABLE');add(2,'LAYER');add(100,'AcDbSymbolTable');add(70,layers.size);for(const [name,meta] of layers){add(0,'LAYER');add(100,'AcDbSymbolTableRecord');add(100,'AcDbLayerTableRecord');add(2,name);add(70,0);add(62,meta.color);add(6,'CONTINUOUS');add(370,meta.lw);}add(0,'ENDTAB');
  add(0,'TABLE');add(2,'STYLE');add(100,'AcDbSymbolTable');add(70,1);add(0,'STYLE');add(100,'AcDbSymbolTableRecord');add(100,'AcDbTextStyleTableRecord');add(2,'OPTIMUM');add(70,0);add(40,0);add(41,1);add(50,0);add(71,0);add(42,12);add(3,'Arial.ttf');add(4,'');add(0,'ENDTAB');add(0,'ENDSEC');
  add(0,'SECTION');add(2,'BLOCKS');for(const name of ['*Model_Space','*Paper_Space']){add(0,'BLOCK');add(100,'AcDbEntity');add(8,'0');add(100,'AcDbBlockBegin');add(2,name);add(70,0);add(10,0);add(20,0);add(30,0);add(3,name);add(1,'');add(0,'ENDBLK');add(100,'AcDbEntity');add(8,'0');add(100,'AcDbBlockEnd');}add(0,'ENDSEC');
  add(0,'SECTION');add(2,'ENTITIES');rect(10,10,W-20,H-20,'FRAME');rect(16,16,W-32,H-32,'FRAME');
  snapshot.routes.forEach((route)=>{const item=catalogMap.get(route.catalogCode),layer=cleanLayer(item?.default_properties?.dxf_layer||`ROUTE_${route.catalogCode||'GEN'}`),resolved=routeResolvedPoints(snapshot,route,catalogMap),pts=resolved.map(xy);poly(pts,layer);const lines=routeDisplayLines(snapshot,route,item,settings,'  ·  '),position=routeLabelPosition(snapshot,route,resolved,catalogMap,settings,lines),mid=xy(position),align=route.labelAlign==='start'?4:route.labelAlign==='end'?6:5;mtext(lines.join('\n'),mid.x,mid.y,Math.max(10,num(route.labelFontSize,11)),360,'ROUTE_TEXT',null,align,-num(route.labelRotation),route.labelFlipX,route.labelFlipY,route.labelLineHeight);});
  const nodeLayer=(symbol)=>['main_cabinet','sub_cabinet','fdt','tdm'].includes(symbol)?'NODE_CABINET':['termination_box','fat','odb'].includes(symbol)?'NODE_TERMINAL':['odf','lgx','splitter'].includes(symbol)?'NODE_OPTICAL':['manhole','handhole','chamber','pole'].includes(symbol)?'NODE_CIVIL':['joint','closure'].includes(symbol)?'NODE_JOINT':'NODE_TERMINAL';
  snapshot.nodes.forEach((node)=>{const item=catalogMap.get(node.catalogCode),p=node.properties||{},metrics=nodeVisualMetrics(node,item,'en'),symbol=metrics.symbol,c=xy(node),layer=nodeLayer(symbol),title=node.label||item?.name_en||node.catalogCode,caption=item?.name_en||item?.code||node.catalogCode,showCaption=String(caption||'').trim()&&String(caption).trim()!==String(title).trim();if(symbol==='joint'||symbol==='closure'){const r=30;poly([{x:c.x,y:c.y+r},{x:c.x+r,y:c.y},{x:c.x,y:c.y-r},{x:c.x-r,y:c.y}],layer,null,true);mtext(title,c.x,c.y+5,13,70,'NODE_TEXT',null,5);if(showCaption)mtext(caption,c.x,c.y-43,8,150,'NODE_TEXT',null,5);return;}if(symbol==='pole'){line({x:c.x,y:c.y-31},{x:c.x,y:c.y+31},layer);circle(c.x,c.y,10,layer);mtext(title,c.x,c.y-43,11,150,'NODE_TEXT',null,5);if(showCaption)mtext(caption,c.x,c.y-60,8,160,'NODE_TEXT',null,5);return;}if(symbol==='manhole'||symbol==='chamber'){circle(c.x,c.y,31,layer);circle(c.x,c.y,20,layer);mtext(title,c.x,c.y+4,12,80,'NODE_TEXT',null,5);if(showCaption)mtext(caption,c.x,c.y-47,8,180,'NODE_TEXT',null,5);return;}if(symbol==='handhole'){rect(c.x-36,c.y-28,72,56,layer);line({x:c.x-25,y:c.y},{x:c.x+25,y:c.y},layer);line({x:c.x,y:c.y-17},{x:c.x,y:c.y+17},layer);mtext(title,c.x,c.y-43,11,150,'NODE_TEXT',null,5);if(showCaption)mtext(caption,c.x,c.y-59,8,180,'NODE_TEXT',null,5);return;}const details=nodeFixedDetailLines(node,item,'en'),values=[['NO',p.boxNo||'—'],['CORE',p.capacity||p.coreRange||'—'],['PORT',p.ports||'—'],['TYPE',item?.code||node.catalogCode]],w=metrics.width,h=metrics.height,x=c.x-w/2,y=c.y-h/2,headerH=26,baseRowH=25;rect(x,y,w,h,layer);line({x,y:y+h-headerH},{x:x+w,y:y+h-headerH},layer);mtext(title,c.x,y+h-9,14,w-8,'NODE_TEXT',null,5);for(let row=0;row<2;row++){const yy=y+h-headerH-(row+1)*baseRowH;line({x,y:yy},{x:x+w,y:yy},layer);line({x:x+w/2,y:yy},{x:x+w/2,y:yy+baseRowH},layer);}values.forEach(([key,value],index)=>{const row=Math.floor(index/2),column=index%2,tx=x+column*w/2+7,ty=y+h-headerH-row*baseRowH-17;mtext(`${key} ${value}`,tx,ty,8.5,w/2-10,'NODE_TEXT',null,4);});details.forEach((value,index)=>mtext(value,x+9,y+h-headerH-2*baseRowH-12-index*12,7.5,w-18,'NODE_TEXT',null,4));if(showCaption)mtext(caption,c.x,y-14,8,Math.max(180,w+50),'NODE_TEXT',null,5);});
  snapshot.annotations.forEach((a)=>{const p=xy(a);mtext(a.text,p.x,p.y,Math.max(10,num(a.size,18)),360,'NOTES',null,4,-num(a.rotation));});
  if(panel){const px=W+gap,tx=px+12,top=H-18;rect(px,10,panel-10,H-20,'FRAME');mtext('N',tx+12,top-4,26,40,'TITLE_TEXT',null,5);line({x:tx+12,y:top-15},{x:tx+12,y:top-52},'TITLE_TEXT');line({x:tx-5,y:top-34},{x:tx+29,y:top-34},'TITLE_TEXT');mtext('LEGEND / الرموز',px+panel/2,top-8,19,panel-35,'TITLE_TEXT',null,5);const usedRoutes=[...new Set(snapshot.routes.map((x)=>x.catalogCode))].map((c)=>catalogMap.get(c)).filter(Boolean).slice(0,8);let ly=top-72;usedRoutes.forEach((item)=>{const layer=cleanLayer(item.default_properties?.dxf_layer||`ROUTE_${item.code}`);line({x:tx,y:ly},{x:tx+62,y:ly},layer);mtext(item.name_en||item.code,tx+72,ly+4,10,panel-100,'TITLE_TEXT',null,4);ly-=26;});const t={...(settings.titleBlockData||{}),...metadata};const info=[['PROJECT',t.project||t.projectCode||'—'],['SITE',t.site||'—'],['DRAWING NO',t.drawingNo||'—'],['TITLE',t.title||'—'],['CLIENT',t.client||'—'],['CONSULTANT',t.consultant||'—'],['MAIN CONTRACTOR',t.mainContractor||t.contractor||'—'],['SUB CONTRACTOR',t.subContractor||t.company||'Optimum'],['REV',t.revision||'R0'],['STATUS',t.status||'DRAFT'],['SCALE',settings.scale||'NTS'],['DATE',t.date||new Date().toISOString().slice(0,10)]];let iy=Math.min(ly-16,H-330);info.forEach(([label,value])=>{line({x:px,y:iy},{x:px+panel-10,y:iy},'TITLE_GRID');mtext(label,tx,iy-9,8,panel-30,'TITLE_TEXT',null,4);mtext(value,tx,iy-27,12,panel-30,'TITLE_TEXT',null,4);iy-=48;});line({x:px,y:iy},{x:px+panel-10,y:iy},'TITLE_GRID');mtext('DRAWN / CHECKED / APPROVED',px+panel/2,iy-18,9,panel-25,'TITLE_TEXT',null,5);mtext(`${t.designer||'—'}  /  ${t.checkedBy||'—'}  /  ${t.approvedBy||'—'}`,px+panel/2,iy-39,10,panel-25,'TITLE_TEXT',null,5);}
  add(0,'ENDSEC');add(0,'EOF');return pairs.join('\r\n')+'\r\n';
}

// Conservative ASCII DXF for maximum compatibility with AutoCAD and third-party
// viewers. R12 avoids the mandatory object/handle tables introduced in R2000,
// while keeping every route, symbol, label and frame entity independently editable.
export function exportEngineeringDxfCompatible(snapshotInput, metadata = {}, settings = {}) {
  const snapshot=normalizeEngineeringSnapshot(snapshotInput),catalog=settings.catalog||metadata.catalog||[],catalogMap=new Map(catalog.map((x)=>[x.code,x]));
  const W=num(settings.width,1600),H=num(settings.height,1000),panel=settings.titleBlock===false?0:Math.max(270,num(settings.framePanelWidth,310)),gap=10,totalW=W+(panel?gap+panel:0),pairs=[];
  const add=(code,value)=>{pairs.push(String(code),String(value??''));};
  const cleanLayer=(value)=>String(value||'0').normalize('NFKD').replace(/[^A-Za-z0-9_$-]/g,'_').slice(0,40)||'0';
  const aci=(hex)=>{const h=String(hex||'').toLowerCase();if(/dc2626|ef4444|e11d48/.test(h))return 1;if(/d97706|ff8a00/.test(h))return 30;if(/16a34a|137a55|22c55e/.test(h))return 3;if(/2563eb|3b82f6/.test(h))return 5;if(/7c3aed|8b5cf6/.test(h))return 6;if(/0f766e|14b8a6/.test(h))return 4;return 7;};
  const xy=(point)=>({x:round(num(point.x),4),y:round(H-num(point.y),4)});
  const line=(a,b,layer='0',color=null)=>{add(0,'LINE');add(8,layer);if(color!=null)add(62,color);add(10,round(a.x,4));add(20,round(a.y,4));add(30,0);add(11,round(b.x,4));add(21,round(b.y,4));add(31,0);};
  const poly=(points,layer='0',color=null,closed=false)=>{if(!points?.length)return;add(0,'POLYLINE');add(8,layer);if(color!=null)add(62,color);add(66,1);add(70,closed?1:0);add(10,0);add(20,0);add(30,0);points.forEach((point)=>{add(0,'VERTEX');add(8,layer);add(10,round(point.x,4));add(20,round(point.y,4));add(30,0);});add(0,'SEQEND');add(8,layer);};
  const rect=(x,y,w,h,layer='0',color=null)=>poly([{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}],layer,color,true);
  const circle=(x,y,r,layer='0',color=null)=>{add(0,'CIRCLE');add(8,layer);if(color!=null)add(62,color);add(10,round(x,4));add(20,round(y,4));add(30,0);add(40,round(r,4));};
  const text=(value,x,y,height=10,layer='TEXT',color=null,align=0,rotation=0,flipX=false,flipY=false,lineHeight=1.35)=>{const rows=String(value??'').split(/\r?\n/).map((row)=>row.trim()).filter(Boolean).flatMap((row)=>dxfTextChunks(row));const lineGap=height*Math.max(1,Math.min(2,num(lineHeight,1.35))),startY=y+(rows.length-1)*lineGap/2,mirror=(flipX?2:0)+(flipY?4:0);rows.forEach((row,index)=>{const yy=startY-index*lineGap;add(0,'TEXT');add(8,layer);if(color!=null)add(62,color);add(10,round(x,4));add(20,round(yy,4));add(30,0);add(40,round(height,4));add(1,dxfUnicode(row));add(7,'STANDARD');add(50,round(rotation,4));add(71,mirror);if(align){add(72,align);add(73,2);add(11,round(x,4));add(21,round(yy,4));add(31,0);}});};
  const layers=new Map([['0',7],['FRAME',3],['TITLE_GRID',3],['TITLE_TEXT',7],['NODE_CABINET',5],['NODE_TERMINAL',3],['NODE_OPTICAL',1],['NODE_CIVIL',8],['NODE_JOINT',6],['NODE_TEXT',7],['ROUTE_TEXT',7],['NOTES',7]]);
  snapshot.routes.forEach((route)=>{const item=catalogMap.get(route.catalogCode),name=cleanLayer(item?.default_properties?.dxf_layer||`ROUTE_${route.catalogCode||'GEN'}`);layers.set(name,aci(catalogColor(item)));});
  add(0,'SECTION');add(2,'HEADER');add(9,'$ACADVER');add(1,'AC1009');add(9,'$INSBASE');add(10,0);add(20,0);add(30,0);add(9,'$EXTMIN');add(10,0);add(20,0);add(9,'$EXTMAX');add(10,totalW);add(20,H);add(0,'ENDSEC');
  add(0,'SECTION');add(2,'TABLES');
  add(0,'TABLE');add(2,'LTYPE');add(70,1);add(0,'LTYPE');add(2,'CONTINUOUS');add(70,0);add(3,'Solid line');add(72,65);add(73,0);add(40,0);add(0,'ENDTAB');
  add(0,'TABLE');add(2,'LAYER');add(70,layers.size);for(const [name,color] of layers){add(0,'LAYER');add(2,name);add(70,0);add(62,color);add(6,'CONTINUOUS');}add(0,'ENDTAB');
  add(0,'TABLE');add(2,'STYLE');add(70,1);add(0,'STYLE');add(2,'STANDARD');add(70,0);add(40,0);add(41,1);add(50,0);add(71,0);add(42,10);add(3,'Arial.ttf');add(4,'');add(0,'ENDTAB');add(0,'ENDSEC');
  add(0,'SECTION');add(2,'BLOCKS');add(0,'ENDSEC');add(0,'SECTION');add(2,'ENTITIES');
  rect(10,10,W-20,H-20,'FRAME');rect(16,16,W-32,H-32,'FRAME');
  snapshot.routes.forEach((route)=>{const item=catalogMap.get(route.catalogCode),layer=cleanLayer(item?.default_properties?.dxf_layer||`ROUTE_${route.catalogCode||'GEN'}`),resolved=routeResolvedPoints(snapshot,route,catalogMap),points=resolved.map(xy);poly(points,layer,aci(catalogColor(item)));const lines=routeDisplayLines(snapshot,route,item,settings,'  -  '),position=routeLabelPosition(snapshot,route,resolved,catalogMap,settings,lines),mid=xy(position),align=route.labelAlign==='start'?0:route.labelAlign==='end'?2:1;text(lines.join('\n'),mid.x,mid.y,Math.max(9,num(route.labelFontSize,11)),'ROUTE_TEXT',7,align,-num(route.labelRotation),route.labelFlipX,route.labelFlipY,route.labelLineHeight);});
  const nodeLayer=(symbol)=>['main_cabinet','sub_cabinet','fdt','tdm'].includes(symbol)?'NODE_CABINET':['termination_box','fat','odb'].includes(symbol)?'NODE_TERMINAL':['odf','lgx','splitter'].includes(symbol)?'NODE_OPTICAL':['manhole','handhole','chamber','pole'].includes(symbol)?'NODE_CIVIL':['joint','closure'].includes(symbol)?'NODE_JOINT':'NODE_TERMINAL';
  snapshot.nodes.forEach((node)=>{const item=catalogMap.get(node.catalogCode),props=node.properties||{},metrics=nodeVisualMetrics(node,item,'en'),symbol=metrics.symbol,center=xy(node),layer=nodeLayer(symbol),title=node.label||item?.name_en||node.catalogCode,caption=item?.name_en||item?.code||node.catalogCode,showCaption=String(caption||'').trim()&&String(caption).trim()!==String(title).trim();if(symbol==='joint'||symbol==='closure'){poly([{x:center.x,y:center.y+28},{x:center.x+30,y:center.y},{x:center.x,y:center.y-28},{x:center.x-30,y:center.y}],layer,6,true);text(title,center.x,center.y+4,12,'NODE_TEXT',7,1);if(showCaption)text(caption,center.x,center.y-43,8,'NODE_TEXT',7,1);return;}if(symbol==='pole'){line({x:center.x,y:center.y-31},{x:center.x,y:center.y+31},layer,4);circle(center.x,center.y,10,layer,4);text(title,center.x,center.y-43,10,'NODE_TEXT',7,1);if(showCaption)text(caption,center.x,center.y-60,8,'NODE_TEXT',7,1);return;}if(['manhole','chamber'].includes(symbol)){circle(center.x,center.y,31,layer,8);circle(center.x,center.y,20,layer,8);text(title,center.x,center.y+4,11,'NODE_TEXT',7,1);if(showCaption)text(caption,center.x,center.y-47,8,'NODE_TEXT',7,1);return;}if(symbol==='handhole'){rect(center.x-36,center.y-28,72,56,layer,8);line({x:center.x-25,y:center.y},{x:center.x+25,y:center.y},layer,8);line({x:center.x,y:center.y-17},{x:center.x,y:center.y+17},layer,8);text(title,center.x,center.y-43,10,'NODE_TEXT',7,1);if(showCaption)text(caption,center.x,center.y-59,8,'NODE_TEXT',7,1);return;}const details=nodeFixedDetailLines(node,item,'en'),values=[['NO',props.boxNo||'-'],['CORE',props.capacity||props.coreRange||'-'],['PORT',props.ports||'-'],['TYPE',item?.code||node.catalogCode]],w=metrics.width,h=metrics.height,x=center.x-w/2,y=center.y-h/2,headerH=26,baseRowH=25;rect(x,y,w,h,layer,aci(catalogColor(item)));line({x,y:y+h-headerH},{x:x+w,y:y+h-headerH},layer);text(title,center.x,y+h-9,12,'NODE_TEXT',7,1);for(let row=0;row<2;row++){const yy=y+h-headerH-(row+1)*baseRowH;line({x,y:yy},{x:x+w,y:yy},layer);line({x:x+w/2,y:yy},{x:x+w/2,y:yy+baseRowH},layer);}values.forEach(([key,value],index)=>{const row=Math.floor(index/2),column=index%2,tx=x+column*w/2+7,ty=y+h-headerH-row*baseRowH-17;text(`${key} ${value}`,tx,ty,8.2,'NODE_TEXT',7,0);});details.forEach((value,index)=>text(value,x+9,y+h-headerH-2*baseRowH-12-index*12,7.2,'NODE_TEXT',7,0));if(showCaption)text(caption,center.x,y-14,8,'NODE_TEXT',7,1);});
  snapshot.annotations.forEach((annotation)=>{const point=xy(annotation);text(annotation.text,point.x,point.y,Math.max(8,num(annotation.size,18)),'NOTES',7,annotation.align==='middle'?1:annotation.align==='end'?2:0,-num(annotation.rotation));});
  if(panel){const px=W+gap,tx=px+12,top=H-18;rect(px,10,panel-10,H-20,'FRAME',3);text('LEGEND',tx,top-12,18,'TITLE_TEXT',7);let y=top-55;[...new Set(snapshot.routes.map((route)=>route.catalogCode))].slice(0,8).forEach((code)=>{const item=catalogMap.get(code),layer=cleanLayer(item?.default_properties?.dxf_layer||`ROUTE_${code}`);line({x:tx,y},{x:tx+55,y},layer,aci(catalogColor(item)));text(item?.name_en||code,tx+66,y+3,9,'TITLE_TEXT',7);y-=25;});const data={...(settings.titleBlockData||{}),...metadata},info=[['PROJECT',data.project||data.projectCode||'-'],['SITE',data.site||'-'],['DRAWING NO',data.drawingNo||'-'],['TITLE',data.title||'-'],['CLIENT',data.client||'-'],['CONSULTANT',data.consultant||'-'],['COMPANY',data.subContractor||data.company||'Optimum'],['REV',data.revision||'R0'],['STATUS',data.status||'DRAFT'],['SCALE',settings.scale||'NTS'],['DATE',data.date||new Date().toISOString().slice(0,10)]];let iy=Math.min(y-20,H-320);info.forEach(([key,value])=>{line({x:px,y:iy},{x:px+panel-10,y:iy},'TITLE_GRID',3);text(key,tx,iy-10,7,'TITLE_TEXT',7);text(value,tx,iy-28,10,'TITLE_TEXT',7);iy-=45;});}
  add(0,'ENDSEC');add(0,'EOF');return pairs.join('\r\n')+'\r\n';
}

function sheetDefaults(settings={}) {
  return {
    paper:'A3',orientation:'landscape',width:1600,height:1000,framePanelWidth:310,grid:20,snap:true,showGrid:true,
    meterPerGrid:1,scale:'NTS',titleBlock:true,legend:true,frameStyle:'company',frameColor:'#137A55',
    routeLabelMode:'full',nodeLabelMode:'full',printQuality:'high',
    titleBlockData:{projectCode:'',client:'',consultant:'',contractor:'',designer:'',checkedBy:'',approvedBy:'',sheetNo:'1/1',notes:'',governorate:'',district:'',village:'',coordinates:'',contractId:'',mainContractor:'Electro Cable Egypt',subContractor:'Optimum Management',drawingType:'Network Schematic',discipline:'Fiber Optic',cabinetNo:'',cabinetType:'',cabinetU:'',buildings:'',ports:'',odfConfiguration:'',lgxConfiguration:'',splitterConfiguration:'',cabinetBase:'',drawnDate:'',checkedDate:'',approvedDate:'',partNo:'1/1',logos:[]},
    ...settings, titleBlockData:{projectCode:'',client:'',consultant:'',contractor:'',designer:'',checkedBy:'',approvedBy:'',sheetNo:'1/1',notes:'',governorate:'',district:'',village:'',coordinates:'',contractId:'',mainContractor:'Electro Cable Egypt',subContractor:'Optimum Management',drawingType:'Network Schematic',discipline:'Fiber Optic',cabinetNo:'',cabinetType:'',cabinetU:'',buildings:'',ports:'',odfConfiguration:'',lgxConfiguration:'',splitterConfiguration:'',cabinetBase:'',drawnDate:'',checkedDate:'',approvedDate:'',partNo:'1/1',logos:[],...(settings.titleBlockData||{})}
  };
}
function catalogColor(item){const p=item?.default_properties||{};return p.color||({route:'#ff8a00',node:'#2563eb',accessory:'#7c3aed'}[item?.category]||'#64748b');}
function catalogFamily(item){
  const symbol=String(item?.symbol_key||'').toLowerCase(),category=String(item?.category||'').toLowerCase(),explicit=item?.default_properties?.palette_family;
  if(explicit&&explicit!=='other')return explicit;
  const map={
    main_cabinet:'cabinet',sub_cabinet:'cabinet',tdm_sub_cabinet:'cabinet',cabinet_base:'cabinet',
    fdt:'distribution',fat:'distribution',branch_point:'distribution',
    termination_box:'termination',odb:'termination',faceplate:'termination',wall_outlet:'termination',splitter_box:'termination',
    manhole:'civil',handhole:'civil',chamber:'civil',building:'site',villa:'site',
    pole:'aerial',joint:'closure',tdm:'active',
    odf:'optical',lgx:'optical',splitter:'optical',patch_panel:'optical',splice_tray:'optical',
    connector:'accessories',open_bundle:'accessories',end_bundle:'accessories',spare_loop:'accessories',
    microduct:'microduct',fiber_cable:'fiber',hdpe_duct:'civil_duct',conduit:'conduit',trench:'trench',suspension_wire:'support',preloaded_cable:'support'
  };
  if(map[symbol])return map[symbol];
  if(category==='accessory')return 'accessories';
  if(category==='route')return `route:${symbol||item?.code||'custom'}`;
  return `node:${symbol||item?.code||'custom'}`;
}
const NODE_FAMILY_META={
  cabinet:['الكابينات','Cabinets','building'],distribution:['نقاط التوزيع','Distribution points','platform'],termination:['بوكسات النهاية والمخارج','Termination boxes & outlets','box'],
  civil:['غرف ومناهيل','Chambers & manholes','circle'],site:['مبانٍ ومواقع','Buildings & sites','building'],aerial:['أعمدة وهوائي','Poles & aerial','activity'],
  closure:['وصلات ولحام','Closures & splicing','link'],active:['معدات نشطة','Active equipment','database'],optical:['ODF وLGX وSplitters','Optical equipment','box'],
  accessories:['إكسسوارات الشبكة','Network accessories','link']
};
const ROUTE_FAMILY_META={microduct:['ميكرو دكت','Microduct'],fiber:['كابلات فايبر','Fiber cables'],civil_duct:['مواسير HDPE','HDPE ducts'],conduit:['مواسير PVC','PVC conduits'],trench:['الحفر والعبور','Trenches & crossings'],support:['واير ودعامات','Support routes']};
function familyMeta(family,items=[],route=false){
  const base=(route?ROUTE_FAMILY_META:NODE_FAMILY_META)[family];if(base)return base;
  const first=items[0]||{},ar=first.name_ar||first.code||'عنصر مخصص',en=first.name_en||first.code||'Custom item';return [ar,en,route?'route':'box'];
}
function groupCatalog(rows){const map=new Map();rows.forEach((item)=>{const key=catalogFamily(item);if(!map.has(key))map.set(key,[]);map.get(key).push(item);});return [...map.entries()];}

function routeMidpoint(route){const points=route.points||[];if(!points.length)return{x:0,y:0};let total=0,parts=[];for(let i=1;i<points.length;i++){const length=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);parts.push({a:points[i-1],b:points[i],length});total+=length;}let target=total/2,walk=0;for(const part of parts){if(walk+part.length>=target){const t=part.length?(target-walk)/part.length:0;return{x:part.a.x+(part.b.x-part.a.x)*t,y:part.a.y+(part.b.y-part.a.y)*t};}walk+=part.length;}return points[points.length-1];}

export function engineeringSnapshotSvg(snapshotInput, options={}) {
  const snapshot=normalizeEngineeringSnapshot(snapshotInput),settings=sheetDefaults(options.settings),catalogMap=new Map((options.catalog||[]).map((x)=>[x.code,x]));
  const drawingWidth=num(settings.width,1600),height=num(settings.height,1000),panelWidth=settings.titleBlock?Math.max(250,num(settings.framePanelWidth,310)):0,gap=settings.titleBlock?8:0,totalWidth=drawingWidth+panelWidth+gap,margin=14,locale=options.locale||'ar',frameColor=settings.frameColor||'#137A55';
  const validation=options.validation||validateEngineeringSnapshot(snapshot,options.catalog||[],settings),issueObjects=new Set(validation.issues.filter((x)=>x.severity!=='suggestion').map((x)=>x.id));
  const selectedKeys=new Set(options.selectedSet||[]),selectedKind=options.selected?.kind,selectedId=options.selected?.id;
  const isSelected=(kind,id)=>selectedKeys.has(`${kind}:${id}`)||(selectedKind===kind&&selectedId===id);
  const clip=(v,n=28)=>{const t=String(v??'—');return t.length>n?`${t.slice(0,n-1)}…`:t;};
  const nodeColor=(item)=>{const symbol=item?.symbol_key||'';if(['main_cabinet','sub_cabinet','fdt'].includes(symbol))return '#2563EB';if(['termination_box','fat','odb'].includes(symbol))return '#16A34A';if(['odf','lgx','splitter'].includes(symbol))return '#EF4444';if(['joint','tdm'].includes(symbol))return '#7C3AED';if(['manhole','handhole','chamber'].includes(symbol))return '#475569';if(symbol==='pole')return '#0F766E';return catalogColor(item);};
  const defs=`<defs><pattern id="eng-grid" width="${settings.grid}" height="${settings.grid}" patternUnits="userSpaceOnUse"><path d="M ${settings.grid} 0 L 0 0 0 ${settings.grid}" fill="none" stroke="#dce5e9" stroke-width=".55" opacity=".55"/></pattern><filter id="eng-shadow"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity=".14"/></filter><clipPath id="drawing-clip"><rect x="${margin+8}" y="${margin+8}" width="${drawingWidth-margin*2-16}" height="${height-margin*2-16}"/></clipPath></defs>`;
  const safeX=margin+8,safeY=margin+8,safeW=drawingWidth-margin*2-16,safeH=height-margin*2-16;
  const grid=settings.showGrid?`<rect x="${safeX}" y="${safeY}" width="${safeW}" height="${safeH}" fill="url(#eng-grid)"/>`:'';
  const ref=options.referenceUrl&&snapshot.reference&&String(snapshot.reference.mimeType||'').startsWith('image/')?`<image href="${escapeXml(options.referenceUrl)}" x="${safeX+num(snapshot.reference.offsetX)}" y="${safeY+num(snapshot.reference.offsetY)}" width="${safeW*num(snapshot.reference.scale,1)}" height="${safeH*num(snapshot.reference.scale,1)}" preserveAspectRatio="xMidYMid ${snapshot.reference.fit==='cover'?'slice':'meet'}" opacity="${num(snapshot.reference.opacity,.35)}" transform="rotate(${num(snapshot.reference.rotation)} ${drawingWidth/2} ${height/2})" pointer-events="none"/>`:'';
  const routePathSvg=(route)=>{const item=catalogMap.get(route.catalogCode),props=route.properties||{},color=catalogColor(item),points=routeResolvedPoints(snapshot,route,catalogMap),selected=isSelected('route',route.id),invalid=issueObjects.has(route.id);return `<g data-eng-route="${escapeXml(route.id)}" class="eng-route ${selected?'selected':''} ${invalid?'has-issue':''}"><polyline points="${points.map((p)=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="${invalid?'#DC2626':color}" stroke-width="${selected?7:4}" stroke-linejoin="round" stroke-linecap="round" ${props.pathStyle==='dashed'?'stroke-dasharray="12 8"':''}/>${selected?points.map((p,i)=>`<circle data-eng-route-point="${escapeXml(route.id)}" data-index="${i}" cx="${p.x}" cy="${p.y}" r="6" class="eng-route-handle"/>`).join(''):''}</g>`;};
  const routeLabelSvg=(route)=>{
    const item=catalogMap.get(route.catalogCode),points=routeResolvedPoints(snapshot,route,catalogMap),selected=isSelected('route',route.id),font=Math.max(8,Math.min(48,num(route.labelFontSize,11))),lines=routeDisplayLines(snapshot,route,item,settings,' · ');if(!lines.length)return '';
    const position=routeLabelPosition(snapshot,route,points,catalogMap,settings,lines),lineHeight=Math.max(1,Math.min(2,num(route.labelLineHeight,1.28))),lineH=font*lineHeight,startY=-(lines.length-1)*lineH/2+font*.34,customCount=Math.max(0,lines.length-(route.labelShowTechnical!==false?1:0)),sx=route.labelFlipX?-1:1,sy=route.labelFlipY?-1:1,align=['start','middle','end'].includes(route.labelAlign)?route.labelAlign:'middle',boxW=Math.max(54,Math.max(...lines.map((line)=>String(line).length),1)*font*.58+16),boxH=Math.max(font*1.4,lines.length*lineH+8),boxX=align==='middle'?-boxW/2:align==='end'?-boxW:0,boxY=startY-font*.92-4;
    return `<g class="eng-route-label-text ${selected?'selected':''}" data-eng-route-label="${escapeXml(route.id)}" transform="translate(${position.x} ${position.y}) rotate(${num(route.labelRotation)}) scale(${sx} ${sy})"><rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="6" class="eng-route-label-hit" fill="transparent" pointer-events="all"/>${route.labelBackground?`<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="5" class="eng-route-label-background" fill="#fff" fill-opacity=".94" stroke="#CBD5E1" stroke-width="1"/>`:''}<g style="font-size:${font}px" class="${route.labelBold===false?'normal':''}">${lines.map((line,i)=>{const cls=i<customCount?'eng-route-title':'eng-route-tech',y=startY+i*lineH,txt=escapeXml(line);return `<text text-anchor="${align}" y="${y}" class="eng-route-halo ${cls}">${txt}</text><text text-anchor="${align}" y="${y}" class="eng-route-ink ${cls}">${txt}</text>`;}).join('')}</g></g>`;
  };
  const nodeSvg=(node)=>{
    const item=catalogMap.get(node.catalogCode),props=node.properties||{},color=nodeColor(item),metrics=nodeVisualMetrics(node,item,locale),symbol=metrics.symbol,selected=isSelected('node',node.id),invalid=issueObjects.has(node.id),title=node.label||item?.[locale==='ar'?'name_ar':'name_en']||node.catalogCode,caption=item?.[locale==='ar'?'name_ar':'name_en']||item?.code||node.catalogCode;
    const details=nodeFixedDetailLines(node,item,locale),w=metrics.width,h=metrics.height,stroke=invalid?'#DC2626':color,box=props.boxNo||'—',cores=props.capacity||props.coreRange||'—',type=item?.code||node.catalogCode,ports=props.ports||'—',clipId=`node-content-${String(node.id).replace(/[^A-Za-z0-9_-]/g,'_')}`,captionY=symbol==='pole'?58:symbol==='handhole'?58:symbol==='joint'||symbol==='closure'?43:symbol==='manhole'||symbol==='chamber'?47:h/2+15;
    const issue=invalid?`<g class="eng-issue-pin" transform="translate(${w/2-2} ${-h/2+2})"><circle r="10"/><text y="4" text-anchor="middle">!</text></g>`:'',connectionPorts=selected||options.connectMode?`<g class="eng-node-ports"><circle cx="${-w/2}" cy="0" r="5"/><circle cx="${w/2}" cy="0" r="5"/><circle cx="0" cy="${-h/2}" r="5"/><circle cx="0" cy="${h/2}" r="5"/></g>`:'';
    let body='';
    if(symbol==='joint'||symbol==='closure')body=`<path d="M 0 -28 L 30 0 L 0 28 L -30 0 Z" fill="#fff" stroke="${stroke}" stroke-width="${selected?4:3}"/><text y="4" text-anchor="middle" class="eng-node-title">${escapeXml(clip(title,9))}</text>`;
    else if(symbol==='pole')body=`<line x1="0" y1="-31" x2="0" y2="31" stroke="${stroke}" stroke-width="4"/><circle r="10" fill="#fff" stroke="${stroke}" stroke-width="3"/><text y="43" text-anchor="middle" class="eng-node-title">${escapeXml(clip(title,12))}</text>`;
    else if(['manhole','chamber'].includes(symbol))body=`<circle r="31" fill="#fff" stroke="${stroke}" stroke-width="${selected?4:3}"/><circle r="20" fill="none" stroke="${stroke}" stroke-width="1.4"/><text y="4" text-anchor="middle" class="eng-node-title">${escapeXml(clip(title,10))}</text>`;
    else if(symbol==='handhole')body=`<rect x="-36" y="-28" width="72" height="56" rx="4" fill="#fff" stroke="${stroke}" stroke-width="${selected?4:3}"/><path d="M-25 0H25M0-17V17" stroke="${stroke}" stroke-width="1.2"/><text y="43" text-anchor="middle" class="eng-node-title">${escapeXml(clip(title,12))}</text>`;
    else {
      const detailText=details.map((value,i)=>`<text x="${-w/2+10}" y="${-h/2+78+i*12}" class="eng-node-extra">${escapeXml(clip(value,36))}</text>`).join('');
      body=`<clipPath id="${clipId}"><rect x="${-w/2+4}" y="${-h/2+3}" width="${w-8}" height="${h-6}" rx="5"/></clipPath><rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" rx="7" fill="#fff" stroke="${stroke}" stroke-width="${selected?4:3}"/><g clip-path="url(#${clipId})"><rect x="${-w/2}" y="${-h/2}" width="${w}" height="26" fill="${color}" opacity=".09"/><circle cx="${-w/2+13}" cy="${-h/2+13}" r="5" fill="${color}"/><text y="${-h/2+18}" text-anchor="middle" class="eng-node-title">${escapeXml(clip(title,28))}</text><line x1="${-w/2}" y1="${-h/2+28}" x2="${w/2}" y2="${-h/2+28}" class="eng-node-grid-line"/><text x="${-w/2+10}" y="${-h/2+47}" class="eng-node-key">NO</text><text x="${-w/2+34}" y="${-h/2+47}" class="eng-node-value">${escapeXml(clip(box,12))}</text><text x="6" y="${-h/2+47}" class="eng-node-key">CORE</text><text x="${w/2-10}" y="${-h/2+47}" text-anchor="end" class="eng-node-value">${escapeXml(clip(cores,12))}</text><text x="${-w/2+10}" y="${-h/2+66}" class="eng-node-key">PORT</text><text x="${-w/2+42}" y="${-h/2+66}" class="eng-node-value">${escapeXml(clip(ports,12))}</text><text x="6" y="${-h/2+66}" class="eng-node-key">TYPE</text><text x="${w/2-10}" y="${-h/2+66}" text-anchor="end" class="eng-node-value">${escapeXml(clip(type,8))}</text>${detailText}</g>`;
    }
    const typeCaption=caption&&String(caption).trim()!==String(title).trim()?`<text y="${captionY}" text-anchor="middle" class="eng-node-type-caption">${escapeXml(clip(caption,30))}</text>`:'';
    return `<g class="eng-node ${selected?'selected':''} ${invalid?'has-issue':''}" data-eng-node="${escapeXml(node.id)}" transform="translate(${node.x} ${node.y}) rotate(${node.rotation||0})" filter="url(#eng-shadow)">${body}${typeCaption}${connectionPorts}${issue}</g>`;
  };
  const routePaths=snapshot.routes.map(routePathSvg).join(''),nodes=snapshot.nodes.map(nodeSvg).join(''),routeLabels=snapshot.routes.map(routeLabelSvg).join('');
  const annotations=snapshot.annotations.map((a)=>{const lines=String(a.text||'').split(/\r?\n/),lineH=num(a.size,18)*num(a.lineHeight,1.25),sx=a.flipX?-1:1,sy=a.flipY?-1:1,maxChars=Math.max(...lines.map((line)=>line.length),1),boxW=maxChars*num(a.size,18)*.62+16,boxH=lines.length*lineH+8,boxX=a.align==='middle'?-boxW/2:a.align==='end'?-boxW:0;return `<g data-eng-text="${escapeXml(a.id)}" transform="translate(${a.x} ${a.y}) rotate(${a.rotation||0}) scale(${sx} ${sy})" class="eng-annotation-wrap ${isSelected('text',a.id)?'selected':''}">${a.background?`<rect x="${boxX-4}" y="${-num(a.size,18)}" width="${boxW}" height="${boxH}" rx="4" class="eng-annotation-bg"/>`:''}<text font-size="${a.size}" text-anchor="${a.align||'start'}" class="eng-annotation ${a.bold===false?'normal':''}">${lines.map((line,index)=>`<tspan x="0" dy="${index?lineH:0}">${escapeXml(line)}</tspan>`).join('')}</text></g>`;}).join('');
  const marks=(options.marks||[]).filter((m)=>m.status!=='resolved').map((m,k)=>{const color={open:'#DC2626',in_progress:'#D97706',reopened:'#7C3AED'}[m.status]||'#DC2626';return `<g class="eng-review-mark status-${escapeXml(m.status||'open')}" data-eng-mark="${m.id}" transform="translate(${m.x} ${m.y})"><circle r="17" fill="#fff" stroke="${color}" stroke-width="4"/><text text-anchor="middle" y="5" fill="${color}">${k+1}</text></g>`;}).join('');
  const draft=options.draftRoute?.points?.length?(()=>{const pts=[...options.draftRoute.points,...(options.draftRoute.hover?[options.draftRoute.hover]:[])];return `<g class="eng-route-draft" pointer-events="none"><polyline points="${pts.map((p)=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="#4F46E5" stroke-width="4" stroke-dasharray="10 7"/>${pts.map((p)=>`<circle cx="${p.x}" cy="${p.y}" r="5" fill="#fff" stroke="#4F46E5" stroke-width="2"/>`).join('')}</g>`;})():'';
  const t={...(settings.titleBlockData||{}),...(options.metadata||{})},panelX=drawingWidth+gap,panelInnerX=panelX+10,usedNodes=[...new Set(snapshot.nodes.map((x)=>x.catalogCode))].map((code)=>catalogMap.get(code)).filter(Boolean).slice(0,5),usedRoutes=[...new Set(snapshot.routes.map((x)=>x.catalogCode))].map((code)=>catalogMap.get(code)).filter(Boolean).slice(0,5),nodeLegendRows=usedNodes.map((item,k)=>`<g transform="translate(${panelInnerX+10} ${76+k*21})"><rect x="0" y="-9" width="15" height="15" rx="3" fill="#fff" stroke="${nodeColor(item)}" stroke-width="2"/><text x="24" y="3" class="eng-legend-text">${escapeXml(clip(locale==='ar'?item.name_ar:item.name_en,22))}</text></g>`).join(''),routeLegendStart=92+usedNodes.length*21,routeLegendRows=usedRoutes.map((item,k)=>`<g transform="translate(${panelInnerX+10} ${routeLegendStart+k*21})"><line x1="0" y1="0" x2="20" y2="0" stroke="${catalogColor(item)}" stroke-width="4"/><text x="28" y="4" class="eng-legend-text">${escapeXml(clip(locale==='ar'?item.name_ar:item.name_en,22))}</text></g>`).join(''),legendRows=`<text x="${panelInnerX+10}" y="65" class="eng-title-label">${locale==='ar'?'العناصر المستخدمة':'USED ELEMENTS'}</text>${nodeLegendRows}<text x="${panelInnerX+10}" y="${routeLegendStart-10}" class="eng-title-label">${locale==='ar'?'المسارات المستخدمة':'USED ROUTES'}</text>${routeLegendRows}`,info=[['PROJECT',t.project||t.projectCode||'—'],['SITE',t.site||t.village||'—'],['DRAWING NO.',t.drawingNo||'—'],['TITLE',t.title||'—'],['CLIENT',t.client||'—'],['CONSULTANT',t.consultant||'—'],['COMPANY',t.company||t.subContractor||'Optimum'],['REV.',t.revision||'R0'],['STATUS',t.status||'DRAFT'],['SCALE',settings.scale||'NTS'],['DATE',t.date||new Date().toISOString().slice(0,10)]],logos=(Array.isArray(t.logos)?t.logos:[]).slice(0,4),infoStart=Math.max(280,routeLegendStart+usedRoutes.length*21+18),rowH=39,logoY=Math.max(infoStart+11*rowH+10,height-174),panel=settings.titleBlock?`<g class="eng-company-frame"><rect x="${panelX}" y="${margin}" width="${panelWidth-margin}" height="${height-margin*2}" fill="#fff" stroke="${frameColor}" stroke-width="3"/><text x="${panelInnerX+6}" y="43" class="eng-sheet-heading">N</text><path d="M ${panelInnerX+18} 65 l 0 -25 m -11 12 l 22 0" stroke="#111" stroke-width="2"/><text x="${panelInnerX+48}" y="43" class="eng-sheet-heading">LEGEND</text><text x="${totalWidth-margin-12}" y="59" text-anchor="end" class="eng-sheet-heading eng-arabic-label">الرموز</text>${legendRows}<line x1="${panelX}" y1="${infoStart-12}" x2="${totalWidth-margin}" y2="${infoStart-12}" stroke="${frameColor}" stroke-width="2"/>${info.map(([lab,val],k)=>`<g transform="translate(${panelX} ${infoStart+k*rowH})"><rect width="${panelWidth-margin}" height="${rowH}" fill="none" stroke="${frameColor}" stroke-width="1"/><text x="8" y="13" class="eng-title-label">${escapeXml(lab)}</text><text x="8" y="31" class="eng-title-value-small">${escapeXml(clip(val,34))}</text></g>`).join('')}<g transform="translate(${panelX} ${logoY})"><rect width="${panelWidth-margin}" height="${height-margin-logoY}" fill="#F8FBFA" stroke="${frameColor}"/><text x="8" y="16" class="eng-title-label">LOGOS</text><text x="${panelWidth-margin-8}" y="16" text-anchor="end" class="eng-title-label eng-arabic-label">الشعارات</text>${[0,1,2,3].map((i)=>{const col=i%2,row=Math.floor(i/2),x=8+col*((panelWidth-margin-22)/2),y=26+row*70,w=(panelWidth-margin-30)/2,h=60,logo=logos[i],src=logo?.src||logo?.dataUrl,iw=Math.min(w,num(logo?.width,w)),ih=Math.min(h,num(logo?.height,h)),ix=x+(w-iw)/2,iy=y+(h-ih)/2;return src?`<image href="${escapeXml(src)}" x="${ix}" y="${iy}" width="${iw}" height="${ih}" preserveAspectRatio="xMidYMid meet"/>`:`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="#9FC4B5" stroke-dasharray="5 4"/><text x="${x+w/2}" y="${y+h/2+4}" text-anchor="middle" class="eng-title-sub">LOGO ${i+1}</text>`;}).join('')}</g></g>`:'';
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" dir="ltr" viewBox="0 0 ${totalWidth} ${height}" width="${totalWidth}" height="${height}" preserveAspectRatio="xMidYMid meet" data-drawing-width="${drawingWidth}" class="engineering-svg"><style>.engineering-svg{font-family:Arial,'Segoe UI',sans-serif;background:#fff;color:#0f172a;direction:ltr}.eng-node-title{font-size:12px;font-weight:850;fill:#0f172a;pointer-events:none;direction:ltr;unicode-bidi:plaintext}.eng-node-type-caption{font-size:9px;font-weight:650;fill:#475569;letter-spacing:.1px;direction:ltr;unicode-bidi:plaintext}.eng-node-key{font-size:7px;font-weight:750;fill:#64748b;direction:ltr;unicode-bidi:bidi-override}.eng-node-value{font-size:8px;font-weight:850;fill:#111827;direction:ltr;unicode-bidi:plaintext}.eng-node-extra{font-size:7.2px;font-weight:750;fill:#334155;direction:ltr;unicode-bidi:plaintext}.eng-node-grid-line{stroke:#D7E2E8;stroke-width:1}.eng-route-label-background{fill:rgba(255,255,255,.94);stroke:#CBD5E1;stroke-width:1;pointer-events:none}.eng-route-label-hit{fill:transparent;stroke:transparent;stroke-width:1;pointer-events:all}.eng-route-label-text{cursor:move}.eng-route-label-text.selected .eng-route-label-hit{stroke:#4F46E5;stroke-width:1.5;stroke-dasharray:5 4}.eng-route-label-text text{font-weight:720;pointer-events:none}.eng-route-label-text g.normal .eng-route-ink,.eng-route-label-text g.normal .eng-route-halo{font-weight:400}.eng-route-label-text .eng-route-halo{fill:#fff;stroke:#fff;stroke-width:5px;stroke-linejoin:round}.eng-route-label-text .eng-route-ink{fill:#0F172A;stroke:none}.eng-route-title{font-weight:850}.eng-route-tech{font-size:.82em;fill:#334155}.eng-route-label-text.selected .eng-route-halo{stroke:#EEF2FF;fill:#EEF2FF;stroke-width:7px}.eng-annotation-wrap{cursor:move}.eng-annotation{font-weight:700;fill:#0F172A;white-space:pre}.eng-annotation.normal{font-weight:400}.eng-annotation-bg{fill:rgba(255,255,255,.94);stroke:#CBD5E1;stroke-width:1}.eng-annotation-wrap.selected .eng-annotation-bg{stroke:#4F46E5;stroke-width:2}.eng-sheet-heading{font-size:16px;font-weight:850;direction:ltr}.eng-arabic-label{direction:rtl;unicode-bidi:plaintext}.eng-legend-text{font-size:9.5px;fill:#1F2937}.eng-title-label{font-size:7.5px;font-weight:750;fill:#52636F;direction:ltr;unicode-bidi:plaintext}.eng-title-value-small{font-size:10px;font-weight:850;fill:#0F172A;direction:ltr;unicode-bidi:plaintext}.eng-title-sub{font-size:8px;fill:#475569;direction:ltr}.eng-legend-text{direction:ltr;unicode-bidi:plaintext}.eng-review-mark{cursor:pointer}.eng-review-mark text{font-size:13px;font-weight:900}.eng-node-ports circle{fill:#fff;stroke:#4F46E5;stroke-width:2}.eng-route-handle{cursor:move;fill:#fff;stroke:#4F46E5;stroke-width:2}.eng-issue-pin circle{fill:#FEE2E2;stroke:#DC2626;stroke-width:2}.eng-issue-pin text{font-size:12px;font-weight:900;fill:#991B1B}.eng-node.selected{filter:drop-shadow(0 0 7px rgba(79,70,229,.58))}.eng-company-frame{pointer-events:none}</style><rect width="${totalWidth}" height="${height}" fill="#fff"/>${defs}<g class="eng-drawing-board"><rect x="${margin}" y="${margin}" width="${drawingWidth-margin*2}" height="${height-margin*2}" fill="#fff" stroke="${frameColor}" stroke-width="4"/><rect x="${margin+7}" y="${margin+7}" width="${drawingWidth-margin*2-14}" height="${height-margin*2-14}" fill="none" stroke="${frameColor}" stroke-width="1.4"/>${grid}${ref}<g id="engineering-entities" clip-path="url(#drawing-clip)">${routePaths}${draft}${nodes}${routeLabels}${annotations}${marks}</g></g>${panel}</svg>`;
}
