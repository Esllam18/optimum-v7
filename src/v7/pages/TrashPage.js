'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatDate, normalizeArray } from '../lib/format';
import Icon from '../components/Icon';
import { Badge, Button, EmptyState, ErrorState, PageHeader, Panel, Skeleton } from '../components/Primitives';

export default function TrashPage({ workspace, locale }) {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const c = new AbortController(); setData(null); setError(null);
    const timer = setTimeout(() => {
      api.rpc('trash_query', { p_company_id:workspace.company.id, p_query:query.trim() || null, p_project_id:null, p_site_id:null, p_limit:200, p_offset:0 }, { cacheTtlMs:8_000, signal:c.signal, dedupe:true }).then(setData).catch(err => { if (err?.name !== 'AbortError') setError(err); });
    }, 180);
    return () => { clearTimeout(timer); c.abort(); };
  }, [workspace.company.id, query, reload]);

  const restore = async (kind, id) => {
    setBusy(id); setError(null);
    try { await api.rpc(kind === 'folder' ? 'restore_folder' : 'restore_document', kind === 'folder' ? { p_folder_id:id } : { p_document_id:id }); api.clearReadCache(); setReload(x => x + 1); }
    catch (err) { setError(err); }
    finally { setBusy(''); }
  };
  if (error && !data) return <ErrorState title={locale === 'ar' ? 'تعذر تحميل سلة المحذوفات' : 'Trash could not be loaded'} description={error.message} retryLabel={locale === 'ar' ? 'إعادة المحاولة' : 'Retry'} onRetry={() => setReload(x => x + 1)} />;
  const folders = normalizeArray(data?.folders), documents = normalizeArray(data?.documents);
  return <>
    <PageHeader eyebrow={locale === 'ar' ? 'إدارة الاسترجاع' : 'RECOVERY · RETENTION'} title={locale === 'ar' ? 'سلة المحذوفات' : 'Trash'} description={locale === 'ar' ? 'المجلدات والمستندات المحذوفة قابلة للاسترجاع بدون كسر شجرة CDE أو الإصدارات المرتبطة.' : 'Deleted folders and documents remain recoverable without breaking the CDE tree or linked versions.'} />
    {error ? <div className="v7-inline-error">{error.message}</div> : null}
    <Panel className="v7-trash-panel"><div className="v7-toolbar"><div className="v7-search-field"><Icon name="search" size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={locale === 'ar' ? 'ابحث في سلة المحذوفات…' : 'Search trash…'} /></div>{data?.hidden_descendants ? <Badge tone="neutral">{data.hidden_descendants} {locale === 'ar' ? 'عنصر تابع مخفي' : 'hidden descendants'}</Badge> : null}</div>
      {!data ? <Skeleton lines={9} /> : folders.length || documents.length ? <div className="v7-trash-list">
        {folders.map(row => <article key={`f-${row.id}`}><span><Icon name="folder" size={17} /></span><div><strong>{row.name}</strong><small>{row.project_name || '—'}{row.site_name ? ` · ${row.site_name}` : ''}</small></div><span><small>{locale === 'ar' ? 'حُذف بواسطة' : 'Deleted by'}</small><strong>{row.trashed_by_name || '—'}</strong></span><span>{formatDate(row.trashed_at, locale)}</span><Button icon="refresh" disabled={busy === row.id} onClick={() => restore('folder', row.id)}>{locale === 'ar' ? 'استرجاع' : 'Restore'}</Button></article>)}
        {documents.map(row => <article key={`d-${row.id}`}><span><Icon name="file" size={17} /></span><div><strong>{row.display_name}</strong><small>{row.project_name || '—'}{row.document_type ? ` · ${row.document_type}` : ''}</small></div><span><small>{locale === 'ar' ? 'حُذف بواسطة' : 'Deleted by'}</small><strong>{row.trashed_by_name || '—'}</strong></span><span>{formatDate(row.trashed_at, locale)}</span><Button icon="refresh" disabled={busy === row.id} onClick={() => restore('document', row.id)}>{locale === 'ar' ? 'استرجاع' : 'Restore'}</Button></article>)}
      </div> : <EmptyState icon="trash" title={locale === 'ar' ? 'سلة المحذوفات فارغة' : 'Trash is empty'} description={locale === 'ar' ? 'لا توجد عناصر محذوفة ضمن نطاق وصولك.' : 'No deleted items are visible in your access scope.'} />}
    </Panel>
  </>;
}
