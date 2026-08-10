'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../lib/api';
import { projectAreaHref } from '../lib/navigation';
import { formatDate, normalizeArray, statusTone } from '../lib/format';
import { tx } from '../lib/i18n';
import Icon from '../components/Icon';
import SideSheet from '../components/SideSheet';
import { Badge, Button, EmptyState, ErrorState, PageHeader, Panel, Skeleton, Stat } from '../components/Primitives';

const CadWorkspace = dynamic(() => import('../components/CadWorkspace'), { ssr: false, loading: () => <div className="v7-cad-workspace v7-cad-loading"><Skeleton lines={6} /></div> });

function DrawingDetail({ drawingId, locale, router, onClose, onOpenStudio }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!drawingId) { setData(null); setError(null); return; }
    const c = new AbortController();
    setData(null); setError(null);
    Promise.all([
      api.select('engineering_drawings', { filters: { id: `eq.${drawingId}` }, limit: 1, cacheTtlMs: 10_000, signal: c.signal }),
      api.select('engineering_revisions', { filters: { drawing_id: `eq.${drawingId}` }, order: 'revision_number.desc', limit: 50, cacheTtlMs: 10_000, signal: c.signal }),
      api.select('engineering_review_marks', { filters: { drawing_id: `eq.${drawingId}` }, order: 'created_at.desc', limit: 40, cacheTtlMs: 8_000, signal: c.signal }),
      api.select('engineering_document_links', { filters: { drawing_id: `eq.${drawingId}` }, order: 'created_at.desc', limit: 30, cacheTtlMs: 10_000, signal: c.signal })
    ]).then(async ([drawingRows, revisions, marks, links]) => {
      const drawing = drawingRows[0];
      if (!drawing) throw new Error('Drawing not found or outside your access scope.');
      const currentRevisionId = drawing.current_revision_id || revisions[0]?.id || null;
      const boq = currentRevisionId ? await api.select('engineering_revision_boq', { filters: { revision_id: `eq.${currentRevisionId}` }, order: 'category.asc,item_code.asc', limit: 250, cacheTtlMs: 10_000, signal: c.signal }) : [];
      setData({ drawing, revisions, marks, links, boq });
    }).catch(err => { if (err?.name !== 'AbortError') setError(err); });
    return () => c.abort();
  }, [drawingId]);

  const drawing = data?.drawing || {};
  const current = normalizeArray(data?.revisions).find(item => item.id === drawing.current_revision_id) || normalizeArray(data?.revisions)[0];
  const openMarks = normalizeArray(data?.marks).filter(item => item.status !== 'resolved');
  const context = { project_id: drawing.project_id, site_id: drawing.site_id, folder_id: drawing.folder_id, drawing_id: drawing.id };
  return <SideSheet open={Boolean(drawingId)} onClose={onClose} eyebrow="ENGINEERING 360" title={data ? `${drawing.drawing_no} · ${drawing.title}` : tx(locale, 'loading')} subtitle={data ? [drawing.discipline, drawing.drawing_type, current?.revision_code].filter(Boolean).join(' · ') : ''}>
    {error ? <ErrorState title={tx(locale, 'networkIssue')} description={error.message} /> : !data ? <Skeleton lines={11} /> : <>
      <div className="v7-detail-section">
        <div className="v7-detail-grid">
          <div className="v7-detail-field"><span>{tx(locale, 'status')}</span><strong><Badge tone={statusTone(drawing.status)}>{drawing.status}</Badge></strong></div>
          <div className="v7-detail-field"><span>Current revision</span><strong>{current?.revision_code || '—'}</strong></div>
          <div className="v7-detail-field"><span>Open review marks</span><strong>{openMarks.length}</strong></div>
          <div className="v7-detail-field"><span>BOQ lines</span><strong>{normalizeArray(data.boq).length}</strong></div>
        </div>
        <div className="v7-inline-actions"><Button variant="primary" icon="drafting" onClick={onOpenStudio}>{locale === 'ar' ? 'فتح مساحة CAD الجديدة' : 'Open V7 CAD workspace'}</Button>{drawing.project_id ? <Button icon="briefcase" onClick={() => router.push(projectAreaHref('project', context))}>Project 360</Button> : null}</div>
      </div>
      <div className="v7-detail-section"><h3>Revision history</h3>{normalizeArray(data.revisions).length ? <div className="v7-linked-list">{normalizeArray(data.revisions).map(revision => <article key={revision.id}><Icon name="layers" size={15} /><span><strong>{revision.revision_code} · {revision.status}</strong><small>{formatDate(revision.published_at || revision.submitted_at || revision.updated_at, locale)}{revision.change_note ? ` · ${revision.change_note}` : ''}</small></span>{revision.id === drawing.current_revision_id ? <Badge tone="success">Current</Badge> : <Badge tone={statusTone(revision.status)}>{revision.status}</Badge>}</article>)}</div> : <EmptyState icon="layers" title={tx(locale, 'noData')} />}</div>
      <div className="v7-detail-section"><h3>Review marks</h3>{normalizeArray(data.marks).length ? <div className="v7-linked-list">{normalizeArray(data.marks).slice(0, 20).map(mark => <article key={mark.id}><Icon name={mark.status === 'resolved' ? 'check' : 'alert'} size={15} /><span><strong>{mark.title || mark.body || 'Review mark'}</strong><small>{mark.priority || 'normal'} · {mark.status} · {formatDate(mark.created_at, locale)}</small></span><Badge tone={statusTone(mark.status)}>{mark.status}</Badge></article>)}</div> : <p>No review marks are attached to this drawing.</p>}</div>
      <div className="v7-detail-section"><h3>Current BOQ</h3>{normalizeArray(data.boq).length ? <div className="v7-mini-table"><div><strong>Item</strong><strong>Description</strong><strong>Qty</strong></div>{normalizeArray(data.boq).slice(0, 30).map(item => <div key={item.id}><span>{item.item_code}</span><span>{locale === 'ar' ? item.description_ar : item.description_en}</span><span>{item.quantity} {item.unit}</span></div>)}</div> : <p>No BOQ rows are stored for the current revision.</p>}</div>
      <div className="v7-detail-section"><h3>Linked documents</h3>{normalizeArray(data.links).length ? <div className="v7-linked-list">{normalizeArray(data.links).map(link => <button key={link.id} onClick={() => router.push(projectAreaHref('documents', context, { document: link.document_id }))}><Icon name="file" size={15} /><span><strong>{link.relation_type || 'Reference document'}</strong><small>{link.document_id}</small></span><Icon name="chevron" size={14} /></button>)}</div> : <p>No canonical CDE documents are linked to this drawing.</p>}</div>
    </>}
  </SideSheet>;
}

export default function EngineeringPage({ workspace, locale }) {
  const params = useSearchParams();
  const router = useRouter();
  const drawingId = params.get('drawing') || '';
  const projectId = params.get('project') || '';
  const siteId = params.get('site') || '';
  const studioOpen = params.get('studio') === '1';
  const [drawings, setDrawings] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    const c = new AbortController();
    setError(null); setDrawings(null);
    const filters = { company_id: `eq.${workspace.company.id}` };
    if (projectId) filters.project_id = `eq.${projectId}`;
    if (siteId) filters.site_id = `eq.${siteId}`;
    api.select('engineering_drawings', { filters, order: 'updated_at.desc', limit: 60, cacheTtlMs: 15_000, signal: c.signal }).then(setDrawings).catch(err => { if (err?.name !== 'AbortError') setError(err); });
    return () => c.abort();
  }, [workspace.company.id, projectId, siteId]);

  const counts = useMemo(() => {
    const rows = drawings || [];
    return {
      approved: rows.filter(item => item.status === 'approved').length,
      review: rows.filter(item => item.status === 'in_review').length,
      draft: rows.filter(item => item.status === 'draft').length
    };
  }, [drawings]);
  const context = { project_id: projectId, site_id: siteId };
  const openDrawing = (id) => router.push(projectAreaHref('engineering', context, { drawing: id }));
  const closeDrawing = () => router.push(projectAreaHref('engineering', context));
  const openStudio = (id = drawingId) => router.push(projectAreaHref('engineering', context, { drawing: id, studio: '1' }));
  const closeStudio = () => router.push(projectAreaHref('engineering', context, { drawing: drawingId }));
  if (studioOpen && drawingId) return <CadWorkspace drawingId={drawingId} workspace={workspace} locale={locale} onClose={closeStudio} />;
  if (error) return <ErrorState title={tx(locale, 'networkIssue')} description={error.message} />;

  return <>
    <PageHeader eyebrow="ENGINEERING INTELLIGENCE" title={tx(locale, 'engineeringHub')} description={tx(locale, 'engineeringHubSub')} actions={}>
      {projectId ? <div className="v7-context-chips"><span>{siteId ? (locale === 'ar' ? 'رسومات الموقع' : 'Site drawings') : (locale === 'ar' ? 'رسومات المشروع' : 'Project drawings')}</span><button onClick={() => router.push(projectAreaHref('project', context))}>{locale === 'ar' ? 'الرجوع للسياق' : 'Back to context'}</button><button onClick={() => router.push('/v7/engineering')}>{locale === 'ar' ? 'كل الرسومات' : 'All drawings'}</button></div> : null}
    </PageHeader>
    <div className="v7-engineering-hero"><div><span className="v7-eyebrow">V7 CAD WORKSPACE · NATIVE CORE</span><h2>Draw → understand → take off → review → issue</h2><p>{locale === 'ar' ? 'واجهة هندسية مستقلة في V7، مع محرك الرسم والحصر وDXF مفصول في وحدة Core قابلة للاختبار ومستقلة عن الواجهة القديمة.' : 'A native V7 engineering workspace with the drawing, takeoff and DXF engine extracted into a testable core module independent from the previous UI runtime.'}</p><div className="v7-inline-actions"><Badge tone="success">Core parity preserved</Badge><Badge tone="brand">Native V7 workspace</Badge></div></div><div className="v7-engineering-graphic"><span><Icon name="drafting" size={36} /></span><i /><span><Icon name="layers" size={32} /></span><i /><span><Icon name="check" size={32} /></span></div></div>
    <div className="v7-stats-grid"><Stat label="Drawings in scope" value={drawings?.length ?? '—'} icon="drafting" tone="brand" /><Stat label="Approved" value={drawings ? counts.approved : '—'} icon="check" /><Stat label="In review" value={drawings ? counts.review : '—'} icon="activity" /><Stat label="Draft" value={drawings ? counts.draft : '—'} icon="layers" /></div>
    <Panel title={locale === 'ar' ? 'الرسومات الهندسية' : 'Engineering drawings'} description={locale === 'ar' ? 'افتح أي رسمة مباشرة في مساحة CAD الجديدة داخل V7؛ المسار الهندسي يعمل بالكامل داخل الواجهة الجديدة.' : 'Open any drawing directly in the native V7 CAD workspace; the engineering route runs entirely inside the new interface.'}>
      {!drawings ? <Skeleton lines={7} /> : drawings.length ? <div className="v7-list">{drawings.map(d => <button className="v7-list-row" key={d.id} onClick={() => openDrawing(d.id)}><span className="v7-result-icon"><Icon name="drafting" size={17} /></span><span className="v7-list-main"><strong>{d.drawing_no} · {d.title}</strong><small>{d.discipline} · {d.drawing_type} · {formatDate(d.updated_at, locale)}</small></span><Badge tone={statusTone(d.status)}>{d.status}</Badge><Icon name="chevron" size={15} /></button>)}</div> : <EmptyState icon="drafting" title={tx(locale, 'noData')} />}
    </Panel>
    <DrawingDetail drawingId={drawingId} locale={locale} router={router} onClose={closeDrawing} onOpenStudio={() => openStudio(drawingId)} />
  </>;
}
