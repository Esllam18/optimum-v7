'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../lib/api';
import { can } from '../lib/workspace';
import { formatBytes, formatDate, normalizeArray, statusTone } from '../lib/format';
import { projectAreaHref } from '../lib/navigation';
import { tx } from '../lib/i18n';
import Icon from '../components/Icon';
import SideSheet from '../components/SideSheet';
import UploadDocumentsSheet from '../components/UploadDocumentsSheet';
import NewVersionSheet from '../components/NewVersionSheet';
import DocumentControlSheet from '../components/DocumentControlSheet';
import ClaimEvidenceSheet from '../components/ClaimEvidenceSheet';
import CdeTrashSheet from '../components/CdeTrashSheet';
import FolderControlSheet from '../components/FolderControlSheet';
import StorageIntelligenceSheet from '../components/StorageIntelligenceSheet';
import { Badge, Button, EmptyState, ErrorState, PageHeader, Panel, Skeleton } from '../components/Primitives';

const PAGE_SIZE = 50;
const documentsHref = ({ projectId, siteId, folderId, documentId }) => {
  const params = new URLSearchParams();
  if (projectId) params.set('project', projectId);
  if (siteId) params.set('site', siteId);
  if (folderId) params.set('folder', folderId);
  if (documentId) params.set('document', documentId);
  return `/v7/documents${params.size ? `?${params.toString()}` : ''}`;
};

function DocumentDetail({ documentId, workspace, locale, folderOptions = [], onClose, router, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState('');
  const [reload, setReload] = useState(0);
  const [versionOpen, setVersionOpen] = useState(false);
  const [controlMode, setControlMode] = useState('');
  const [claimOpen, setClaimOpen] = useState(false);
  const [removingClaimId, setRemovingClaimId] = useState('');
  const [downloadingId, setDownloadingId] = useState('');

  useEffect(() => {
    if (!documentId) { setData(null); setError(null); setActionError(''); return; }
    const c = new AbortController();
    setData(null); setError(null); setActionError('');
    api.rpc('document_360', { p_document_id: documentId }, { cacheTtlMs: 10_000, signal: c.signal, dedupe: true })
      .then(setData).catch(err => { if (err?.name !== 'AbortError') setError(err); });
    return () => c.abort();
  }, [documentId, reload]);

  const doc = data?.document || {};
  const context = { project_id: doc.project_id || data?.project?.id, site_id: doc.site_id || data?.site?.id, folder_id: doc.folder_id || data?.folder?.id, document_id: doc.id };
  const versions = normalizeArray(data?.versions);
  const currentVersion = versions.find(row => row.id === doc.current_version_id) || versions[0] || null;
  const versioningEnabled = Boolean(workspace?.entitlements?.get('feature.file_versioning')?.enabled);

  const downloadVersion = async (version) => {
    if (!version?.id || downloadingId) return;
    setDownloadingId(version.id); setActionError('');
    try {
      const rows = await api.select('document_versions', {
        select: 'id,original_filename,storage_bucket,storage_path,upload_state',
        filters: { id: `eq.${version.id}`, document_id: `eq.${documentId}`, upload_state: 'eq.ready' },
        limit: 1, cacheTtlMs: 0
      });
      const stored = rows[0];
      if (!stored?.storage_path) throw new Error(locale === 'ar' ? 'تعذر العثور على ملف هذا الإصدار.' : 'The stored file for this version could not be found.');
      await api.downloadObject(stored.storage_bucket, stored.storage_path, stored.original_filename || version.original_filename || doc.display_name);
    } catch (err) { setActionError(err.message || (locale === 'ar' ? 'تعذر تنزيل الملف.' : 'Could not download the file.')); }
    finally { setDownloadingId(''); }
  };

  const changed = () => { api.clearReadCache(); setReload(value => value + 1); onChanged?.(); };
  const removeClaim = async (itemId) => {
    if (!itemId || removingClaimId) return;
    setRemovingClaimId(itemId); setActionError('');
    try { await api.rpc('remove_site_claim_item', { p_item_id: itemId }); changed(); }
    catch (err) { setActionError(err.message || (locale === 'ar' ? 'تعذر إزالة المستند من المستخلص.' : 'Could not remove the document from the claim package.')); }
    finally { setRemovingClaimId(''); }
  };

  const controlDone = async result => {
    setControlMode('');
    if (result?.mode === 'trash') { onChanged?.(); onClose?.(); return; }
    changed();
  };

  return <>
    <SideSheet open={Boolean(documentId)} onClose={onClose} eyebrow="DOCUMENT 360" title={data ? doc.display_name || tx(locale, 'documents') : tx(locale, 'loading')} subtitle={data ? [doc.system_code, doc.document_type, data.project?.name, data.site?.name].filter(Boolean).join(' · ') : ''}>
      {error ? <ErrorState title={tx(locale, 'networkIssue')} description={error.message} /> : !data ? <Skeleton lines={10} /> : <>
        <div className="v7-document-actions">
          {data.can_upload && versioningEnabled ? <Button variant="primary" icon="upload" onClick={() => setVersionOpen(true)}>{locale === 'ar' ? 'إصدار جديد' : 'New version'}</Button> : null}
          {currentVersion && data.can_download ? <Button icon="download" onClick={() => downloadVersion(currentVersion)} disabled={Boolean(downloadingId)}>{downloadingId === currentVersion.id ? (locale === 'ar' ? 'جارٍ التنزيل…' : 'Downloading…') : (locale === 'ar' ? 'تنزيل الحالي' : 'Download current')}</Button> : null}
          <Button icon="check" onClick={() => router.push(projectAreaHref('work', context, { create: 'task' }))}>{locale === 'ar' ? 'إنشاء عمل مرتبط' : 'Create linked work'}</Button>
          {data.can_rename ? <Button icon="edit" onClick={() => setControlMode('rename')}>{locale === 'ar' ? 'إعادة تسمية' : 'Rename'}</Button> : null}
          {data.can_move ? <Button icon="move" onClick={() => setControlMode('move')}>{locale === 'ar' ? 'نقل' : 'Move'}</Button> : null}
          {data.can_manage ? <Button icon="shield" onClick={() => setControlMode('status')}>{locale === 'ar' ? 'المراجعة والاعتماد' : 'Review status'}</Button> : null}
          {data.can_manage && doc.site_id && normalizeArray(data.claim_options).length ? <Button icon="delivery" onClick={() => setClaimOpen(true)}>{locale === 'ar' ? 'إضافة للمستخلص' : 'Add to claim'}</Button> : null}
          {data.can_archive ? <Button variant="danger" icon="trash" onClick={() => setControlMode('trash')}>{locale === 'ar' ? 'إلى السلة' : 'Trash'}</Button> : null}
        </div>
        {actionError ? <div className="v7-form-error">{actionError}</div> : null}
        <div className="v7-detail-section">
          <div className="v7-detail-grid">
            <div className="v7-detail-field"><span>{tx(locale, 'status')}</span><strong><Badge tone={statusTone(doc.control_status)}>{doc.control_status || 'working'}</Badge></strong></div>
            <div className="v7-detail-field"><span>{locale === 'ar' ? 'الإصدار الحالي' : 'Current version'}</span><strong>V{currentVersion?.version_number || doc.version_count || '—'}</strong></div>
            <div className="v7-detail-field"><span>{tx(locale, 'project')}</span><strong>{data.project?.code} · {data.project?.name}</strong></div>
            <div className="v7-detail-field"><span>{locale === 'ar' ? 'الموقع داخل CDE' : 'CDE location'}</span><strong>{[data.site?.name, data.cabinet?.name, data.folder?.name].filter(Boolean).join(' · ') || (locale === 'ar' ? 'CDE المشروع' : 'Project CDE')}</strong></div>
            <div className="v7-detail-field"><span>{locale === 'ar' ? 'التخصص' : 'Discipline'}</span><strong>{doc.discipline || '—'}</strong></div>
            <div className="v7-detail-field"><span>{locale === 'ar' ? 'المالك' : 'Owner'}</span><strong>{data.owner_name || '—'}</strong></div>
            <div className="v7-detail-field"><span>{locale === 'ar' ? 'موعد المراجعة' : 'Review due'}</span><strong>{formatDate(doc.review_due_at, locale)}</strong></div>
            <div className="v7-detail-field"><span>{locale === 'ar' ? 'آخر تحديث' : 'Updated'}</span><strong>{formatDate(doc.updated_at, locale)}</strong></div>
          </div>
          {doc.description ? <p>{doc.description}</p> : null}
          <div className="v7-inline-actions"><Button icon="briefcase" onClick={() => router.push(projectAreaHref('project', context))}>{locale === 'ar' ? 'المشروع 360' : 'Project 360'}</Button><Button icon="folder" onClick={() => router.push(projectAreaHref('documents', context))}>{locale === 'ar' ? 'فتح المجلد' : 'Open folder'}</Button>{data.site?.id ? <Button icon="map" onClick={() => router.push(projectAreaHref('project', context, { site:data.site.id }))}>{locale === 'ar' ? 'الموقع 360' : 'Site 360'}</Button> : null}</div>
        </div>
        <div className="v7-detail-section"><h3>{locale === 'ar' ? 'سجل الإصدارات' : 'Version history'}</h3>{versions.length ? <div className="v7-version-list">{versions.map(version => <article key={version.id} className={version.id === doc.current_version_id ? 'is-current' : ''}><Icon name="layers" size={15} /><span><strong>{version.version_label || `V${version.version_number}`} · {version.original_filename}</strong><small>{formatBytes(version.size_bytes || 0, locale)} · {version.uploader_name || 'Member'} · {formatDate(version.finalized_at || version.created_at, locale)}{version.change_note ? ` · ${version.change_note}` : ''}</small></span><Badge tone={version.upload_state === 'ready' ? 'success' : 'warning'}>{version.upload_state}</Badge>{version.upload_state === 'ready' && data.can_download ? <Button className="v7-version-download" icon="download" onClick={() => downloadVersion(version)} disabled={Boolean(downloadingId)}>{downloadingId === version.id ? '…' : (locale === 'ar' ? 'تنزيل' : 'Download')}</Button> : null}</article>)}</div> : <EmptyState icon="layers" title={tx(locale, 'noData')} />}</div>
        <div className="v7-detail-section"><h3>{locale === 'ar' ? 'العمل المرتبط' : 'Linked work'}</h3>{normalizeArray(data.linked_tasks).length ? <div className="v7-linked-list">{normalizeArray(data.linked_tasks).map(task => <button key={task.id} onClick={() => router.push(projectAreaHref('work', context, { task: task.id }))}><Icon name="check" size={15} /><span><strong>#{task.task_number} · {task.title}</strong><small>{task.priority} · {formatDate(task.due_at, locale)}</small></span><Badge tone={statusTone(task.status)}>{task.status}</Badge></button>)}</div> : <p>{locale === 'ar' ? 'لا يوجد عمل مرتبط بهذا المستند.' : 'No tasks are linked to this document.'}</p>}</div>
        <div className="v7-detail-section"><h3>{locale === 'ar' ? 'الهندسة المرتبطة' : 'Linked engineering'}</h3>{normalizeArray(data.linked_drawings).length ? <div className="v7-linked-list">{normalizeArray(data.linked_drawings).map(drawing => <button key={`${drawing.id}:${drawing.revision_id || ''}`} onClick={() => router.push(projectAreaHref('engineering', context, { drawing: drawing.id }))}><Icon name="drafting" size={15} /><span><strong>{drawing.drawing_no} · {drawing.title}</strong><small>{drawing.relation_type || 'reference'}</small></span><Icon name="chevron" size={14} /></button>)}</div> : <p>{locale === 'ar' ? 'لا توجد رسومات مرتبطة بهذا المستند.' : 'No engineering drawing is linked to this document.'}</p>}</div>
        <div className="v7-detail-section"><h3>{locale === 'ar' ? 'دليل التسليم' : 'Delivery evidence'}</h3>{normalizeArray(data.claim_links).length ? <div className="v7-linked-list">{normalizeArray(data.claim_links).map(link => <div className="v7-linked-action-row" key={link.item_id}><button onClick={() => router.push(projectAreaHref('delivery', { ...context, site_id: data?.site?.id || context.site_id }, { package: link.package_id }))}><Icon name="delivery" size={15} /><span><strong>{link.package_no} · {locale === 'ar' ? link.label_ar : link.label_en}</strong><small>{link.selected_version_id ? (locale === 'ar' ? 'إصدار مثبت للتسليم' : 'Pinned version') : (locale === 'ar' ? 'يتبع المستند الأصلي حتى التجميد' : 'Tracks canonical document')}</small></span><Badge tone={statusTone(link.package_status)}>{link.package_status}</Badge></button>{data.can_manage && !link.selected_version_id && !['submitted','approved','archived'].includes(link.package_status) ? <Button icon="close" onClick={() => removeClaim(link.item_id)} disabled={Boolean(removingClaimId)}>{removingClaimId === link.item_id ? '…' : (locale === 'ar' ? 'إزالة' : 'Remove')}</Button> : null}</div>)}</div> : <p>{locale === 'ar' ? 'المستند غير مستخدم حاليًا كدليل تسليم.' : 'This document is not currently used as delivery evidence.'}</p>}</div>
        <div className="v7-detail-section"><div className="v7-section-heading"><h3>{locale === 'ar' ? 'نشاط المستند' : 'Document activity'}</h3><Badge tone="neutral">{normalizeArray(data.recent_activity).length}</Badge></div>{normalizeArray(data.recent_activity).length ? <div className="v7-timeline-list">{normalizeArray(data.recent_activity).map(item => <article key={item.id}><span><Icon name="activity" size={14} /></span><div><strong>{item.action}</strong><small>{formatDate(item.created_at, locale)}{item.actor_id ? ` · ${String(item.actor_id).slice(0,8)}` : ''}</small></div></article>)}</div> : <p>{locale === 'ar' ? 'لا يوجد نشاط مرئي لهذا المستند أو أن صلاحية سجل النشاط غير متاحة.' : 'No visible activity for this document, or audit access is not available.'}</p>}</div>
      </>}
    </SideSheet>
    <NewVersionSheet open={versionOpen} onClose={() => setVersionOpen(false)} document={doc} locale={locale} onUploaded={() => { setVersionOpen(false); changed(); }} />
    <DocumentControlSheet open={Boolean(controlMode)} onClose={() => setControlMode('')} mode={controlMode} data={data} folderOptions={folderOptions} locale={locale} onDone={controlDone} />
    <ClaimEvidenceSheet open={claimOpen} onClose={() => setClaimOpen(false)} data={data} locale={locale} onDone={() => { setClaimOpen(false); changed(); }} />
  </>;
}

export default function DocumentsPage({ workspace, locale }) {
  const params = useSearchParams();
  const router = useRouter();
  const requestedProject = params.get('project') || '';
  const requestedSite = params.get('site') || '';
  const requestedFolder = params.get('folder') || '';
  const documentId = params.get('document') || '';

  const [projects, setProjects] = useState(null);
  const [sites, setSites] = useState([]);
  const [projectId, setProjectId] = useState(requestedProject);
  const [siteId, setSiteId] = useState(requestedSite);
  const [folderId, setFolderId] = useState(requestedFolder);
  const [workspaceData, setWorkspaceData] = useState(null);
  const [documentRows, setDocumentRows] = useState([]);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [searchRows, setSearchRows] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [folderControl, setFolderControl] = useState({ mode: '', folder: null });
  const [storageOpen, setStorageOpen] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const c = new AbortController();
    api.select('projects', { filters: { company_id: `eq.${workspace.company.id}` }, order: 'updated_at.desc', limit: 60, cacheTtlMs: 20_000, signal: c.signal })
      .then(rows => { setProjects(rows); const next = rows.find(p => p.id === requestedProject)?.id || rows.find(p => p.status !== 'archived')?.id || rows[0]?.id || ''; setProjectId(next); })
      .catch(err => { if (err?.name !== 'AbortError') setError(err); });
    return () => c.abort();
  }, [workspace.company.id, requestedProject]);

  useEffect(() => {
    if (!projectId) { setSites([]); return; }
    const c = new AbortController();
    api.select('sites', { filters: { company_id: `eq.${workspace.company.id}`, project_id: `eq.${projectId}` }, order: 'name.asc', limit: 120, cacheTtlMs: 20_000, signal: c.signal })
      .then(rows => { setSites(rows); if (requestedSite && rows.some(site => site.id === requestedSite)) setSiteId(requestedSite); else if (siteId && !rows.some(site => site.id === siteId)) setSiteId(''); })
      .catch(() => setSites([]));
    return () => c.abort();
  }, [workspace.company.id, projectId, requestedSite]);

  // The workspace snapshot now carries context + folder tree only. Document rows page separately,
  // so opening a large folder never forces the browser to fetch hundreds of documents at once.
  useEffect(() => {
    if (!projectId) return;
    const c = new AbortController(); setWorkspaceData(null); setError(null);
    api.rpc('file_workspace_snapshot', { p_company_id: workspace.company.id, p_project_id: projectId, p_site_id: siteId || null, p_folder_id: null, p_document_limit: 1 }, { cacheTtlMs: 10_000, signal: c.signal, dedupe: true })
      .then(data => {
        setWorkspaceData(data);
        const folderRows = normalizeArray(data?.folders).filter(f => !f.trashed_at);
        const requested = folderRows.find(f => f.id === folderId) || folderRows.find(f => f.id === requestedFolder);
        if (!requested && folderRows.length) {
          const first = folderRows.find(f => !f.parent_id) || folderRows[0]; setFolderId(first.id);
          router.replace(documentsHref({ projectId, siteId, folderId: first.id, documentId }));
        }
      }).catch(err => { if (err?.name !== 'AbortError') setError(err); });
    return () => c.abort();
  }, [workspace.company.id, projectId, siteId, reload]);

  useEffect(() => { setPage(0); }, [projectId, siteId, folderId, query]);

  useEffect(() => {
    if (!folderId || query.trim().length >= 2) { setDocumentRows([]); setHasMore(false); return; }
    const c = new AbortController(); setDocumentLoading(true);
    const filters = { company_id: `eq.${workspace.company.id}`, project_id: `eq.${projectId}`, site_id: siteId ? `eq.${siteId}` : 'is.null', folder_id: `eq.${folderId}`, state: 'eq.active' };
    api.select('documents', { select: 'id,project_id,site_id,folder_id,display_name,system_code,document_type,version_count,control_status,updated_at', filters, order: 'updated_at.desc', limit: PAGE_SIZE + 1, offset: page * PAGE_SIZE, cacheTtlMs: 8_000, signal: c.signal })
      .then(rows => { setHasMore(rows.length > PAGE_SIZE); setDocumentRows(rows.slice(0, PAGE_SIZE)); })
      .catch(err => { if (err?.name !== 'AbortError') setError(err); })
      .finally(() => { if (!c.signal.aborted) setDocumentLoading(false); });
    return () => c.abort();
  }, [workspace.company.id, projectId, siteId, folderId, page, reload, query]);

  useEffect(() => {
    if (query.trim().length < 2 || !projectId) { setSearchRows(null); setSearchLoading(false); return; }
    const c = new AbortController(); setSearchLoading(true);
    const timer = setTimeout(() => api.rpc('document_search_v2', { p_company_id: workspace.company.id, p_query: query.trim(), p_project_id: projectId, p_site_id: siteId || null, p_document_type: null, p_limit: PAGE_SIZE + 1, p_offset: page * PAGE_SIZE }, { signal: c.signal })
      .then(rows => { const list = normalizeArray(rows); setHasMore(list.length > PAGE_SIZE); setSearchRows(list.slice(0, PAGE_SIZE)); })
      .catch(err => { if (err?.name !== 'AbortError') setSearchRows([]); })
      .finally(() => { if (!c.signal.aborted) setSearchLoading(false); }), 220);
    return () => { clearTimeout(timer); c.abort(); };
  }, [query, projectId, siteId, page, workspace.company.id, reload]);

  const changeProject = next => { setProjectId(next); setSiteId(''); setFolderId(''); setSearchRows(null); setQuery(''); setPage(0); router.replace(documentsHref({ projectId: next })); };
  const changeSite = next => { setSiteId(next); setFolderId(''); setSearchRows(null); setPage(0); router.replace(documentsHref({ projectId, siteId: next })); };
  const openFolder = folder => { setFolderId(folder.id); setQuery(''); setSearchRows(null); setPage(0); router.replace(documentsHref({ projectId, siteId, folderId: folder.id })); };
  const openDocument = doc => router.push(documentsHref({ projectId: doc.project_id || projectId, siteId: doc.site_id || siteId, folderId: doc.folder_id || folderId, documentId: doc.id }));
  const closeDocument = () => router.push(documentsHref({ projectId, siteId, folderId }));
  const refreshDocuments = () => { api.clearReadCache(); setReload(value => value + 1); };
  const closeFolderControl = () => setFolderControl({ mode: '', folder: null });
  const folderChanged = async ({ mode } = {}) => {
    if (mode === 'trash' && folderId === folderControl.folder?.id) {
      setFolderId('');
      router.replace(documentsHref({ projectId, siteId }));
    }
    refreshDocuments();
  };

  if (error) return <ErrorState title={tx(locale, 'networkIssue')} description={error.message} retryLabel={tx(locale, 'retry')} onRetry={() => { api.clearReadCache(); setReload(value => value + 1); }} />;
  const searching = query.trim().length >= 2;
  const docs = searching ? (searchRows || []) : documentRows;
  const folders = normalizeArray(workspaceData?.folders).filter(f => !f.trashed_at);
  const project = (projects || []).find(p => p.id === projectId);
  const currentSite = sites.find(site => site.id === siteId);
  const currentFolder = folders.find(folder => folder.id === folderId);
  const folderDocumentTotal = folders.reduce((sum, folder) => sum + Number(folder.document_count || 0), 0);
  const rowsLoading = searching ? searchLoading : documentLoading;

  return <>
    <PageHeader eyebrow="CDE · DOCUMENT CONTROL" title={tx(locale, 'docsCenter')} description={tx(locale, 'docsCenterSub')} actions={<div className="v7-inline-actions">{can(workspace, 'files.view') ? <Button icon="archive" onClick={() => setStorageOpen(true)}>{locale === 'ar' ? 'ذكاء التخزين' : 'Storage'}</Button> : null}{can(workspace, 'files.view') ? <Button icon="trash" onClick={() => setTrashOpen(true)} disabled={!projectId}>{locale === 'ar' ? 'سلة CDE' : 'CDE trash'}</Button> : null}{can(workspace, 'files.create_folder') ? <Button icon="folder" onClick={() => setFolderControl({ mode: 'create', folder: currentFolder || null })} disabled={!projectId}>{currentFolder ? (locale === 'ar' ? 'مجلد فرعي' : 'Subfolder') : (locale === 'ar' ? 'مجلد جديد' : 'New folder')}</Button> : null}{can(workspace, 'files.upload') ? <Button variant="primary" icon="plus" onClick={() => setUploadOpen(true)} disabled={!folderId} title={!folderId ? (locale === 'ar' ? 'اختر مجلدًا أولًا' : 'Choose a folder first') : undefined}>{locale === 'ar' ? 'رفع مستند' : 'Upload document'}</Button> : null}</div>} />
    <section className="v7-cde-context">
      <div className="v7-cde-scope">
        <span className="v7-eyebrow">ACTIVE CDE CONTEXT</span>
        <div className="v7-cde-breadcrumb"><span><Icon name="briefcase" size={14} />{project?.code || '—'} · {project?.name || tx(locale, 'selectProject')}</span><Icon name="chevron" size={12} /> <span><Icon name="map" size={14} />{currentSite ? `${currentSite.code} · ${currentSite.name}` : (locale === 'ar' ? 'نطاق المشروع العام' : 'Project-wide')}</span>{currentFolder ? <><Icon name="chevron" size={12} /><strong><Icon name="folder" size={14} />{currentFolder.name}</strong></> : null}</div>
      </div>
      <div className="v7-cde-scope-metrics"><span><strong>{folders.length}</strong><small>{locale === 'ar' ? 'مجلدات' : 'Folders'}</small></span><span><strong>{folderDocumentTotal}</strong><small>{locale === 'ar' ? 'مستندات بالنطاق' : 'Documents in scope'}</small></span><span><strong>{currentFolder?.document_count ?? '—'}</strong><small>{locale === 'ar' ? 'داخل المجلد' : 'In folder'}</small></span></div>
    </section>
    <div className="v7-doc-context">
      <label><span>{tx(locale, 'project')}</span><select value={projectId} onChange={e => changeProject(e.target.value)}>{(projects || []).map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></label>
      <label><span>{tx(locale, 'site')}</span><select value={siteId} onChange={e => changeSite(e.target.value)}><option value="">{locale === 'ar' ? 'مستندات المشروع العامة' : 'Project-wide documents'}</option>{sites.map(site => <option key={site.id} value={site.id}>{site.code} — {site.name}</option>)}</select></label>
      <div className="v7-search-field"><Icon name="search" size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={locale === 'ar' ? 'ابحث داخل سياق CDE الحالي…' : 'Search the current CDE context…'} /></div>
    </div>
    <div className="v7-doc-layout">
      <Panel className="v7-folder-panel" title={locale === 'ar' ? 'هيكل الملفات' : 'Folder structure'} description={project?.name || tx(locale, 'selectProject')} action={currentFolder ? <div className="v7-panel-actions">{can(workspace, 'files.rename') ? <Button icon="edit" onClick={() => setFolderControl({ mode: 'rename', folder: currentFolder })}>{locale === 'ar' ? 'تسمية' : 'Rename'}</Button> : null}{can(workspace, 'files.move') ? <Button icon="move" onClick={() => setFolderControl({ mode: 'move', folder: currentFolder })}>{locale === 'ar' ? 'نقل' : 'Move'}</Button> : null}{can(workspace, 'files.archive') && !currentFolder.is_system ? <Button variant="danger" icon="trash" onClick={() => setFolderControl({ mode: 'trash', folder: currentFolder })}>{locale === 'ar' ? 'سلة' : 'Trash'}</Button> : null}</div> : null}>
        {!workspaceData ? <Skeleton lines={8} /> : folders.length ? <div className="v7-folder-list">{folders.map(folder => <button className={folder.id === folderId ? 'is-active' : ''} key={folder.id} onClick={() => openFolder(folder)} style={{ '--folder-depth': Math.max(0, Math.min(4, Number(folder.depth || 0))) }}><span className="v7-folder-icon"><Icon name="folder" size={16} /></span><span><strong>{folder.name}</strong><small>{folder.code || 'Folder'} · {folder.document_count ?? 0} {locale === 'ar' ? 'مستند' : 'docs'}</small></span>{Number(folder.child_count || 0) > 0 ? <span className="v7-folder-children">{folder.child_count}</span> : null}</button>)}</div> : <EmptyState icon="folder" title={tx(locale, 'noData')} />}
      </Panel>
      <Panel className="v7-document-panel" title={searching ? (locale === 'ar' ? 'نتائج البحث' : 'Search results') : currentFolder?.name || tx(locale, 'documents')} description={searching ? `${locale === 'ar' ? 'بحث' : 'Search'}: ${query.trim()}` : currentFolder ? `${currentFolder.code || 'Folder'} · ${currentFolder.document_count ?? 0} ${locale === 'ar' ? 'مستند' : 'documents'}` : project?.name}>
        {rowsLoading ? <Skeleton lines={8} /> : docs.length ? <><div className="v7-document-head"><span>{locale === 'ar' ? 'المستند' : 'Document'}</span><span>{locale === 'ar' ? 'الإصدار' : 'Version'}</span><span>{locale === 'ar' ? 'آخر تحديث' : 'Updated'}</span><span>{tx(locale, 'status')}</span><span /></div><div className="v7-document-list">{docs.map(doc => <button key={doc.id} onClick={() => openDocument(doc)}><span className="v7-file-icon"><Icon name="file" size={17} /></span><span className="v7-doc-name"><strong>{doc.display_name}</strong><small>{doc.system_code || doc.document_type || 'document'}</small></span><span className="v7-doc-version">V{doc.version_count || '—'}</span><span className="v7-doc-updated">{formatDate(doc.updated_at, locale)}</span><Badge tone={statusTone(doc.control_status)}>{doc.control_status || 'working'}</Badge><Icon name="chevron" size={15} /></button>)}</div><div className="v7-pager"><Button onClick={() => setPage(value => Math.max(0, value - 1))} disabled={page === 0} icon="arrow">{locale === 'ar' ? 'السابق' : 'Previous'}</Button><span>{locale === 'ar' ? `صفحة ${page + 1}` : `Page ${page + 1}`}</span><Button onClick={() => setPage(value => value + 1)} disabled={!hasMore} icon="chevron">{locale === 'ar' ? 'التالي' : 'Next'}</Button></div></> : <EmptyState icon="file" title={tx(locale, 'noDocuments')} description={!folderId && !searching ? (locale === 'ar' ? 'اختر مجلدًا لعرض مستنداته.' : 'Choose a folder to view its documents.') : searching ? (locale === 'ar' ? 'لا توجد مستندات مطابقة للبحث داخل هذا السياق.' : 'No documents match the search in this context.') : null} />}
      </Panel>
    </div>
    <DocumentDetail documentId={documentId} workspace={workspace} locale={locale} folderOptions={folders} onClose={closeDocument} router={router} onChanged={refreshDocuments} />
    <CdeTrashSheet open={trashOpen} onClose={() => setTrashOpen(false)} workspace={workspace} projectId={projectId} siteId={siteId} locale={locale} canRestore={can(workspace, 'files.restore')} onRestored={refreshDocuments} />
    <FolderControlSheet open={Boolean(folderControl.mode)} onClose={closeFolderControl} mode={folderControl.mode} projectId={projectId} siteId={siteId} folder={folderControl.folder} folders={folders} locale={locale} onDone={folderChanged} />
    <StorageIntelligenceSheet open={storageOpen} onClose={() => setStorageOpen(false)} workspace={workspace} locale={locale} />
    <UploadDocumentsSheet open={uploadOpen} onClose={() => setUploadOpen(false)} workspace={workspace} locale={locale} folderId={folderId} contextLabel={[project?.name, sites.find(site => site.id === siteId)?.name, folders.find(folder => folder.id === folderId)?.name].filter(Boolean).join(' · ')} onUploaded={() => { setUploadOpen(false); setSearchRows(null); setQuery(''); setPage(0); refreshDocuments(); }} />
  </>;
}
