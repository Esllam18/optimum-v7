'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../lib/api';
import { can } from '../lib/workspace';
import { formatBytes, formatDate, normalizeArray, statusTone } from '../lib/format';
import { projectAreaHref } from '../lib/navigation';
import { tx } from '../lib/i18n';
import ContextRail from '../components/ContextRail';
import SiteCreateSheet from '../components/SiteCreateSheet';
import CabinetCreateSheet from '../components/CabinetCreateSheet';
import { ProjectEditSheet, SiteEditSheet, CabinetEditSheet } from '../components/EntityEditSheets';
import LifecycleActionSheet from '../components/LifecycleActionSheet';
import Icon from '../components/Icon';
import { Badge, Button, EmptyState, ErrorState, PageHeader, Panel, Skeleton, Stat } from '../components/Primitives';

function ProjectOverview({ data, projectId, locale, router, onCreateSite, canCreateSite }) {
  const p = data.project || {};
  const stats = data.stats || {};
  const sites = normalizeArray(data.sites);
  const activity = normalizeArray(data.recent_activity);
  return <>
    <div className="v7-stats-grid v7-stats-grid--six">
      <Stat label={tx(locale, 'site')} value={stats.sites ?? sites.length} icon="map" />
      <Stat label="Cabinets" value={stats.cabinets ?? 0} icon="layers" />
      <Stat label={tx(locale, 'openWork')} value={stats.open_tasks ?? 0} icon="check" />
      <Stat label={tx(locale, 'documents')} value={stats.documents ?? 0} icon="file" />
      <Stat label={tx(locale, 'engineering')} value={stats.drawings ?? 0} icon="drafting" />
      <Stat label={tx(locale, 'delivery')} value={stats.claim_packages ?? 0} icon="delivery" />
    </div>
    <div className="v7-two-column">
      <Panel title={tx(locale, 'site')} description={locale === 'ar' ? 'افتح الموقع للعمل داخل نفس سياق المشروع، من الكابينات إلى المستندات والتسليم.' : 'Open a site to stay inside the same project context from cabinets to documents and delivery.'} action={canCreateSite ? <Button icon="plus" onClick={onCreateSite}>{locale === 'ar' ? 'موقع جديد' : 'New site'}</Button> : null}>
        {sites.length ? <div className="v7-site-list">{sites.map(site => <button key={site.id} onClick={() => router.push(`/v7/projects/${projectId}?site=${site.id}`)}><span className="v7-result-icon"><Icon name="map" size={17} /></span><span><strong>{site.name}</strong><small>{site.code} · {site.cabinets || 0} Cabinets{site.claim_status ? ` · ${site.claim_status}` : ''}</small></span><Badge tone={statusTone(site.status || 'active')}>{site.status || 'active'}</Badge><Icon name="chevron" size={15} /></button>)}</div> : <EmptyState icon="map" title={tx(locale, 'noData')} />}
      </Panel>
      <Panel title={locale === 'ar' ? 'صحة المشروع' : 'Project health'} description={locale === 'ar' ? 'ملخص تشغيلي سريع بدون إغراق الشاشة بالمؤشرات.' : 'A compact operating summary without turning the page into a metrics wall.'}>
        <div className="v7-health-summary"><div className="v7-health-ring" style={{ '--score': `${Math.max(0, Math.min(100, Number(data.health?.score ?? 0)))}%` }}><strong>{data.health?.score ?? 0}</strong><span>/ 100</span></div><div><strong>{data.health?.archived ? (locale === 'ar' ? 'المشروع مؤرشف' : 'Project archived') : (locale === 'ar' ? 'المشروع تشغيلي' : 'Project operational')}</strong><p>{locale === 'ar' ? `المهام المفتوحة ${stats.open_tasks || 0} · المتأخرة ${stats.overdue_tasks || 0} · التخزين ${formatBytes(stats.storage_bytes || 0, locale)}` : `${stats.open_tasks || 0} open · ${stats.overdue_tasks || 0} overdue · ${formatBytes(stats.storage_bytes || 0, locale)} stored`}</p><div className="v7-inline-actions"><Button icon="check" onClick={() => router.push(projectAreaHref('work', { project_id: projectId }))}>{tx(locale, 'work')}</Button><Button icon="folder" onClick={() => router.push(projectAreaHref('documents', { project_id: projectId }))}>{tx(locale, 'documents')}</Button></div></div></div>
      </Panel>
    </div>
    {activity.length ? <Panel title={locale === 'ar' ? 'آخر نشاط بالمشروع' : 'Recent project activity'} description={locale === 'ar' ? 'آخر التغييرات المسجلة على موارد المشروع.' : 'Latest audited changes touching project resources.'}><div className="v7-linked-list">{activity.slice(0, 8).map(item => <article key={item.id}><Icon name="activity" size={15} /><span><strong>{item.action}</strong><small>{formatDate(item.created_at, locale)} · {item.entity_type || 'resource'}</small></span></article>)}</div></Panel> : null}
  </>;
}

function SiteWorkspace({ data, locale, router, onOpenCabinet, onCreateCabinet }) {
  const site = data.site || {};
  const project = data.project || {};
  const stats = data.stats || {};
  const cabinets = normalizeArray(data.cabinets);
  const claim = data.claim_package;
  const claimPackage = claim?.package;
  const claimProgress = claim?.progress || {};
  const context = { project_id: project.id, site_id: site.id };
  return <>
    <ContextRail project={project} site={site} locale={locale} active="overview" />
    <div className="v7-section-heading"><div><span className="v7-eyebrow">SITE 360</span><h2>{site.code} · {site.name}</h2><p>{site.description || site.address || (locale === 'ar' ? 'مساحة تشغيل الموقع وربط المستندات والعمل والهندسة والتسليم.' : 'The operational site workspace connecting documents, work, engineering and delivery.')}</p></div><Badge tone={statusTone(site.status)}>{site.status}</Badge></div>
    <div className="v7-stats-grid v7-stats-grid--six">
      <Stat label="Cabinets" value={stats.cabinets ?? cabinets.length} icon="layers" tone="brand" />
      <Stat label={tx(locale, 'openWork')} value={stats.open_tasks ?? 0} icon="check" />
      <Stat label="Overdue" value={stats.overdue_tasks ?? 0} icon="alert" tone={stats.overdue_tasks ? 'danger' : 'neutral'} />
      <Stat label={tx(locale, 'documents')} value={stats.documents ?? 0} icon="file" />
      <Stat label={tx(locale, 'engineering')} value={stats.drawings ?? 0} icon="drafting" />
      <Stat label={tx(locale, 'storage')} value={formatBytes(stats.storage_bytes || 0, locale)} icon="folder" />
    </div>
    <div className="v7-two-column">
      <Panel title={locale === 'ar' ? 'الكابينات' : 'Cabinets'} description={locale === 'ar' ? 'كل كابينة وحدة تسليم حقيقية لها ملفاتها ورسوماتها وحصرها وأعمالها.' : 'Each cabinet is a real delivery unit with its own evidence, drawings, takeoff and work.'} action={data.can_create_cabinet ? <Button icon="plus" onClick={onCreateCabinet}>{locale === 'ar' ? 'كابينة جديدة' : 'New cabinet'}</Button> : null}>
        {cabinets.length ? <div className="v7-cabinet-grid">{cabinets.map(cabinet => <button key={cabinet.id} onClick={() => onOpenCabinet(cabinet)}><span className="v7-result-icon"><Icon name="layers" size={18} /></span><span><strong>{cabinet.code} · {cabinet.name}</strong><small>{cabinet.cabinet_type || 'Cabinet'} · {cabinet.claim_items || 0} claim items</small></span><Badge tone={statusTone(cabinet.status)}>{cabinet.status}</Badge><Icon name="chevron" size={15} /></button>)}</div> : <EmptyState icon="layers" title={locale === 'ar' ? 'لا توجد كابينات بعد' : 'No cabinets yet'} />}
      </Panel>
      <Panel title={locale === 'ar' ? 'جاهزية التسليم' : 'Delivery readiness'} description={locale === 'ar' ? 'الجاهزية محسوبة من المتطلبات الحقيقية وتغطية الكابينات.' : 'Readiness is computed from actual evidence requirements and cabinet coverage.'}>
        {claimPackage ? <div className="v7-readiness-card"><div><span>{claimPackage.package_no}</span><Badge tone={statusTone(claimPackage.status)}>{claimPackage.status}</Badge></div><strong>{claimProgress.overall_percent ?? 0}%</strong><div className="v7-progress v7-progress--large"><i style={{ width: `${Math.max(0, Math.min(100, Number(claimProgress.overall_percent || 0)))}%` }} /></div><p>{locale === 'ar' ? `${claimProgress.required_satisfied || 0} من ${claimProgress.required_total || 0} متطلبات أساسية · تغطية الكابينات ${claimProgress.cabinet_coverage_percent || 0}%` : `${claimProgress.required_satisfied || 0}/${claimProgress.required_total || 0} required evidence · ${claimProgress.cabinet_coverage_percent || 0}% cabinet coverage`}</p><Button variant="primary" icon="delivery" onClick={() => router.push(projectAreaHref('delivery', context, { package: claimPackage.id }))}>{locale === 'ar' ? 'فتح ملف التسليم' : 'Open delivery package'}</Button></div> : <EmptyState icon="delivery" title={locale === 'ar' ? 'لا توجد حزمة تسليم' : 'No delivery package'} />}
      </Panel>
    </div>
  </>;
}

function CabinetWorkspace({ data, locale, router }) {
  const cabinet = data.cabinet || {};
  const project = data.project || {};
  const site = data.site || {};
  const stats = data.stats || {};
  const folders = normalizeArray(data.folders);
  return <>
    <ContextRail project={project} site={site} cabinet={cabinet} locale={locale} active="overview" />
    <div className="v7-section-heading"><div><span className="v7-eyebrow">CABINET 360</span><h2>{cabinet.code} · {cabinet.name}</h2><p>{cabinet.description || cabinet.location_label || (locale === 'ar' ? 'وحدة تسليم مرتبطة مباشرة بالمستندات والرسومات والحصر والعمل.' : 'A delivery unit directly connected to documents, drawings, takeoff and work.')}</p></div><Badge tone={statusTone(cabinet.status)}>{cabinet.status}</Badge></div>
    <div className="v7-stats-grid">
      <Stat label={tx(locale, 'documents')} value={stats.documents ?? 0} icon="file" tone="brand" />
      <Stat label={tx(locale, 'engineering')} value={stats.drawings ?? 0} icon="drafting" />
      <Stat label={tx(locale, 'openWork')} value={stats.open_tasks ?? 0} icon="check" />
      <Stat label={locale === 'ar' ? 'جاهزية التسليم' : 'Readiness'} value={`${stats.readiness_percent ?? 0}%`} icon="delivery" />
    </div>
    <Panel title={locale === 'ar' ? 'هيكل ملفات الكابينة' : 'Cabinet evidence structure'} description={locale === 'ar' ? 'المجلدات القياسية ليست نسخًا منفصلة من البيانات؛ هي سياق مباشر داخل الـCDE.' : 'Standard folders remain part of the canonical CDE rather than duplicate evidence stores.'}>
      {folders.length ? <div className="v7-evidence-grid">{folders.map(folder => <button key={folder.id} onClick={() => router.push(projectAreaHref('documents', { project_id: project.id, site_id: site.id, cabinet_id: cabinet.id, folder_id: folder.id }))}><span><Icon name={folder.code === 'C02' ? 'trend' : folder.code === 'C01' ? 'drafting' : 'folder'} size={18} /></span><strong>{folder.code}</strong><small>{folder.name}</small><Icon name="arrow" size={14} /></button>)}</div> : <EmptyState icon="folder" title={tx(locale, 'noData')} />}
    </Panel>
  </>;
}

export default function ProjectDetailPage({ workspace, projectId, locale }) {
  const params = useSearchParams();
  const router = useRouter();
  const siteId = params.get('site') || '';
  const cabinetId = params.get('cabinet') || '';
  const [projectData, setProjectData] = useState(null);
  const [siteData, setSiteData] = useState(null);
  const [cabinetData, setCabinetData] = useState(null);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  const [siteCreateOpen, setSiteCreateOpen] = useState(false);
  const [cabinetCreateOpen, setCabinetCreateOpen] = useState(false);
  const [editKind, setEditKind] = useState('');
  const [lifecycle, setLifecycle] = useState(null);

  useEffect(() => {
    const c = new AbortController();
    setProjectData(null); setError(null);
    api.rpc('project_360', { p_project_id: projectId }, { cacheTtlMs: 12_000, signal: c.signal, dedupe: true }).then(setProjectData).catch(err => { if (err?.name !== 'AbortError') setError(err); });
    return () => c.abort();
  }, [projectId, reload]);

  useEffect(() => {
    if (!siteId) { setSiteData(null); return; }
    const c = new AbortController();
    setSiteData(null); setError(null);
    api.rpc('site_360', { p_site_id: siteId }, { cacheTtlMs: 10_000, signal: c.signal, dedupe: true }).then(setSiteData).catch(err => { if (err?.name !== 'AbortError') setError(err); });
    return () => c.abort();
  }, [siteId, reload]);

  useEffect(() => {
    if (!cabinetId) { setCabinetData(null); return; }
    const c = new AbortController();
    setCabinetData(null); setError(null);
    api.rpc('cabinet_360', { p_cabinet_id: cabinetId }, { cacheTtlMs: 10_000, signal: c.signal, dedupe: true }).then(setCabinetData).catch(err => { if (err?.name !== 'AbortError') setError(err); });
    return () => c.abort();
  }, [cabinetId, reload]);

  const selectedSite = useMemo(() => siteData?.site || normalizeArray(projectData?.sites).find(item => item.id === siteId) || null, [siteData, projectData, siteId]);
  const p = projectData?.project || {};
  if (error) return <ErrorState title={tx(locale, 'networkIssue')} description={error.message} retryLabel={tx(locale, 'retry')} onRetry={() => { api.clearReadCache(); setReload(x => x + 1); }} />;
  if (!projectData) return <><PageHeader title="…" description={tx(locale, 'loading')} /><Skeleton lines={8} /></>;

  const title = cabinetData?.cabinet ? cabinetData.cabinet.name : siteData?.site ? siteData.site.name : p.name;
  const eyebrow = cabinetData?.cabinet ? `${p.code} · ${selectedSite?.code || ''} · ${cabinetData.cabinet.code}` : siteData?.site ? `${p.code} · ${siteData.site.code}` : `PROJECT 360 · ${p.code || ''}`;
  const currentKind = cabinetData?.cabinet ? 'cabinet' : siteData?.site ? 'site' : 'project';
  const currentEntity = cabinetData?.cabinet || siteData?.site || p;
  const archived = Boolean(currentEntity?.archived_at || currentEntity?.status === 'archived');
  const canEditCurrent = currentKind === 'project' ? can(workspace, 'projects.edit') : currentKind === 'site' ? Boolean(siteData?.can_edit_site) : Boolean(cabinetData?.can_manage);
  const canArchiveCurrent = currentKind === 'project' ? can(workspace, 'projects.archive') : currentKind === 'site' ? Boolean(siteData?.can_archive_site) : Boolean(cabinetData?.can_archive);
  const refreshContext = () => { api.clearReadCache(); setReload(x => x + 1); };
  const heroProgress = currentKind === 'project' ? Math.max(0, Math.min(100, Number(p.progress_percent || 0))) : currentKind === 'cabinet' ? Math.max(0, Math.min(100, Number(cabinetData?.stats?.readiness_percent || 0))) : null;
  return <>
    <button className="v7-back-link" onClick={() => cabinetId ? router.push(`/v7/projects/${projectId}?site=${siteId}`) : siteId ? router.push(`/v7/projects/${projectId}`) : router.push('/v7/projects')}><Icon name="arrow" size={15} /> {cabinetId ? (locale === 'ar' ? 'الموقع' : 'Site') : siteId ? (locale === 'ar' ? 'المشروع' : 'Project') : tx(locale, 'projects')}</button>
    <section className="v7-entity-hero">
      <div className="v7-entity-hero-copy">
        <span className="v7-eyebrow">{eyebrow}</span>
        <div className="v7-entity-title-row"><h1>{title || tx(locale, 'project')}</h1><Badge tone={statusTone(currentEntity?.status)}>{currentEntity?.status}</Badge></div>
        <p>{cabinetData?.cabinet?.description || siteData?.site?.description || p.description || p.client_name || tx(locale, 'projectCenterSub')}</p>
        <div className="v7-context-chips"><span>{p.client_name || p.code || '—'}</span>{selectedSite ? <span>{selectedSite.code} · {selectedSite.name}</span> : null}{cabinetData?.cabinet ? <span>{cabinetData.cabinet.cabinet_type || 'Cabinet'}</span> : null}<span>{formatDate(cabinetData?.cabinet?.updated_at || siteData?.site?.target_end_date || p.target_end_date, locale)}</span></div>
        {heroProgress !== null ? <div className="v7-entity-progress"><div><span>{currentKind === 'project' ? tx(locale, 'progress') : (locale === 'ar' ? 'جاهزية التسليم' : 'Delivery readiness')}</span><strong>{heroProgress}%</strong></div><div className="v7-progress"><i style={{ width: `${heroProgress}%` }} /></div></div> : null}
      </div>
      <div className="v7-entity-hero-actions">
        {canEditCurrent && !archived ? <Button variant="secondary" icon="edit" onClick={() => setEditKind(currentKind)}>{locale === 'ar' ? 'تعديل' : 'Edit'}</Button> : null}
        <Button variant="secondary" icon="folder" onClick={() => router.push(projectAreaHref('documents', { project_id: projectId, site_id: siteId || null, cabinet_id: cabinetId || null, folder_id: cabinetData?.cabinet?.root_folder_id || null }))}>{tx(locale, 'documents')}</Button>
        {canArchiveCurrent ? <Button variant={archived ? 'secondary' : 'danger'} icon={archived ? 'refresh' : 'archive'} onClick={() => setLifecycle({ kind: currentKind, mode: archived ? 'reactivate' : 'archive', entity: currentEntity })}>{archived ? (locale === 'ar' ? 'إعادة التنشيط' : 'Reactivate') : (locale === 'ar' ? 'أرشفة' : 'Archive')}</Button> : null}
      </div>
    </section>
    {!siteId ? <><ContextRail project={p} locale={locale} active="overview" /><ProjectOverview data={projectData} projectId={projectId} locale={locale} router={router} canCreateSite={can(workspace, 'projects.create')} onCreateSite={() => setSiteCreateOpen(true)} /></> : cabinetId ? (!cabinetData ? <Skeleton lines={10} /> : <CabinetWorkspace data={cabinetData} locale={locale} router={router} />) : (!siteData ? <Skeleton lines={10} /> : <SiteWorkspace data={siteData} locale={locale} router={router} onOpenCabinet={(cabinet) => router.push(`/v7/projects/${projectId}?site=${siteId}&cabinet=${cabinet.id}`)} onCreateCabinet={() => setCabinetCreateOpen(true)} />)}
    <SiteCreateSheet open={siteCreateOpen} onClose={() => setSiteCreateOpen(false)} workspace={workspace} project={p} locale={locale} onCreated={(site) => { setSiteCreateOpen(false); api.clearReadCache(); setReload(x => x + 1); if (site?.id) router.push(`/v7/projects/${projectId}?site=${site.id}`); }} />
    <CabinetCreateSheet open={cabinetCreateOpen} onClose={() => setCabinetCreateOpen(false)} site={siteData?.site || {}} locale={locale} onCreated={(cabinet) => { setCabinetCreateOpen(false); api.clearReadCache(); setReload(x => x + 1); if (cabinet?.id) router.push(`/v7/projects/${projectId}?site=${siteId}&cabinet=${cabinet.id}`); }} />
    <ProjectEditSheet open={editKind === 'project'} onClose={() => setEditKind('')} workspace={workspace} project={p} locale={locale} onSaved={() => { setEditKind(''); refreshContext(); }} />
    <SiteEditSheet open={editKind === 'site'} onClose={() => setEditKind('')} workspace={workspace} site={siteData?.site || {}} locale={locale} onSaved={() => { setEditKind(''); refreshContext(); }} />
    <CabinetEditSheet open={editKind === 'cabinet'} onClose={() => setEditKind('')} cabinet={cabinetData?.cabinet || {}} locale={locale} onSaved={() => { setEditKind(''); refreshContext(); }} />
    <LifecycleActionSheet open={Boolean(lifecycle)} onClose={() => setLifecycle(null)} kind={lifecycle?.kind} mode={lifecycle?.mode} entity={lifecycle?.entity} locale={locale} onDone={() => { setLifecycle(null); refreshContext(); }} />
  </>;
}
