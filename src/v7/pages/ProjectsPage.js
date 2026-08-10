'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { can } from '../lib/workspace';
import { formatDate, statusTone } from '../lib/format';
import { tx } from '../lib/i18n';
import Icon from '../components/Icon';
import ProjectCreateSheet from '../components/ProjectCreateSheet';
import { Badge, Button, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/Primitives';

const filters = ['all', 'active', 'planned', 'on_hold', 'completed'];
const PAGE_SIZE = 36;
const safeSearch = (value) => String(value || '').trim().replace(/[,*()]/g, ' ').replace(/\s+/g, ' ');

export default function ProjectsPage({ workspace, locale }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reload, setReload] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const router = useRouter();

  const canCreate = can(workspace, 'projects.create');
  const usage = Number(workspace.policy?.usage?.active_projects || 0);
  const rawLimit = workspace.policy?.limits?.max_projects;
  const limit = rawLimit === null || rawLimit === undefined ? null : Number(rawLimit);
  const finiteLimit = Number.isFinite(limit) && limit >= 0;
  const atLimit = finiteLimit && usage >= limit;
  const capacity = finiteLimit && limit > 0 ? Math.max(0, Math.min(100, Math.round((usage / limit) * 100))) : 0;

  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(safeSearch(query)), 240);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => { setPage(0); setRows(null); }, [filter, searchTerm, workspace.company.id]);

  useEffect(() => {
    const c = new AbortController();
    setError(null);
    if (page > 0) setLoadingMore(true);
    const filtersMap = {
      company_id: `eq.${workspace.company.id}`,
      ...(filter !== 'all' ? { status: `eq.${filter}` } : {}),
      ...(searchTerm ? { or: `(name.ilike.*${searchTerm}*,code.ilike.*${searchTerm}*,client_name.ilike.*${searchTerm}*)` } : {})
    };
    api.select('projects', { filters: filtersMap, order: 'updated_at.desc', limit: PAGE_SIZE, offset: page * PAGE_SIZE, cacheTtlMs: 12_000, signal: c.signal })
      .then(batch => {
        setRows(prev => page === 0 ? batch : [...(prev || []), ...batch]);
        setHasMore(batch.length === PAGE_SIZE);
      }).catch(err => { if (err?.name !== 'AbortError') setError(err); })
      .finally(() => setLoadingMore(false));
    return () => c.abort();
  }, [workspace.company.id, filter, searchTerm, page, reload]);

  const created = async (project) => {
    setCreateOpen(false);
    if (project?.id) router.push(`/v7/projects/${project.id}`);
    else { setPage(0); setRows(null); setReload(x => x + 1); }
  };

  if (error) return <ErrorState title={tx(locale, 'networkIssue')} description={error.message} retryLabel={tx(locale, 'retry')} onRetry={() => setReload(x => x + 1)} />;
  return <>
    <PageHeader eyebrow="PROJECT DELIVERY" title={tx(locale, 'projectCenter')} description={tx(locale, 'projectCenterSub')} actions={canCreate ? <Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)} disabled={atLimit} title={atLimit ? (locale === 'ar' ? 'تم الوصول إلى حد المشاريع في الباقة' : 'Project plan limit reached') : undefined}>{tx(locale, 'newProject')}</Button> : null} />

    <section className="v7-portfolio-pulse">
      <div className="v7-portfolio-main"><span className="v7-eyebrow">PORTFOLIO CAPACITY</span><strong>{usage} {locale === 'ar' ? 'مشروع نشط' : 'active projects'}</strong><p>{finiteLimit ? (locale === 'ar' ? `تستخدم ${capacity}% من سعة المشاريع المتاحة في الباقة الحالية.` : `Using ${capacity}% of the active-project capacity in the current plan.`) : (locale === 'ar' ? 'لا يوجد حد مشاريع ظاهر في الباقة الحالية.' : 'No visible project cap is applied to the current plan.')}</p></div>
      <div className="v7-portfolio-meter"><div><span>{locale === 'ar' ? 'السعة' : 'Capacity'}</span><strong>{finiteLimit ? `${usage} / ${limit}` : `${usage}`}</strong></div><div className="v7-capacity-track"><i className={capacity >= 90 ? 'is-danger' : capacity >= 75 ? 'is-warning' : ''} style={{ width: finiteLimit ? `${capacity}%` : '18%' }} /></div><small>{atLimit ? (locale === 'ar' ? 'الأرشفة أو تغيير الباقة مطلوب قبل مشروع جديد.' : 'Archive a project or change plan before creating another.') : (locale === 'ar' ? 'المشاريع المؤرشفة لا تستهلك السعة النشطة.' : 'Archived projects do not consume active capacity.')}</small></div>
    </section>

    {atLimit ? <div className="v7-inline-notice"><Icon name="info" size={16} /><div><strong>{locale === 'ar' ? 'تم الوصول لحد المشاريع الحالي' : 'Current project limit reached'}</strong><span>{locale === 'ar' ? `${usage} من ${limit} مشروع نشط. أرشف مشروعًا غير مستخدم أو غيّر الباقة قبل إنشاء مشروع جديد.` : `${usage} of ${limit} active projects. Archive an unused project or change the plan before creating another.`}</span></div></div> : null}

    <div className="v7-toolbar v7-project-toolbar"><div className="v7-search-field"><Icon name="search" size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={tx(locale, 'search')} /></div><div className="v7-segments">{filters.map(value => <button className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)} key={value}>{tx(locale, value === 'on_hold' ? 'onHold' : value)}</button>)}</div><span className="v7-toolbar-count">{rows ? `${rows.length}${hasMore ? '+' : ''}` : '—'} {locale === 'ar' ? 'ظاهر' : 'visible'}</span></div>

    {!rows ? <div className="v7-card-grid"><Skeleton lines={5} className="v7-card-skeleton" /><Skeleton lines={5} className="v7-card-skeleton" /><Skeleton lines={5} className="v7-card-skeleton" /></div> : rows.length ? <>
      <div className="v7-card-grid">{rows.map(project => {
        const progress = Math.max(0, Math.min(100, Number(project.progress_percent || 0)));
        return <button className="v7-project-card v7-project-card--premium" key={project.id} onClick={() => router.push(`/v7/projects/${project.id}`)}>
          <header><span className="v7-project-code">{project.code}</span><Badge tone={statusTone(project.status)}>{project.status}</Badge></header>
          <div className="v7-project-card-copy"><h2>{project.name}</h2><p>{project.description || project.client_name || (locale === 'ar' ? 'لا يوجد وصف إضافي.' : 'No additional description.')}</p></div>
          <div className="v7-project-progress-head"><span>{tx(locale, 'progress')}</span><strong>{progress}%</strong></div>
          <div className="v7-progress"><i style={{ width: `${progress}%` }} /></div>
          <dl><div><dt>{locale === 'ar' ? 'العميل' : 'Client'}</dt><dd>{project.client_name || '—'}</dd></div><div><dt>{tx(locale, 'due')}</dt><dd>{project.target_end_date ? formatDate(project.target_end_date, locale) : '—'}</dd></div></dl>
          <footer><span><Icon name="clock" size={13} />{locale === 'ar' ? 'آخر تحديث' : 'Updated'} {formatDate(project.updated_at, locale)}</span><span className="v7-project-open">{locale === 'ar' ? 'فتح 360' : 'Open 360'} <Icon name="arrow" size={14} /></span></footer>
        </button>;
      })}</div>
      {hasMore ? <div className="v7-load-more"><Button onClick={() => setPage(x => x + 1)} disabled={loadingMore}>{loadingMore ? tx(locale, 'loading') : (locale === 'ar' ? 'عرض المزيد' : 'Load more')}</Button></div> : null}
    </> : <EmptyState icon="briefcase" title={tx(locale, 'noProjects')} description={searchTerm ? (locale === 'ar' ? `لا توجد نتائج مطابقة لـ “${searchTerm}”.` : `No projects match “${searchTerm}”.`) : null} action={canCreate && !atLimit ? <Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>{tx(locale, 'newProject')}</Button> : null} />}
    <ProjectCreateSheet open={createOpen} onClose={() => setCreateOpen(false)} workspace={workspace} locale={locale} onCreated={created} />
  </>;
}
