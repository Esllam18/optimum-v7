'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatBytes, normalizeArray } from '../lib/format';
import SideSheet from './SideSheet';
import Icon from './Icon';
import { EmptyState, ErrorState, Skeleton, Stat } from './Primitives';

export default function StorageIntelligenceSheet({ open, onClose, workspace, locale }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) { setData(null); setError(null); return; }
    const c = new AbortController();
    api.rpc('company_storage_intelligence', { p_company_id: workspace.company.id }, { cacheTtlMs: 20_000, signal: c.signal, dedupe: true })
      .then(setData).catch(err => { if (err?.name !== 'AbortError') setError(err); });
    return () => c.abort();
  }, [open, workspace.company.id]);

  const max = Number(data?.max_storage_bytes || 0);
  const used = Number(data?.used_bytes || 0);
  const utilization = max > 0 ? Math.round(used / max * 1000) / 10 : null;

  return <SideSheet open={open} onClose={onClose} eyebrow="STORAGE INTELLIGENCE" title={locale === 'ar' ? 'ذكاء التخزين' : 'Storage intelligence'} subtitle={locale === 'ar' ? 'استهلاك التخزين والإصدارات القديمة وسلة CDE ضمن نطاق رؤيتك.' : 'Storage usage, old versions and CDE trash within your visible scope.'}>
    {error ? <ErrorState title={locale === 'ar' ? 'تعذر تحميل التخزين' : 'Could not load storage'} description={error.message} /> : !data ? <Skeleton lines={9} /> : <>
      <div className="v7-stats-grid"><Stat icon="archive" label={locale === 'ar' ? 'المستخدم' : 'Used'} value={formatBytes(used, locale)} note={utilization === null ? (locale === 'ar' ? 'لا يوجد حد ظاهر' : 'No visible limit') : `${utilization}%`} /><Stat icon="trash" label={locale === 'ar' ? 'داخل السلة' : 'Trash'} value={formatBytes(data.trash_bytes || 0, locale)} /><Stat icon="layers" label={locale === 'ar' ? 'إصدارات قديمة' : 'Old versions'} value={formatBytes(data.old_version_bytes || 0, locale)} /><Stat icon="shield" label={locale === 'ar' ? 'حد الباقة' : 'Plan limit'} value={max ? formatBytes(max, locale) : '—'} /></div>
      <div className="v7-detail-section"><h3>{locale === 'ar' ? 'أكبر الملفات' : 'Largest files'}</h3>{normalizeArray(data.largest_files).length ? <div className="v7-linked-list">{normalizeArray(data.largest_files).map(row => <article key={row.id}><Icon name="file" size={15} /><span><strong>{row.display_name}</strong><small>{formatBytes(row.size_bytes || 0, locale)}</small></span></article>)}</div> : <EmptyState icon="file" title={locale === 'ar' ? 'لا توجد ملفات' : 'No files'} />}</div>
      <div className="v7-detail-section"><h3>{locale === 'ar' ? 'حسب المشروع' : 'By project'}</h3>{normalizeArray(data.by_project).length ? <div className="v7-linked-list">{normalizeArray(data.by_project).map(row => <article key={row.id}><Icon name="briefcase" size={15} /><span><strong>{row.code} · {row.name}</strong><small>{formatBytes(row.bytes || 0, locale)}</small></span></article>)}</div> : <EmptyState icon="briefcase" title={locale === 'ar' ? 'لا توجد بيانات' : 'No data'} />}</div>
      <div className="v7-detail-section"><h3>{locale === 'ar' ? 'حسب نوع المستند' : 'By document type'}</h3>{normalizeArray(data.by_type).length ? <div className="v7-linked-list">{normalizeArray(data.by_type).map(row => <article key={row.document_type || 'general'}><Icon name="layers" size={15} /><span><strong>{row.document_type || 'general'}</strong><small>{row.documents || 0} {locale === 'ar' ? 'مستند' : 'documents'} · {formatBytes(row.bytes || 0, locale)}</small></span></article>)}</div> : <EmptyState icon="layers" title={locale === 'ar' ? 'لا توجد بيانات' : 'No data'} />}</div>
    </>}
  </SideSheet>;
}
