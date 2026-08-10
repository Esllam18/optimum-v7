'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../lib/api';
import { projectAreaHref } from '../lib/navigation';
import { formatDate, normalizeArray, statusTone } from '../lib/format';
import { tx } from '../lib/i18n';
import Icon from '../components/Icon';
import SideSheet from '../components/SideSheet';
import { Badge, Button, EmptyState, ErrorState, PageHeader, Panel, Skeleton, Stat } from '../components/Primitives';

function PackageDetail({ packageId, locale, router, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState('');
  const [running, setRunning] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!packageId) { setData(null); setError(null); return; }
    const c = new AbortController();
    setData(null); setError(null); setActionError('');
    api.rpc('site_claim_package_360', { p_package_id: packageId }, { cacheTtlMs: 8_000, signal: c.signal, dedupe: true })
      .then(setData).catch(err => { if (err?.name !== 'AbortError') setError(err); });
    return () => c.abort();
  }, [packageId, reload]);

  const pkg = data?.package || {};
  const progress = data?.progress || {};
  const requirements = normalizeArray(data?.requirements);
  const context = { project_id: pkg.project_id, site_id: pkg.site_id };
  const runLifecycle = async action => {
    if (running || !pkg.id) return;
    setRunning(action); setActionError('');
    const rpc = action === 'freeze' ? 'freeze_site_claim_package' : action === 'reopen' ? 'reopen_site_claim_package' : 'submit_site_claim_package';
    try {
      await api.rpc(rpc, { p_package_id: pkg.id });
      api.clearReadCache(); setReload(value => value + 1);
    } catch (err) { setActionError(err.message || (locale === 'ar' ? 'تعذر تحديث حالة المستخلص.' : 'Could not update the claim package.')); }
    finally { setRunning(''); }
  };
  return <SideSheet open={Boolean(packageId)} onClose={onClose} eyebrow="DELIVERY 360" title={data ? `${pkg.package_no} · ${pkg.title}` : tx(locale, 'loading')} subtitle={data ? [data.project?.name, data.site?.name, pkg.claim_type].filter(Boolean).join(' · ') : ''}>
    {error ? <ErrorState title={tx(locale, 'networkIssue')} description={error.message} /> : !data ? <Skeleton lines={11} /> : <>
      <div className="v7-detail-section">
        <div className="v7-detail-grid">
          <div className="v7-detail-field"><span>{tx(locale, 'status')}</span><strong><Badge tone={statusTone(pkg.status)}>{pkg.status}</Badge></strong></div>
          <div className="v7-detail-field"><span>Overall readiness</span><strong>{progress.overall_percent ?? 0}%</strong></div>
          <div className="v7-detail-field"><span>Required evidence</span><strong>{progress.required_satisfied ?? 0}/{progress.required_total ?? 0}</strong></div>
          <div className="v7-detail-field"><span>Cabinet coverage</span><strong>{progress.cabinet_coverage_percent ?? 0}%</strong></div>
        </div>
        <div className="v7-progress v7-progress--large"><i style={{ width: `${Math.max(0, Math.min(100, Number(progress.overall_percent || 0)))}%` }} /></div>
        <div className="v7-inline-actions">{pkg.project_id ? <Button icon="briefcase" onClick={() => router.push(projectAreaHref('project', context))}>Project 360</Button> : null}{pkg.project_id ? <Button icon="folder" onClick={() => router.push(projectAreaHref('documents', context))}>Open CDE</Button> : null}{data.can_manage && !pkg.locked_at && !['submitted','approved','archived'].includes(pkg.status) ? <Button variant="primary" icon="archive" onClick={() => runLifecycle('freeze')} disabled={Boolean(running)}>{running === 'freeze' ? (locale === 'ar' ? 'جارٍ التجميد…' : 'Freezing…') : (locale === 'ar' ? 'تجميد الإصدارات' : 'Freeze versions')}</Button> : null}{data.can_manage && pkg.locked_at && pkg.status === 'ready' ? <Button icon="refresh" onClick={() => runLifecycle('reopen')} disabled={Boolean(running)}>{running === 'reopen' ? '…' : (locale === 'ar' ? 'إعادة فتح التجميع' : 'Reopen collection')}</Button> : null}{data.can_manage && pkg.locked_at && pkg.status === 'ready' ? <Button variant="primary" icon="delivery" onClick={() => runLifecycle('submit')} disabled={Boolean(running)}>{running === 'submit' ? (locale === 'ar' ? 'جارٍ التقديم…' : 'Submitting…') : (locale === 'ar' ? 'تقديم المستخلص' : 'Submit package')}</Button> : null}</div>
        {actionError ? <div className="v7-form-error">{actionError}</div> : null}
      </div>
      <div className="v7-detail-section"><h3>Submission state</h3><div className="v7-detail-grid"><div className="v7-detail-field"><span>Created</span><strong>{formatDate(pkg.created_at, locale)}</strong></div><div className="v7-detail-field"><span>Submitted</span><strong>{formatDate(pkg.submitted_at, locale)}</strong></div><div className="v7-detail-field"><span>Approved</span><strong>{formatDate(pkg.approved_at, locale)}</strong></div><div className="v7-detail-field"><span>Version mode</span><strong>{pkg.locked_at ? 'Frozen' : 'Tracks canonical docs'}</strong></div></div></div>
      <div className="v7-detail-section"><h3>Evidence requirements</h3>{requirements.length ? <div className="v7-requirements">{requirements.map(requirement => <article key={requirement.id} className={requirement.satisfied ? 'is-satisfied' : ''}><span className="v7-requirement-state"><Icon name={requirement.satisfied ? 'check' : requirement.is_required ? 'alert' : 'clock'} size={16} /></span><div><strong>{locale === 'ar' ? requirement.label_ar : requirement.label_en}</strong><small>{requirement.category} · {requirement.item_count || 0}/{requirement.min_items || 0} items{requirement.is_required ? ' · required' : ' · optional'}</small>{normalizeArray(requirement.items).length ? <div className="v7-linked-list v7-linked-list--compact">{normalizeArray(requirement.items).map(item => <button key={item.id || item.item_id} onClick={() => item.document_id && router.push(projectAreaHref('documents', context, { document: item.document_id }))}><Icon name="file" size={14} /><span><strong>{item.display_name || item.document_name || item.document_id || 'Document'}</strong><small>{item.selected_version_id ? 'Pinned version' : 'Canonical document'}</small></span><Icon name="chevron" size={13} /></button>)}</div> : null}</div><Badge tone={requirement.satisfied ? 'success' : requirement.is_required ? 'warning' : 'neutral'}>{requirement.satisfied ? 'Ready' : 'Missing'}</Badge></article>)}</div> : <EmptyState icon="delivery" title={tx(locale, 'noData')} />}</div>
    </>}
  </SideSheet>;
}

export default function DeliveryPage({ workspace, locale }) {
  const params = useSearchParams();
  const router = useRouter();
  const packageId = params.get('package') || '';
  const projectId = params.get('project') || '';
  const siteId = params.get('site') || '';
  const [directory, setDirectory] = useState(null);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [status, setStatus] = useState('');
  const pageSize = 50;
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedQuery(query.trim()); setOffset(0); }, 280);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => { setOffset(0); }, [projectId, siteId, status]);
  useEffect(() => {
    const c = new AbortController();
    setError(null); setDirectory(null);
    api.rpc('delivery_directory_query', {
      p_company_id: workspace.company.id,
      p_project_id: projectId || null,
      p_site_id: siteId || null,
      p_status: status || null,
      p_query: debouncedQuery || null,
      p_limit: pageSize,
      p_offset: offset
    }, { cacheTtlMs: 15_000, signal: c.signal, dedupe: true, metricLabel: 'v7.delivery.directory' })
      .then(setDirectory).catch(err => { if (err?.name !== 'AbortError') setError(err); });
    return () => c.abort();
  }, [workspace.company.id, projectId, siteId, status, debouncedQuery, offset]);

  const packages = normalizeArray(directory?.items);
  const counts = directory?.counts || {};
  const total = Number(directory?.total || 0);
  const page = Math.floor(offset / pageSize) + 1;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const context = { project_id: projectId, site_id: siteId };
  const openPackage = (id) => router.push(projectAreaHref('delivery', context, { package: id }));
  const closePackage = () => router.push(projectAreaHref('delivery', context));
  if (error) return <ErrorState title={tx(locale, 'networkIssue')} description={error.message} />;

  return <>
    <PageHeader eyebrow="SITE DELIVERY" title={tx(locale, 'deliveryCenter')} description={tx(locale, 'deliveryCenterSub')}>
      {projectId ? <div className="v7-context-chips"><span>{siteId ? (locale === 'ar' ? 'تسليم الموقع' : 'Site delivery') : (locale === 'ar' ? 'تسليم المشروع' : 'Project delivery')}</span><button onClick={() => router.push(projectAreaHref('project', context))}>{locale === 'ar' ? 'الرجوع للسياق' : 'Back to context'}</button><button onClick={() => router.push('/v7/delivery')}>{locale === 'ar' ? 'كل التسليمات' : 'All delivery'}</button></div> : null}
    </PageHeader>
    <section className="v7-delivery-pulse"><div><span className="v7-eyebrow">SUBMISSION PIPELINE</span><strong>{locale === 'ar' ? 'من التجميع إلى التقديم بدون كسر مرجعية الـCDE' : 'From collection to submission without breaking CDE traceability'}</strong><small>{locale === 'ar' ? 'الحزم تظل مرتبطة بالمستندات الأصلية، والتجميد يثبت الإصدارات المقدمة فقط.' : 'Packages stay linked to canonical documents; freezing pins only the submitted versions.'}</small></div><div className="v7-delivery-pulse-metrics"><span><small>Packages</small><strong>{directory ? (counts.packages ?? total) : '—'}</strong></span><span><small>Collecting</small><strong>{directory ? (counts.collecting ?? 0) : '—'}</strong></span><span><small>Submitted</small><strong>{directory ? ((counts.submitted ?? 0) + (counts.approved ?? 0)) : '—'}</strong></span><span><small>Cabinets</small><strong>{directory ? (counts.cabinets ?? 0) : '—'}</strong></span></div></section>
    <Panel title={locale === 'ar' ? 'حزم التقديم' : 'Submission packages'} description={locale === 'ar' ? 'بحث وتصفية Server-side داخل سياق المشروع أو الموقع الحالي.' : 'Server-side search and filtering inside the active project or site context.'}>
      <div className="v7-delivery-toolbar"><div className="v7-search-field"><Icon name="search" size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={locale === 'ar' ? 'ابحث برقم الحزمة أو العنوان…' : 'Search package number or title…'} /></div><select value={status} onChange={e => setStatus(e.target.value)}><option value="">{locale === 'ar' ? 'كل الحالات' : 'All statuses'}</option><option value="collecting">Collecting</option><option value="ready">Ready</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="archived">Archived</option></select><span className="v7-toolbar-count">{total} {locale === 'ar' ? 'حزمة' : 'packages'}</span></div>
      {!directory ? <Skeleton lines={6} /> : packages.length ? <><div className="v7-delivery-head"><span>{locale === 'ar' ? 'الحزمة' : 'Package'}</span><span>{locale === 'ar' ? 'النمط' : 'Version mode'}</span><span>{locale === 'ar' ? 'آخر تحديث' : 'Updated'}</span><span>{tx(locale, 'status')}</span><span /></div><div className="v7-delivery-list">{packages.map(p => <button key={p.id} aria-label={`${p.package_no || ''} ${p.title || ''} · ${p.status || ''}`} onClick={() => openPackage(p.id)}><span className="v7-result-icon"><Icon name="delivery" size={17} /></span><span className="v7-list-main"><strong>{p.package_no} · {p.title}</strong><small>{p.claim_type}</small></span><span className="v7-delivery-mode">{p.locked_at ? (locale === 'ar' ? 'إصدارات مجمدة' : 'Frozen versions') : (locale === 'ar' ? 'يتتبع الحالي' : 'Tracks current')}</span><span className="v7-delivery-updated">{formatDate(p.updated_at, locale)}</span><Badge tone={statusTone(p.status)}>{p.status}</Badge><Icon name="chevron" size={15} /></button>)}</div></> : <EmptyState icon="delivery" title={tx(locale, 'noData')} description={debouncedQuery || status ? (locale === 'ar' ? 'لا توجد حزم تطابق البحث أو الفلتر الحالي.' : 'No packages match the current search or filter.') : null} />}
    <div className="v7-pagination"><span>{locale === 'ar' ? `صفحة ${page} من ${pages}` : `Page ${page} of ${pages}`}</span><div><Button onClick={() => setOffset(Math.max(0, offset - pageSize))} disabled={offset === 0}>{locale === 'ar' ? 'السابق' : 'Previous'}</Button><Button onClick={() => setOffset(offset + pageSize)} disabled={!directory?.has_more}>{locale === 'ar' ? 'التالي' : 'Next'}</Button></div></div></Panel>
    <PackageDetail packageId={packageId} locale={locale} router={router} onClose={closePackage} />
  </>;
}
