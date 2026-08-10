'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatDate, normalizeArray } from '../lib/format';
import Icon from '../components/Icon';
import { Badge, Button, EmptyState, ErrorState, PageHeader, Panel, Skeleton } from '../components/Primitives';

const actionLabel = (locale, item) => {
  const labels = {
    task_created: ['تم إنشاء مهمة', 'Task created'], task_status_changed: ['تغيرت حالة مهمة', 'Task status changed'], task_updated: ['تم تعديل مهمة', 'Task updated'], task_comment_added: ['أضيف تعليق على مهمة', 'Task comment added'], task_claimed: ['تم استلام مهمة', 'Task claimed'], task_checklist_changed: ['تغيرت قائمة تحقق', 'Checklist changed'], member_changed: ['تغيرت بيانات عضو', 'Member changed'], role_changed: ['تغير دور أو صلاحية', 'Role changed'], engineering_changed: ['تغيرت بيانات هندسية', 'Engineering changed'], file_changed: ['تغير مستند أو إصدار', 'Document changed'], folder_changed: ['تغير مجلد', 'Folder changed'], system_changed: ['حدث نظام', 'System event']
  };
  return labels[item.human_key]?.[locale === 'ar' ? 0 : 1] || item.action;
};

export default function ActivityPage({ workspace, locale }) {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const c = new AbortController();
    setData(null); setError(null);
    api.rpc('work_activity_feed', {
      p_company_id: workspace.company.id,
      p_mode: 'audit',
      p_filters: { search: search.trim(), action, from: from || '', to: to ? `${to}T23:59:59.999Z` : '' },
      p_limit: 60,
      p_offset: page * 60
    }, { cacheTtlMs: 8_000, signal: c.signal, dedupe: true }).then(setData).catch(err => { if (err?.name !== 'AbortError') setError(err); });
    return () => c.abort();
  }, [workspace.company.id, search, action, from, to, page, reload]);

  if (error) return <ErrorState title={locale === 'ar' ? 'تعذر تحميل سجل النشاط' : 'Activity log could not be loaded'} description={error.message} retryLabel={locale === 'ar' ? 'إعادة المحاولة' : 'Retry'} onRetry={() => setReload(x => x + 1)} />;
  const items = normalizeArray(data?.items);
  return <>
    <PageHeader eyebrow={locale === 'ar' ? 'التدقيق والتتبع' : 'AUDIT · TRACEABILITY'} title={locale === 'ar' ? 'سجل النشاط' : 'Activity & audit'} description={locale === 'ar' ? 'سجل قابل للبحث لكل التغييرات التشغيلية المهمة: العمل، الفريق، الأدوار، المستندات والهندسة.' : 'Searchable trace of meaningful operational changes across work, people, roles, documents and engineering.'} actions={<Button icon="refresh" onClick={() => setReload(x => x + 1)}>{locale === 'ar' ? 'تحديث' : 'Refresh'}</Button>} />
    <Panel className="v7-audit-panel">
      <div className="v7-audit-toolbar"><div className="v7-search-field"><Icon name="search" size={16} /><input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder={locale === 'ar' ? 'ابحث في النشاط…' : 'Search activity…'} /></div><select value={action} onChange={e => { setAction(e.target.value); setPage(0); }}><option value="all">{locale === 'ar' ? 'كل الأحداث' : 'All events'}</option><option value="task.created">{locale === 'ar' ? 'إنشاء مهام' : 'Task created'}</option><option value="task.status_changed">{locale === 'ar' ? 'حالات المهام' : 'Task status'}</option><option value="task.updated">{locale === 'ar' ? 'تعديل مهام' : 'Task updated'}</option><option value="member.updated">{locale === 'ar' ? 'الأعضاء' : 'Members'}</option></select><input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(0); }} /><input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(0); }} /></div>
      {!data ? <Skeleton lines={10} /> : items.length ? <div className="v7-audit-list">{items.map(item => <article key={item.id}><span className="v7-audit-icon"><Icon name={item.human_key?.startsWith('task') ? 'check' : item.human_key === 'file_changed' ? 'file' : item.human_key === 'role_changed' ? 'shield' : 'activity'} size={16} /></span><div><strong>{actionLabel(locale, item)}</strong><small>{item.entity_title || item.entity_type || '—'}</small><code>{item.action}</code></div><span className="v7-audit-actor"><strong>{item.actor_name || (locale === 'ar' ? 'النظام' : 'System')}</strong><small>{formatDate(item.created_at, locale)}</small></span></article>)}</div> : <EmptyState icon="activity" title={locale === 'ar' ? 'لا يوجد نشاط مطابق' : 'No matching activity'} />}
      {data ? <div className="v7-pagination"><span>{data.total ?? items.length} {locale === 'ar' ? 'حدث' : 'events'}</span><div><Button onClick={() => setPage(x => Math.max(0, x - 1))} disabled={page === 0}>←</Button><Button onClick={() => setPage(x => x + 1)} disabled={!data.has_more}>→</Button></div></div> : null}
    </Panel>
  </>;
}
