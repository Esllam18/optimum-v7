'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatBytes, formatDate, normalizeArray } from '../lib/format';
import SideSheet from './SideSheet';
import Icon from './Icon';
import { Button, EmptyState, Skeleton } from './Primitives';

export default function CdeTrashSheet({ open, onClose, workspace, projectId, siteId, locale, canRestore = false, onRestored }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!open) { setData(null); setError(''); return; }
    const c = new AbortController(); setData(null); setError('');
    api.rpc('trash_query', {
      p_company_id: workspace.company.id, p_query: '', p_project_id: projectId || null,
      p_site_id: siteId || null, p_limit: 100, p_offset: 0
    }, { signal: c.signal, dedupe: true }).then(setData).catch(err => { if (err?.name !== 'AbortError') setError(err.message); });
    return () => c.abort();
  }, [open, workspace.company.id, projectId, siteId, reload]);

  const restore = async doc => {
    if (!doc?.id || restoring) return;
    setRestoring(doc.id); setError('');
    try {
      await api.rpc('restore_document', { p_document_id: doc.id });
      api.clearReadCache(); setReload(value => value + 1); await onRestored?.(doc);
    } catch (err) { setError(err.message || (locale === 'ar' ? 'تعذر استعادة المستند.' : 'Could not restore the document.')); }
    finally { setRestoring(''); }
  };

  const docs = normalizeArray(data?.documents);
  return <SideSheet open={open} onClose={restoring ? undefined : onClose} eyebrow="CDE TRASH" title={locale === 'ar' ? 'سلة المستندات' : 'Document trash'} subtitle={locale === 'ar' ? 'الاستعادة تعيد نفس السجل والإصدارات، ولا تنشئ نسخة جديدة.' : 'Restore keeps the same canonical record and version history.'}>
    {error ? <div className="v7-form-error">{error}</div> : null}
    {!data ? <Skeleton lines={8} /> : docs.length ? <div className="v7-trash-list">{docs.map(doc => <article key={doc.id}><span className="v7-file-icon"><Icon name="file" size={16} /></span><div><strong>{doc.display_name}</strong><small>{doc.project_name || ''}{doc.site_name ? ` · ${doc.site_name}` : ''} · {formatBytes(doc.size_bytes || 0, locale)} · {formatDate(doc.trashed_at, locale)}</small></div>{canRestore ? <Button icon="refresh" onClick={() => restore(doc)} disabled={Boolean(restoring)}>{restoring === doc.id ? (locale === 'ar' ? 'جارٍ الاستعادة…' : 'Restoring…') : (locale === 'ar' ? 'استعادة' : 'Restore')}</Button> : null}</article>)}</div> : <EmptyState icon="trash" title={locale === 'ar' ? 'السلة فارغة في هذا السياق' : 'Trash is empty in this context'} />}
    {Number(data?.hidden_descendants || 0) > 0 ? <div className="v7-control-hint">{locale === 'ar' ? `${data.hidden_descendants} عنصر تابع لمجلد محذوف لا يظهر منفردًا؛ تتم استعادته مع المجلد الأب.` : `${data.hidden_descendants} descendant item(s) belong to trashed folders and are restored with their parent folder.`}</div> : null}
  </SideSheet>;
}
