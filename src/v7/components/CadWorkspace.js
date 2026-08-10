'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  calculateEngineeringTakeoff,
  engineeringSnapshotSvg,
  exportEngineeringDxfCompatible,
  mapClientPointToSvg,
  normalizeEngineeringSnapshot,
  validateEngineeringSnapshot
} from '../lib/cadCore';
import { api } from '../lib/api';
import Icon from './Icon';
import { Badge, Button, EmptyState, ErrorState, Skeleton } from './Primitives';

const clone = (value) => JSON.parse(JSON.stringify(value));
const uid = (prefix) => `${prefix}_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const labelFor = (item, locale) => locale === 'ar' ? (item?.name_ar || item?.name_en || item?.code) : (item?.name_en || item?.name_ar || item?.code);
const isDataUrl = (value) => String(value || '').startsWith('data:');

function downloadText(text, filename, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dataUrlBlob(value) {
  const [header, encoded = ''] = String(value || '').split(',');
  const mime = header.match(/^data:([^;,]+)/i)?.[1] || 'image/png';
  if (/;base64/i.test(header)) {
    const bytes = atob(encoded);
    const buffer = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i += 1) buffer[i] = bytes.charCodeAt(i);
    return new Blob([buffer], { type: mime });
  }
  return new Blob([decodeURIComponent(encoded)], { type: mime });
}

function compactPersistedSettings(settings) {
  const next = clone(settings || {});
  const logos = Array.isArray(next.titleBlockData?.logos) ? next.titleBlockData.logos : [];
  if (next.titleBlockData) {
    next.titleBlockData.logos = logos.map((logo) => {
      if (!logo || typeof logo !== 'object') return logo;
      const clean = { ...logo };
      if (clean.assetId) {
        delete clean.src;
        delete clean.dataUrl;
      }
      return clean;
    });
  }
  return next;
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function TakeoffDrawer({ rows, locale, onClose }) {
  const total = rows.reduce((sum, row) => sum + number(row.quantity), 0);
  const exportCsv = () => {
    const head = ['Code', 'Category', 'Description', 'Unit', 'Base quantity', 'Waste %', 'Quantity', 'Source'];
    const body = rows.map((row) => [row.code, row.category, locale === 'ar' ? row.description_ar : row.description_en, row.unit, row.base_quantity, row.waste_percent, row.quantity, row.source_kind]);
    downloadText([head, ...body].map((r) => r.map(csvCell).join(',')).join('\n'), 'optimum-takeoff.csv', 'text/csv;charset=utf-8');
  };
  return <aside className="v7-cad-takeoff">
    <header><div><span className="v7-eyebrow">LIVE TAKEOFF</span><h2>{locale === 'ar' ? 'الحصر المباشر' : 'Live quantity takeoff'}</h2></div><button onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button></header>
    <div className="v7-cad-takeoff-summary"><span>{rows.length}<small>{locale === 'ar' ? 'بند' : 'lines'}</small></span><span>{Math.round(total * 100) / 100}<small>{locale === 'ar' ? 'إجمالي كمي' : 'quantity sum'}</small></span></div>
    <div className="v7-cad-takeoff-actions"><Button icon="download" onClick={exportCsv}>{locale === 'ar' ? 'تصدير CSV' : 'Export CSV'}</Button></div>
    <div className="v7-cad-takeoff-list">{rows.length ? rows.map((row, index) => <article key={`${row.code}:${row.source_kind}:${index}`}><div><strong>{row.code}</strong><small>{locale === 'ar' ? row.description_ar : row.description_en}</small></div><b>{row.quantity} {row.unit}</b></article>) : <EmptyState icon="layers" title={locale === 'ar' ? 'لا توجد كميات بعد' : 'No quantities yet'} />}</div>
  </aside>;
}

function NodeInspector({ node, catalog, locale, onChange, onConnect, onDelete }) {
  if (!node) return null;
  const item = catalog.find((x) => x.code === node.catalogCode);
  const p = node.properties || {};
  const patch = (key, value) => onChange({ ...node, [key]: value });
  const patchProp = (key, value) => onChange({ ...node, properties: { ...p, [key]: value } });
  return <div className="v7-cad-inspector-form">
    <div className="v7-cad-selection-heading"><span><Icon name="layers" size={16} /></span><div><strong>{node.label || labelFor(item, locale) || node.catalogCode}</strong><small>{node.catalogCode}</small></div></div>
    <label><span>{locale === 'ar' ? 'اسم العنصر على الرسم' : 'Drawing label'}</span><input value={node.label || ''} onChange={(e) => patch('label', e.target.value)} /></label>
    <div className="v7-cad-field-grid"><label><span>{locale === 'ar' ? 'رقم العنصر' : 'Node no.'}</span><input value={p.boxNo || ''} onChange={(e) => patchProp('boxNo', e.target.value)} /></label><label><span>{locale === 'ar' ? 'المستوى' : 'Level'}</span><select value={p.networkLevel || ''} onChange={(e) => patchProp('networkLevel', e.target.value)}><option value="">—</option><option value="main">Main</option><option value="secondary">Secondary</option><option value="distribution">Distribution</option><option value="terminal">Terminal</option></select></label></div>
    <div className="v7-cad-field-grid"><label><span>{locale === 'ar' ? 'السعة' : 'Capacity'}</span><input type="number" min="0" value={p.capacity ?? ''} onChange={(e) => patchProp('capacity', e.target.value === '' ? null : number(e.target.value))} /></label><label><span>{locale === 'ar' ? 'المنافذ' : 'Ports'}</span><input type="number" min="0" value={p.ports ?? ''} onChange={(e) => patchProp('ports', e.target.value === '' ? null : number(e.target.value))} /></label></div>
    <div className="v7-cad-field-grid"><label><span>ODF</span><input value={p.odfCode || ''} onChange={(e) => patchProp('odfCode', e.target.value)} /></label><label><span>Splitter</span><input value={p.splitterCode || ''} onChange={(e) => patchProp('splitterCode', e.target.value)} /></label></div>
    <label><span>{locale === 'ar' ? 'مدى الكور' : 'Core range'}</span><input value={p.coreRange || ''} onChange={(e) => patchProp('coreRange', e.target.value)} /></label>
    <label><span>{locale === 'ar' ? 'ملاحظات' : 'Notes'}</span><textarea rows="4" value={p.notes || ''} onChange={(e) => patchProp('notes', e.target.value)} /></label>
    <div className="v7-cad-inspector-actions"><Button variant="primary" icon="link" onClick={onConnect}>{locale === 'ar' ? 'ربط بمسار' : 'Connect route'}</Button><Button variant="danger" icon="trash" onClick={onDelete}>{locale === 'ar' ? 'حذف' : 'Delete'}</Button></div>
  </div>;
}

function RouteInspector({ route, catalog, locale, onChange, onDelete }) {
  if (!route) return null;
  const p = route.properties || {};
  const patch = (key, value) => onChange({ ...route, [key]: value });
  const patchProp = (key, value) => onChange({ ...route, properties: { ...p, [key]: value } });
  return <div className="v7-cad-inspector-form">
    <div className="v7-cad-selection-heading"><span><Icon name="link" size={16} /></span><div><strong>{route.label || route.catalogCode}</strong><small>{route.catalogCode}</small></div></div>
    <label><span>{locale === 'ar' ? 'بيان المسار' : 'Route label'}</span><input value={route.label || ''} onChange={(e) => patch('label', e.target.value)} /></label>
    <div className="v7-cad-field-grid"><label><span>{locale === 'ar' ? 'الطول الحقيقي م' : 'Actual length m'}</span><input type="number" min="0" step="0.1" value={route.manualLength ?? ''} onChange={(e) => patch('manualLength', e.target.value === '' ? null : number(e.target.value))} /></label><label><span>{locale === 'ar' ? 'التنفيذ' : 'Installation'}</span><select value={p.installation || 'underground'} onChange={(e) => patchProp('installation', e.target.value)}><option value="underground">Underground</option><option value="aerial">Aerial</option><option value="indoor">Indoor</option></select></label></div>
    <div className="v7-cad-field-grid"><label><span>{locale === 'ar' ? 'كود الكابل' : 'Cable code'}</span><input value={p.cableCode || ''} onChange={(e) => patchProp('cableCode', e.target.value)} /></label><label><span>{locale === 'ar' ? 'عدد الكابلات' : 'Cable count'}</span><input type="number" min="1" value={p.numberOfCables ?? 1} onChange={(e) => patchProp('numberOfCables', Math.max(1, number(e.target.value, 1)))} /></label></div>
    <label><span>{locale === 'ar' ? 'ملاحظات' : 'Notes'}</span><textarea rows="4" value={p.notes || ''} onChange={(e) => patchProp('notes', e.target.value)} /></label>
    <div className="v7-cad-inspector-actions"><Button variant="danger" icon="trash" onClick={onDelete}>{locale === 'ar' ? 'حذف المسار' : 'Delete route'}</Button></div>
  </div>;
}

export default function CadWorkspace({ drawingId, locale = 'ar', workspace, onClose }) {
  const canvasRef = useRef(null);
  const stageScrollRef = useRef(null);
  const saveRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drawing, setDrawing] = useState(null);
  const [revision, setRevision] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [marks, setMarks] = useState([]);
  const [assets, setAssets] = useState([]);
  const [snapshot, setSnapshot] = useState(() => normalizeEngineeringSnapshot());
  const [settings, setSettings] = useState({});
  const [selected, setSelected] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [takeoffOpen, setTakeoffOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [placingCode, setPlacingCode] = useState('');
  const [routeCode, setRouteCode] = useState('DUCT-4W-7/3.5');
  const [connectSourceId, setConnectSourceId] = useState(null);
  const [drag, setDrag] = useState(null);
  const [zoom, setZoom] = useState(0.72);
  const [notice, setNotice] = useState('');

  const canEdit = Boolean(revision?.status === 'draft' && workspace?.permissions?.has?.('drawings.edit'));
  const recoveryKey = revision?.id ? `optimum.v7.cad.recovery.${workspace?.company?.id || 'company'}.${revision.id}` : '';

  const hydrateLogoUrls = useCallback(async (rawSettings, rawAssets) => {
    const next = clone(rawSettings || {});
    const logos = Array.isArray(next.titleBlockData?.logos) ? next.titleBlockData.logos : [];
    if (!logos.length) return next;
    const assetMap = new Map((rawAssets || []).map((asset) => [asset.id, asset]));
    const hydrated = await Promise.all(logos.map(async (logo) => {
      if (!logo?.assetId || isDataUrl(logo.src || logo.dataUrl)) return logo;
      const asset = assetMap.get(logo.assetId);
      if (!asset?.storage_path) return logo;
      const src = await api.signedAssetUrl(asset.storage_bucket || 'engineering-assets', asset.storage_path, 900);
      return src ? { ...logo, src } : logo;
    }));
    next.titleBlockData = { ...(next.titleBlockData || {}), logos: hydrated };
    return next;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    Promise.all([
      api.select('engineering_drawings', { filters: { id: `eq.${drawingId}` }, limit: 1, cacheTtlMs: 0, signal: controller.signal }),
      api.select('engineering_revisions', { filters: { drawing_id: `eq.${drawingId}` }, order: 'revision_number.desc', limit: 60, cacheTtlMs: 0, signal: controller.signal }),
      api.select('engineering_catalog_items', { filters: { is_active: 'eq.true' }, order: 'sort_order.asc,code.asc', limit: 1000, cacheTtlMs: 60_000, signal: controller.signal }),
      api.select('engineering_review_marks', { filters: { drawing_id: `eq.${drawingId}` }, order: 'created_at.desc', limit: 100, cacheTtlMs: 0, signal: controller.signal }),
      api.select('engineering_assets', { filters: { drawing_id: `eq.${drawingId}`, state: 'eq.ready' }, order: 'created_at.desc', limit: 120, cacheTtlMs: 0, signal: controller.signal })
    ]).then(async ([drawingRows, revisions, catalogRows, markRows, assetRows]) => {
      const d = drawingRows[0];
      if (!d) throw new Error(locale === 'ar' ? 'الرسم غير موجود أو خارج نطاق صلاحيتك.' : 'Drawing not found or outside your access scope.');
      const current = revisions.find((item) => item.id === d.current_revision_id) || revisions[0];
      if (!current) throw new Error(locale === 'ar' ? 'لا يوجد إصدار متاح للرسم.' : 'No revision is available for this drawing.');
      const hydratedSettings = await hydrateLogoUrls(current.sheet_settings || {}, assetRows);
      setDrawing(d); setRevision(current); setCatalog(catalogRows); setMarks(markRows); setAssets(assetRows);
      setSnapshot(normalizeEngineeringSnapshot(current.snapshot || {})); setSettings(hydratedSettings);
      setLastSavedAt(current.updated_at || null);
      const savedRecovery = localStorage.getItem(`optimum.v7.cad.recovery.${d.company_id}.${current.id}`);
      if (savedRecovery) {
        try {
          const parsed = JSON.parse(savedRecovery);
          if (parsed?.snapshot && Number(parsed.savedAt || 0) > new Date(current.updated_at || 0).getTime()) {
            setNotice(locale === 'ar' ? 'يوجد حفظ محلي أحدث. يمكنك استعادته من زر الاستعادة.' : 'A newer local recovery is available. Use Restore local draft if needed.');
          }
        } catch {}
      }
    }).catch((err) => { if (err?.name !== 'AbortError') setError(err); }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [drawingId, hydrateLogoUrls, locale]);

  const takeoff = useMemo(() => calculateEngineeringTakeoff(snapshot, catalog, settings), [snapshot, catalog, settings]);
  const validation = useMemo(() => validateEngineeringSnapshot(snapshot, catalog, settings), [snapshot, catalog, settings]);
  const selectedNode = selected?.kind === 'node' ? snapshot.nodes.find((x) => x.id === selected.id) : null;
  const selectedRoute = selected?.kind === 'route' ? snapshot.routes.find((x) => x.id === selected.id) : null;
  const filteredCatalog = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase();
    return catalog.filter((item) => ['node', 'accessory'].includes(item.category) && (!q || [item.code, item.name_ar, item.name_en, item.symbol_key].some((v) => String(v || '').toLowerCase().includes(q)))).slice(0, 80);
  }, [catalog, libraryQuery]);
  const routeCatalog = useMemo(() => catalog.filter((item) => item.category === 'route').slice(0, 100), [catalog]);

  const renderSettings = useMemo(() => {
    const next = clone(settings || {});
    if (next.titleBlockData?.logos) next.titleBlockData.logos = next.titleBlockData.logos.map((logo) => ({ ...logo }));
    return next;
  }, [settings]);
  const svg = useMemo(() => engineeringSnapshotSvg(snapshot, {
    settings: renderSettings,
    catalog,
    marks,
    locale,
    selected,
    validation,
    metadata: {
      drawingNo: drawing?.drawing_no,
      title: drawing?.title,
      revision: revision?.revision_code,
      status: revision?.status,
      company: workspace?.company?.name
    }
  }), [snapshot, renderSettings, catalog, marks, locale, selected, validation, drawing, revision, workspace?.company?.name]);

  const markDirty = useCallback((nextSnapshot) => {
    setSnapshot(nextSnapshot);
    setDirty(true);
    if (recoveryKey) {
      try { localStorage.setItem(recoveryKey, JSON.stringify({ snapshot: nextSnapshot, settings: compactPersistedSettings(settings), savedAt: Date.now() })); } catch {}
    }
  }, [recoveryKey, settings]);

  const ensureLegacyLogoAssets = useCallback(async (inputSettings) => {
    const next = clone(inputSettings || {});
    const logos = Array.isArray(next.titleBlockData?.logos) ? next.titleBlockData.logos : [];
    if (!logos.some((logo) => logo && !logo.assetId && isDataUrl(logo.src || logo.dataUrl))) return compactPersistedSettings(next);
    const mapped = [...logos];
    for (let i = 0; i < mapped.length; i += 1) {
      const logo = mapped[i];
      const src = logo?.src || logo?.dataUrl;
      if (!logo || logo.assetId || !isDataUrl(src)) continue;
      const blob = dataUrlBlob(src);
      const filename = logo.originalFilename || `frame-logo-${i + 1}.${blob.type.includes('svg') ? 'svg' : blob.type.includes('jpeg') ? 'jpg' : 'png'}`;
      const reservation = await api.rpc('begin_engineering_asset_upload', {
        p_drawing_id: drawing.id,
        p_revision_id: revision.id,
        p_kind: 'reference',
        p_original_filename: filename,
        p_mime_type: blob.type || 'image/png',
        p_size_bytes: blob.size
      });
      let uploaded = false;
      try {
        await api.uploadObject(reservation.storage_bucket, reservation.storage_path, blob);
        uploaded = true;
        await api.rpc('finalize_engineering_asset_upload', { p_asset_id: reservation.asset_id });
        mapped[i] = { ...logo, assetId: reservation.asset_id, originalFilename: filename, mimeType: blob.type || 'image/png' };
        delete mapped[i].src; delete mapped[i].dataUrl;
        setAssets((rows) => [{ id: reservation.asset_id, drawing_id: drawing.id, revision_id: revision.id, storage_bucket: reservation.storage_bucket, storage_path: reservation.storage_path, original_filename: filename, mime_type: blob.type, state: 'ready' }, ...rows]);
      } catch (err) {
        if (uploaded) try { await api.deleteObject(reservation.storage_bucket, reservation.storage_path); } catch {}
        try { await api.rpc('abort_engineering_asset_upload', { p_asset_id: reservation.asset_id }); } catch {}
        throw err;
      }
    }
    next.titleBlockData = { ...(next.titleBlockData || {}), logos: mapped };
    return compactPersistedSettings(next);
  }, [drawing, revision]);

  const save = useCallback(async ({ silent = false } = {}) => {
    if (!drawing || !revision || !canEdit || saving) return false;
    setSaving(true); setError(null);
    try {
      const persistedSettings = await ensureLegacyLogoAssets(settings);
      const result = await api.rpc('save_engineering_draft', {
        p_revision_id: revision.id,
        p_snapshot: clone(snapshot),
        p_sheet_settings: persistedSettings,
        p_boq: takeoff,
        p_change_note: revision.change_note || null,
        p_expected_lock_version: revision.lock_version
      });
      const row = Array.isArray(result) ? result[0] : result;
      const nextRevision = { ...revision, lock_version: row?.lock_version ?? revision.lock_version + 1, updated_at: row?.saved_at || new Date().toISOString(), snapshot: clone(snapshot), sheet_settings: persistedSettings, boq_snapshot: takeoff };
      setRevision(nextRevision); setSettings((current) => ({ ...persistedSettings, titleBlockData: { ...(persistedSettings.titleBlockData || {}), logos: current?.titleBlockData?.logos || persistedSettings.titleBlockData?.logos } }));
      setDirty(false); setLastSavedAt(nextRevision.updated_at); api.clearReadCache();
      if (recoveryKey) localStorage.removeItem(recoveryKey);
      if (!silent) setNotice(locale === 'ar' ? 'تم حفظ المسودة.' : 'Draft saved.');
      return true;
    } catch (err) {
      setError(err);
      return false;
    } finally { setSaving(false); }
  }, [drawing, revision, canEdit, saving, ensureLegacyLogoAssets, settings, snapshot, takeoff, recoveryKey, locale]);
  saveRef.current = save;

  const fitCanvas = useCallback(() => {
    const width = stageScrollRef.current?.clientWidth || 0;
    if (!width) return;
    setZoom(Math.max(.35, Math.min(1.25, (width - 56) / 1918)));
  }, []);

  useEffect(() => {
    if (!dirty || !canEdit || saving) return;
    const timer = setTimeout(() => saveRef.current?.({ silent: true }), 2400);
    return () => clearTimeout(timer);
  }, [dirty, canEdit, saving, snapshot, settings]);

  useEffect(() => {
    const keydown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveRef.current?.(); }
      if (event.key === 'Delete' && selected && canEdit && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        event.preventDefault();
        if (selected.kind === 'node') {
          markDirty({ ...snapshot, nodes: snapshot.nodes.filter((x) => x.id !== selected.id), routes: snapshot.routes.filter((x) => x.sourceNodeId !== selected.id && x.targetNodeId !== selected.id) });
        } else if (selected.kind === 'route') markDirty({ ...snapshot, routes: snapshot.routes.filter((x) => x.id !== selected.id) });
        setSelected(null);
      }
      if (event.key === 'Escape') { setPlacingCode(''); setConnectSourceId(null); setSelected(null); }
      if (!event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'f' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) { event.preventDefault(); fitCanvas(); }
    };
    addEventListener('keydown', keydown);
    return () => removeEventListener('keydown', keydown);
  }, [selected, canEdit, snapshot, markDirty, fitCanvas]);

  const svgPoint = (event) => {
    const svgEl = canvasRef.current?.querySelector('svg');
    if (!svgEl) return null;
    const bounds = svgEl.getBoundingClientRect();
    const box = svgEl.viewBox?.baseVal || { x: 0, y: 0, width: number(settings.width, 1600), height: number(settings.height, 1000) };
    return mapClientPointToSvg(bounds, box, event.clientX, event.clientY);
  };

  const handlePointerDown = (event) => {
    if (!canEdit) return;
    const point = svgPoint(event);
    if (!point) return;
    const nodeEl = event.target.closest?.('[data-eng-node]');
    const routeEl = event.target.closest?.('[data-eng-route]');
    if (placingCode) {
      const item = catalog.find((x) => x.code === placingCode);
      const node = normalizeEngineeringSnapshot({ nodes: [{ id: uid('node'), catalogCode: placingCode, x: point.x, y: point.y, label: labelFor(item, locale) || placingCode, properties: clone(item?.default_properties || {}) }] }).nodes[0];
      markDirty({ ...snapshot, nodes: [...snapshot.nodes, node] });
      setSelected({ kind: 'node', id: node.id }); setPlacingCode('');
      event.preventDefault();
      return;
    }
    if (nodeEl) {
      const id = nodeEl.getAttribute('data-eng-node');
      if (connectSourceId) {
        if (id !== connectSourceId) {
          const source = snapshot.nodes.find((x) => x.id === connectSourceId);
          const target = snapshot.nodes.find((x) => x.id === id);
          if (source && target) {
            const route = normalizeEngineeringSnapshot({ routes: [{ id: uid('route'), catalogCode: routeCode || routeCatalog[0]?.code || 'DUCT-4W-7/3.5', sourceNodeId: source.id, targetNodeId: target.id, points: [{ x: source.x, y: source.y }, { x: target.x, y: target.y }], label: `${source.label || source.catalogCode} → ${target.label || target.catalogCode}`, properties: { fromLabel: source.label || '', toLabel: target.label || '', installation: 'underground', pathStyle: 'orthogonal' } }] }).routes[0];
            markDirty({ ...snapshot, routes: [...snapshot.routes, route] });
            setSelected({ kind: 'route', id: route.id });
          }
        }
        setConnectSourceId(null); event.preventDefault(); return;
      }
      const node = snapshot.nodes.find((x) => x.id === id);
      setSelected({ kind: 'node', id });
      if (node) setDrag({ id, start: point, origin: { x: node.x, y: node.y } });
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault(); return;
    }
    if (routeEl) {
      setSelected({ kind: 'route', id: routeEl.getAttribute('data-eng-route') });
      event.preventDefault(); return;
    }
    setSelected(null);
  };

  const handlePointerMove = (event) => {
    if (!drag || !canEdit) return;
    const point = svgPoint(event); if (!point) return;
    const dx = point.x - drag.start.x, dy = point.y - drag.start.y;
    const grid = Math.max(1, number(settings.grid, 20));
    const snap = (v) => Math.round(v / grid) * grid;
    setSnapshot((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === drag.id ? { ...node, x: snap(drag.origin.x + dx), y: snap(drag.origin.y + dy) } : node) }));
  };

  const handlePointerUp = () => {
    if (drag) { setDrag(null); setDirty(true); if (recoveryKey) try { localStorage.setItem(recoveryKey, JSON.stringify({ snapshot, settings: compactPersistedSettings(settings), savedAt: Date.now() })); } catch {} }
  };

  const updateSelectedNode = (nextNode) => markDirty({ ...snapshot, nodes: snapshot.nodes.map((x) => x.id === nextNode.id ? nextNode : x) });
  const updateSelectedRoute = (nextRoute) => markDirty({ ...snapshot, routes: snapshot.routes.map((x) => x.id === nextRoute.id ? nextRoute : x) });
  const deleteSelection = () => {
    if (!selected) return;
    if (selected.kind === 'node') markDirty({ ...snapshot, nodes: snapshot.nodes.filter((x) => x.id !== selected.id), routes: snapshot.routes.filter((x) => x.sourceNodeId !== selected.id && x.targetNodeId !== selected.id) });
    else if (selected.kind === 'route') markDirty({ ...snapshot, routes: snapshot.routes.filter((x) => x.id !== selected.id) });
    setSelected(null);
  };

  const restoreLocal = () => {
    if (!recoveryKey) return;
    try {
      const value = JSON.parse(localStorage.getItem(recoveryKey) || 'null');
      if (value?.snapshot) { setSnapshot(normalizeEngineeringSnapshot(value.snapshot)); if (value.settings) setSettings(value.settings); setDirty(true); setNotice(locale === 'ar' ? 'تم استعادة النسخة المحلية. راجعها ثم احفظ.' : 'Local recovery restored. Review it, then save.'); }
    } catch {}
  };

  const exportDxf = () => {
    const dxf = exportEngineeringDxfCompatible(snapshot, { drawingNo: drawing?.drawing_no, title: drawing?.title, revision: revision?.revision_code }, settings);
    downloadText(dxf, `${drawing?.drawing_no || 'drawing'}-${revision?.revision_code || 'R0'}.dxf`, 'application/dxf');
  };
  const exportSvg = () => downloadText(svg, `${drawing?.drawing_no || 'drawing'}-${revision?.revision_code || 'R0'}.svg`, 'image/svg+xml;charset=utf-8');

  if (loading) return <div className="v7-cad-workspace v7-cad-loading"><div><span className="v7-eyebrow">ENGINEERING STUDIO</span><Skeleton lines={5} /></div></div>;
  if (error && !drawing) return <div className="v7-cad-workspace v7-cad-loading"><ErrorState title={locale === 'ar' ? 'تعذر فتح مساحة الرسم' : 'Could not open CAD workspace'} description={error.message} onRetry={() => location.reload()} /></div>;

  return <div className="v7-cad-workspace" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <header className="v7-cad-topbar">
      <div className="v7-cad-title"><button className="v7-cad-icon-button" onClick={onClose} title={locale === 'ar' ? 'رجوع' : 'Back'}><Icon name="arrow" size={18} /></button><span className="v7-cad-brand">O</span><div><strong>{drawing?.drawing_no} · {drawing?.title}</strong><small>{revision?.revision_code} · {revision?.status} · {dirty ? (locale === 'ar' ? 'تعديلات غير محفوظة' : 'Unsaved changes') : (locale === 'ar' ? 'محفوظ' : 'Saved')}</small></div></div>
      <div className="v7-cad-top-actions">
        {notice ? <span className="v7-cad-notice">{notice}</span> : null}
        <button className="v7-cad-icon-button" onClick={() => setPaletteOpen((v) => !v)} title="Palette"><Icon name="grid" size={17} /></button>
        <button className="v7-cad-icon-button" onClick={() => setInspectorOpen((v) => !v)} title="Inspector"><Icon name="settings" size={17} /></button>
        <Button icon="layers" onClick={() => setTakeoffOpen(true)}>{locale === 'ar' ? 'الحصر' : 'Takeoff'}</Button>
        <Button icon="download" onClick={exportDxf}>DXF</Button>
        <Button icon="download" onClick={exportSvg}>SVG</Button>
        <Button variant="primary" icon="save" disabled={!canEdit || !dirty || saving} onClick={() => save()}>{saving ? (locale === 'ar' ? 'جاري الحفظ…' : 'Saving…') : (locale === 'ar' ? 'حفظ' : 'Save')}</Button>
      </div>
    </header>

    <div className={`v7-cad-body ${paletteOpen ? 'has-palette' : ''} ${inspectorOpen ? 'has-inspector' : ''}`}>
      {paletteOpen ? <aside className="v7-cad-palette">
        <header><div><span className="v7-eyebrow">COMPONENT LIBRARY</span><h3>{locale === 'ar' ? 'العناصر الهندسية' : 'Engineering components'}</h3></div><button onClick={() => setPaletteOpen(false)}><Icon name="close" size={16} /></button></header>
        <div className="v7-cad-search"><Icon name="search" size={15} /><input value={libraryQuery} onChange={(e) => setLibraryQuery(e.target.value)} placeholder={locale === 'ar' ? 'ابحث بالكود أو النوع…' : 'Search code or type…'} /></div>
        <div className="v7-cad-library">{filteredCatalog.map((item) => <button key={item.id || item.code} className={placingCode === item.code ? 'is-active' : ''} disabled={!canEdit} onClick={() => { setPlacingCode(item.code); setConnectSourceId(null); }}><span><Icon name={String(item.symbol_key || '').includes('cabinet') ? 'briefcase' : 'layers'} size={15} /></span><div><strong>{labelFor(item, locale)}</strong><small>{item.code}</small></div></button>)}</div>
        <div className="v7-cad-route-type"><span>{locale === 'ar' ? 'نوع المسار الجديد' : 'New route type'}</span><select value={routeCode} onChange={(e) => setRouteCode(e.target.value)}>{routeCatalog.map((item) => <option key={item.code} value={item.code}>{item.code} · {labelFor(item, locale)}</option>)}</select></div>
      </aside> : null}

      <main className="v7-cad-stage-wrap">
        <div className="v7-cad-stage-toolbar">
          <div><Badge tone={validation.errorCount ? 'danger' : validation.warningCount ? 'warning' : 'success'}>{validation.errorCount}E · {validation.warningCount}W</Badge><span>{snapshot.nodes.length} {locale === 'ar' ? 'عنصر' : 'nodes'}</span><span>{snapshot.routes.length} {locale === 'ar' ? 'مسار' : 'routes'}</span><span>{takeoff.length} BOQ</span></div>
          <div><button onClick={restoreLocal} disabled={!recoveryKey}><Icon name="refresh" size={15} /> {locale === 'ar' ? 'استعادة محلية' : 'Restore local'}</button><button onClick={fitCanvas} title={locale === 'ar' ? 'ملاءمة الشيت للشاشة (F)' : 'Fit sheet to view (F)'}><Icon name="map" size={14} /> {locale === 'ar' ? 'ملاءمة' : 'Fit'}</button><button onClick={() => setZoom((v) => Math.max(.35, v - .1))}>−</button><b>{Math.round(zoom * 100)}%</b><button onClick={() => setZoom((v) => Math.min(1.5, v + .1))}>+</button></div>
        </div>
        {placingCode ? <div className="v7-cad-mode-banner"><Icon name="plus" size={15} /> {locale === 'ar' ? `اضغط على الشيت لوضع ${placingCode}` : `Click the sheet to place ${placingCode}`} <button onClick={() => setPlacingCode('')}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button></div> : null}
        {connectSourceId ? <div className="v7-cad-mode-banner"><Icon name="link" size={15} /> {locale === 'ar' ? 'اختر العنصر الآخر لإنشاء المسار' : 'Choose the second node to create the route'} <button onClick={() => setConnectSourceId(null)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button></div> : null}
        <div ref={stageScrollRef} className="v7-cad-stage-scroll"><div ref={canvasRef} className="v7-cad-canvas" style={{ '--cad-zoom': zoom }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} dangerouslySetInnerHTML={{ __html: svg }} /></div>
        <footer className="v7-cad-statusbar"><span><i className={dirty ? 'is-dirty' : ''} /> {dirty ? (locale === 'ar' ? 'في انتظار الحفظ' : 'Waiting to save') : (locale === 'ar' ? 'متزامن' : 'Synced')}</span><span>{lastSavedAt ? `${locale === 'ar' ? 'آخر حفظ' : 'Last saved'} ${new Date(lastSavedAt).toLocaleTimeString(locale === 'ar' ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}` : '—'}</span><span>{canEdit ? (locale === 'ar' ? 'وضع التحرير' : 'Edit mode') : (locale === 'ar' ? 'عرض فقط' : 'Read only')}</span><span className="v7-cad-shortcuts">Ctrl+S · F Fit · Del · Esc</span></footer>
      </main>

      {inspectorOpen ? <aside className="v7-cad-inspector">
        <header><div><span className="v7-eyebrow">CONTEXT INSPECTOR</span><h3>{locale === 'ar' ? 'الخصائص والتحقق' : 'Properties & validation'}</h3></div><button onClick={() => setInspectorOpen(false)}><Icon name="close" size={16} /></button></header>
        {selectedNode ? <NodeInspector node={selectedNode} catalog={catalog} locale={locale} onChange={updateSelectedNode} onConnect={() => setConnectSourceId(selectedNode.id)} onDelete={deleteSelection} /> : selectedRoute ? <RouteInspector route={selectedRoute} catalog={catalog} locale={locale} onChange={updateSelectedRoute} onDelete={deleteSelection} /> : <div className="v7-cad-inspector-empty"><Icon name="cursor" size={24} /><strong>{locale === 'ar' ? 'اختر عنصرًا أو مسارًا' : 'Select a node or route'}</strong><p>{locale === 'ar' ? 'الخصائص تظهر هنا فقط لما تحتاجها، علشان مساحة الرسم تفضل نظيفة.' : 'Properties appear only when needed so the drawing area stays clean.'}</p></div>}
        <div className="v7-cad-validation"><div className="v7-cad-validation-title"><strong>{locale === 'ar' ? 'فحص الرسم' : 'Drawing validation'}</strong><Badge tone={validation.errorCount ? 'danger' : validation.warningCount ? 'warning' : 'success'}>{validation.issues.length}</Badge></div>{validation.issues.length ? validation.issues.slice(0, 12).map((issue) => <button key={issue.id} onClick={() => issue.kind && issue.id && setSelected({ kind: issue.kind === 'text' ? 'text' : issue.kind, id: issue.id.split(':').at(-1) })}><span className={`is-${issue.severity}`}><Icon name={issue.severity === 'error' ? 'alert' : 'info'} size={14} /></span><div><strong>{locale === 'ar' ? issue.message_ar : issue.message_en}</strong><small>{issue.code}</small></div></button>) : <div className="v7-cad-validation-ok"><Icon name="check" size={17} /> {locale === 'ar' ? 'لا توجد ملاحظات حالية.' : 'No current validation issues.'}</div>}</div>
      </aside> : null}
    </div>
    {takeoffOpen ? <TakeoffDrawer rows={takeoff} locale={locale} onClose={() => setTakeoffOpen(false)} /> : null}
  </div>;
}
